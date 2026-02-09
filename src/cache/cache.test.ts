import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { ensurePackageCached, getCachedPackagePath } from "./cache";
import { ensureRegistry } from "../registry/registry";
import { hashDirectory } from "../utils/integrity";

const execFileAsync = promisify(execFile);

const createRegistryPackage = async (root: string): Promise<{
  name: string;
  version: string;
  registryUrl: string;
}> => {
  const name = "frontend";
  const version = "1.2.0";
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-package-"));
  await mkdir(path.join(packageRoot, "skills"), { recursive: true });
  await writeFile(path.join(packageRoot, "skills", "demo.md"), `# ${name}`);
  await writeFile(
    path.join(packageRoot, "skpm.json"),
    JSON.stringify(
      {
        name,
        version,
        description: `${name} skills`,
        dependencies: {},
        files: ["skills/**"],
        license: "MIT",
        author: "Tests"
      },
      null,
      2
    )
  );

  const tarballDir = path.join(root, "tarballs", name);
  await mkdir(tarballDir, { recursive: true });
  const tarballPath = path.join(tarballDir, `${version}.tgz`);
  await execFileAsync("tar", ["-czf", tarballPath, "-C", packageRoot, "skills", "skpm.json"]);

  const integrity = await hashDirectory(packageRoot);

  const packageIndexDir = path.join(root, "packages", name);
  await mkdir(packageIndexDir, { recursive: true });
  await writeFile(
    path.join(root, "index.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        packages: {
          [name]: {
            name,
            description: `${name} skills`,
            latest: version,
            versions: [version]
          }
        }
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(packageIndexDir, "index.json"),
    JSON.stringify(
      {
        name,
        description: `${name} skills`,
        versions: {
          [version]: {
            manifest: {
              name,
              version,
              description: `${name} skills`,
              dependencies: {},
              files: ["skills/**"],
              license: "MIT",
              author: "Tests"
            },
            integrity,
            tarball: `tarballs/${name}/${version}.tgz`
          }
        }
      },
      null,
      2
    )
  );

  return { name, version, registryUrl: pathToFileURL(root).toString() };
};

describe("cache", () => {
  it("copies packages into the global cache", async () => {
    const registryRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
    const packageInfo = await createRegistryPackage(registryRoot);
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-cache-"));

    const registryPath = await ensureRegistry({
      registryUrl: packageInfo.registryUrl,
      baseDir: cacheRoot
    });

    const cachedPath = await ensurePackageCached({
      registryUrl: packageInfo.registryUrl,
      registryPath,
      name: packageInfo.name,
      version: packageInfo.version,
      baseDir: cacheRoot
    });

    const expectedPath = getCachedPackagePath({
      name: packageInfo.name,
      version: packageInfo.version,
      baseDir: cacheRoot
    });
    expect(cachedPath).toBe(expectedPath);
    const doc = await readFile(path.join(cachedPath, "skills", "demo.md"), "utf-8");
    expect(doc).toContain("frontend");
  });
});
