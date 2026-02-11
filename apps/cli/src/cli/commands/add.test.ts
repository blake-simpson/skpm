import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "./add";
import type { CommandContext } from "./shared";

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

const createTempProject = async (skills: Record<string, string> = {}): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skpm-add-"));
  const manifest = { name: "test-project", skills };
  await writeFile(path.join(root, "skpm.json"), JSON.stringify(manifest, null, 2), "utf-8");
  return root;
};

describe("runAdd", () => {
  it("restores original manifest when install fails", async () => {
    const projectRoot = await createTempProject({ existing: "^1.0.0" });

    const context: CommandContext = {
      projectRoot,
      registryOverride: path.join(projectRoot, "nonexistent-registry"),
      logger: silentLogger
    };

    const originalContents = await readFile(path.join(projectRoot, "skpm.json"), "utf-8");

    await expect(runAdd(context, { spec: "bad-skill" })).rejects.toThrow();

    const afterContents = await readFile(path.join(projectRoot, "skpm.json"), "utf-8");
    expect(afterContents).toBe(originalContents);
  });

  it("preserves updated manifest when install succeeds", async () => {
    const projectRoot = await createTempProject();

    const registryRoot = path.join(projectRoot, "registry");
    const packageDir = path.join(registryRoot, "packages", "test-skill");
    const tarballDir = path.join(registryRoot, "tarballs", "test-skill");
    await mkdir(packageDir, { recursive: true });
    await mkdir(tarballDir, { recursive: true });

    await writeFile(
      path.join(registryRoot, "index.json"),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        packages: {
          "test-skill": {
            name: "test-skill",
            description: "A test skill",
            latest: "1.0.0",
            versions: ["1.0.0"]
          }
        }
      }),
      "utf-8"
    );

    const skillDir = path.join(projectRoot, "skill-content");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "skill.md"), "# Test Skill");

    const { hashDirectory } = await import("../../utils/integrity");
    const integrity = await hashDirectory(skillDir);

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const tarPath = path.join(tarballDir, "1.0.0.tgz");
    await execFileAsync("tar", ["-czf", tarPath, "-C", skillDir, "."]);

    await writeFile(
      path.join(packageDir, "index.json"),
      JSON.stringify({
        name: "test-skill",
        description: "A test skill",
        versions: {
          "1.0.0": {
            manifest: {
              name: "test-skill",
              version: "1.0.0",
              description: "A test skill",
              dependencies: {},
              files: ["skill.md"],
              license: "MIT",
              author: "Test"
            },
            integrity,
            tarball: "tarballs/test-skill/1.0.0.tgz"
          }
        }
      }),
      "utf-8"
    );

    const context: CommandContext = {
      projectRoot,
      registryOverride: registryRoot,
      logger: silentLogger
    };

    await runAdd(context, { spec: "test-skill@1.0.0" });

    const afterContents = await readFile(path.join(projectRoot, "skpm.json"), "utf-8");
    const parsed = JSON.parse(afterContents) as { skills: Record<string, string> };
    expect(parsed.skills["test-skill"]).toBe("1.0.0");
  });
});
