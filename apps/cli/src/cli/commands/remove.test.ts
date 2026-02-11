import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRemove } from "./remove";
import type { CommandContext } from "./shared";

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const createTempProject = async (
  skills: Record<string, string> = {}
): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skpm-remove-"));
  const manifest = { name: "test-project", skills };
  await writeFile(path.join(root, "skpm.json"), JSON.stringify(manifest, null, 2), "utf-8");
  return root;
};

const setupRegistry = async (
  registryRoot: string,
  packages: Array<{
    name: string;
    version: string;
    description: string;
    dependencies: Record<string, string>;
    integrity: string;
  }>
): Promise<void> => {
  const rootIndex = {
    generatedAt: new Date().toISOString(),
    packages: Object.fromEntries(
      packages.map((pkg) => [
        pkg.name,
        {
          name: pkg.name,
          description: pkg.description,
          latest: pkg.version,
          versions: [pkg.version]
        }
      ])
    )
  };
  await writeFile(path.join(registryRoot, "index.json"), JSON.stringify(rootIndex, null, 2));

  for (const pkg of packages) {
    const pkgDir = path.join(registryRoot, "packages", pkg.name);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      path.join(pkgDir, "index.json"),
      JSON.stringify({
        name: pkg.name,
        description: pkg.description,
        versions: {
          [pkg.version]: {
            manifest: {
              name: pkg.name,
              version: pkg.version,
              description: pkg.description,
              dependencies: pkg.dependencies,
              files: ["skill.md"],
              license: "MIT",
              author: "Test"
            },
            integrity: pkg.integrity,
            tarball: `tarballs/${pkg.name}/${pkg.version}.tgz`
          }
        }
      }),
      "utf-8"
    );
  }
};

const setupTarball = async (
  registryRoot: string,
  name: string,
  version: string,
  content: string
): Promise<string> => {
  const contentDir = path.join(registryRoot, `_content_${name}_${version}`);
  await mkdir(contentDir, { recursive: true });
  await writeFile(path.join(contentDir, "skill.md"), content);

  const tarballDir = path.join(registryRoot, "tarballs", name);
  await mkdir(tarballDir, { recursive: true });
  const tarPath = path.join(tarballDir, `${version}.tgz`);

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  await execFileAsync("tar", ["-czf", tarPath, "-C", contentDir, "."]);

  const { hashDirectory } = await import("../../utils/integrity");
  return hashDirectory(contentDir);
};

describe("runRemove", () => {
  it("cleans up orphaned .store entries after remove", async () => {
    const projectRoot = await createTempProject({ foo: "1.0.0" });
    const registryRoot = path.join(projectRoot, "registry");
    await mkdir(registryRoot, { recursive: true });

    const integrity = await setupTarball(registryRoot, "foo", "1.0.0", "# Foo Skill");

    await setupRegistry(registryRoot, [
      { name: "foo", version: "1.0.0", description: "Foo skill", dependencies: {}, integrity }
    ]);

    const context: CommandContext = {
      projectRoot,
      registryOverride: registryRoot,
      logger: silentLogger
    };

    const { runInstall } = await import("./install");
    await runInstall(context);

    const storeEntry = path.join(projectRoot, ".agents", "skills", ".store", "foo@1.0.0");
    expect(await pathExists(storeEntry)).toBe(true);

    await runRemove(context, { name: "foo" });

    expect(await pathExists(storeEntry)).toBe(false);
  });

  it("preserves .store entries still referenced by lockfile", async () => {
    const projectRoot = await createTempProject({ foo: "1.0.0", bar: "1.0.0" });
    const registryRoot = path.join(projectRoot, "registry");
    await mkdir(registryRoot, { recursive: true });

    const fooIntegrity = await setupTarball(registryRoot, "foo", "1.0.0", "# Foo");
    const barIntegrity = await setupTarball(registryRoot, "bar", "1.0.0", "# Bar");

    await setupRegistry(registryRoot, [
      { name: "foo", version: "1.0.0", description: "Foo", dependencies: {}, integrity: fooIntegrity },
      { name: "bar", version: "1.0.0", description: "Bar", dependencies: {}, integrity: barIntegrity }
    ]);

    const context: CommandContext = {
      projectRoot,
      registryOverride: registryRoot,
      logger: silentLogger
    };

    const { runInstall } = await import("./install");
    await runInstall(context);

    const fooStore = path.join(projectRoot, ".agents", "skills", ".store", "foo@1.0.0");
    const barStore = path.join(projectRoot, ".agents", "skills", ".store", "bar@1.0.0");
    expect(await pathExists(fooStore)).toBe(true);
    expect(await pathExists(barStore)).toBe(true);

    await runRemove(context, { name: "foo" });

    expect(await pathExists(fooStore)).toBe(false);
    expect(await pathExists(barStore)).toBe(true);
  });
});
