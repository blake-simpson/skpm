import { lstat, mkdtemp, mkdir, readlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectTools, linkToolTargets } from "./tools";

describe("tool integration", () => {
  it("detects tools by marker directories", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-project-"));
    await mkdir(path.join(projectRoot, ".claude"), { recursive: true });
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    const tools = await detectTools(projectRoot);
    expect(tools).toContain("claude");
    expect(tools).toContain("codex");
  });

  it("links codex and cursor targets", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-project-"));
    await mkdir(path.join(projectRoot, ".codex"), { recursive: true });
    await mkdir(path.join(projectRoot, ".cursor"), { recursive: true });
    const skillRoot = path.join(projectRoot, ".agents", "skills", "frontend");
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "RULES.md"), "# Rules");
    const skillEntries = await import("node:fs/promises").then((fs) =>
      fs.readdir(skillRoot)
    );
    expect(skillEntries).toContain("RULES.md");

    await linkToolTargets({
      projectRoot,
      skillName: "frontend",
      agentTargets: undefined
    });

    const codexLink = path.join(projectRoot, ".codex", "frontend");
    const codexStats = await lstat(codexLink);
    expect(codexStats.isSymbolicLink()).toBe(true);
    const codexTarget = await readlink(codexLink);
    expect(codexTarget).toContain(path.join(".agents", "skills", "frontend"));

    const cursorLink = path.join(projectRoot, ".cursor", "rules", "frontend", "RULES.mdc");
    const cursorEntries = await import("node:fs/promises").then((fs) =>
      fs.readdir(path.join(projectRoot, ".cursor", "rules", "frontend"))
    );
    expect(cursorEntries).toContain("RULES.mdc");
    const cursorStats = await lstat(cursorLink);
    expect(cursorStats.isSymbolicLink()).toBe(true);
  });
});
