import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publishPackage } from "./publish";
import type { GitRunner } from "../registry/registry";

const execFileAsync = promisify(execFile);

const createBareRegistry = async (): Promise<{
  origin: string;
  root: string;
  gitEnv: NodeJS.ProcessEnv;
}> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
  const origin = path.join(root, "registry.git");
  await execFileAsync("git", ["init", "--bare", origin]);

  const seed = path.join(root, "seed");
  await mkdir(seed, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: seed });
  await execFileAsync("git", ["checkout", "-b", "main"], { cwd: seed });

  await mkdir(path.join(seed, "skills"), { recursive: true });
  await writeFile(path.join(seed, "skills", ".keep"), "");

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com"
  };

  await execFileAsync("git", ["add", "."], { cwd: seed, env: gitEnv });
  await execFileAsync("git", ["commit", "-m", "seed"], { cwd: seed, env: gitEnv });
  await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: seed });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: seed, env: gitEnv });

  return { origin, root, gitEnv };
};

describe("publish", () => {
  it("publishes a package to the registry", async () => {
    const { origin, root, gitEnv } = await createBareRegistry();

    const packageRoot = path.join(root, "package");
    await mkdir(path.join(packageRoot, "skills"), { recursive: true });
    await writeFile(path.join(packageRoot, "skills", "demo.md"), "hello");
    await writeFile(
      path.join(packageRoot, "skpm.json"),
      JSON.stringify(
        {
          name: "demo-skill",
          version: "1.0.0",
          description: "Demo skill",
          dependencies: {},
          files: ["skills/**"],
          license: "MIT",
          author: "Tests",
          skills: [{ source: "skills/demo.md" }]
        },
        null,
        2
      )
    );

    const git: GitRunner = async (args, options) => {
      const result = await execFileAsync("git", args, { cwd: options?.cwd, env: gitEnv });
      return result.stdout.trim();
    };

    const result = await publishPackage({
      packageRoot,
      registryUrl: origin,
      registryBaseDir: path.join(root, "registry-cache"),
      git
    });

    const publishedManifest = await readFile(
      path.join(result.destination, "skpm.json"),
      "utf-8"
    );
    const publishedSkill = await readFile(
      path.join(result.destination, "skills", "demo.md"),
      "utf-8"
    );

    expect(JSON.parse(publishedManifest).name).toBe("demo-skill");
    expect(publishedSkill).toBe("hello");
  });

  it("fails when file patterns match nothing", async () => {
    const { origin, root, gitEnv } = await createBareRegistry();

    const packageRoot = path.join(root, "bad-package");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, "skpm.json"),
      JSON.stringify(
        {
          name: "bad-skill",
          version: "0.1.0",
          description: "Bad skill",
          dependencies: {},
          files: ["missing/**"],
          license: "MIT",
          author: "Tests"
        },
        null,
        2
      )
    );

    const git: GitRunner = async (args, options) => {
      const result = await execFileAsync("git", args, { cwd: options?.cwd, env: gitEnv });
      return result.stdout.trim();
    };

    await expect(
      publishPackage({
        packageRoot,
        registryUrl: origin,
        registryBaseDir: path.join(root, "registry-cache-bad"),
        git
      })
    ).rejects.toThrow(/No files match pattern/);
  });
});
