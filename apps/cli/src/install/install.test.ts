import { lstat, mkdtemp, mkdir, readlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installTopLevelSkill } from "./install";

describe("install pipeline", () => {
  it("installs a cached package into the store and exposes it", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-project-"));
    const cachedRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-cache-"));
    const cachedSkill = path.join(cachedRoot, "frontend");
    await mkdir(cachedSkill, { recursive: true });
    await writeFile(path.join(cachedSkill, "README.md"), "# frontend");

    await installTopLevelSkill({
      projectRoot,
      name: "frontend",
      version: "1.0.0",
      cachedPath: cachedSkill,
      agentTargets: ["codex"]
    });

    const storePath = path.join(
      projectRoot,
      ".agents",
      "skills",
      ".store",
      "frontend@1.0.0"
    );
    const storeStats = await lstat(storePath);
    expect(storeStats.isDirectory()).toBe(true);

    const exposed = path.join(projectRoot, ".agents", "skills", "frontend");
    const exposedStats = await lstat(exposed);
    expect(exposedStats.isSymbolicLink()).toBe(true);
    const exposedTarget = await readlink(exposed);
    expect(exposedTarget).toBe(storePath);

    const codexLink = path.join(projectRoot, ".codex", "frontend");
    const codexStats = await lstat(codexLink);
    expect(codexStats.isSymbolicLink()).toBe(true);
  });
});
