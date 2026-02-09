import { access, lstat, mkdir, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

export type ToolName = "claude" | "codex" | "cursor" | "windsurf" | "gemini" | "copilot";

const TOOL_MARKERS: Record<ToolName, string> = {
  claude: ".claude",
  codex: ".codex",
  cursor: ".cursor",
  windsurf: ".windsurf",
  gemini: ".gemini",
  copilot: ".github"
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const removeIfExists = async (target: string): Promise<void> => {
  try {
    await rm(target, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
};

const ensureSymlink = async (target: string, linkPath: string): Promise<void> => {
  await removeIfExists(linkPath);
  try {
    await symlink(target, linkPath);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") {
      throw new Error(
        `Failed to create symlink at ${linkPath}. On Windows, enable Developer Mode or run with admin privileges.`
      );
    }
    throw error;
  }
};

const listMarkdownFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stats = await lstat(fullPath);
    if (stats.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (stats.isFile() && entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
};

export const detectTools = async (projectRoot: string): Promise<ToolName[]> => {
  const detected: ToolName[] = [];
  for (const [tool, marker] of Object.entries(TOOL_MARKERS) as [ToolName, string][]) {
    if (await pathExists(path.join(projectRoot, marker))) {
      detected.push(tool);
    }
  }
  return detected;
};

const normalizeTargets = (targets?: string[]): ToolName[] => {
  if (!targets) {
    return [];
  }
  return targets.map((target) => target.toLowerCase() as ToolName);
};

const assertTargets = (targets: ToolName[]): void => {
  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(TOOL_MARKERS, target)) {
      throw new Error(`Unknown tool target: ${target}`);
    }
  }
};

export const linkToolTargets = async (input: {
  projectRoot: string;
  skillName: string;
  agentTargets?: string[];
}): Promise<ToolName[]> => {
  const { projectRoot, skillName } = input;
  const targets = normalizeTargets(input.agentTargets);
  assertTargets(targets);
  const tools = targets.length > 0 ? targets : await detectTools(projectRoot);

  const skillPath = path.join(projectRoot, ".agents", "skills", skillName);

  for (const tool of tools) {
    if (tool === "claude") {
      const linkPath = path.join(projectRoot, ".claude", "agents", skillName);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await ensureSymlink(skillPath, linkPath);
      continue;
    }

    if (tool === "codex") {
      const linkPath = path.join(projectRoot, ".codex", skillName);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await ensureSymlink(skillPath, linkPath);
      continue;
    }

    if (tool === "cursor") {
      const rulesRoot = path.join(projectRoot, ".cursor", "rules", skillName);
      await mkdir(rulesRoot, { recursive: true });
      const markdownFiles = await listMarkdownFiles(skillPath);
      for (const filePath of markdownFiles) {
        const relative = path.relative(skillPath, filePath);
        const targetName = relative.replace(/\.md$/, ".mdc");
        const linkPath = path.join(rulesRoot, targetName);
        await mkdir(path.dirname(linkPath), { recursive: true });
        await ensureSymlink(filePath, linkPath);
      }
      continue;
    }

    if (tool === "windsurf") {
      const linkPath = path.join(projectRoot, ".windsurf", "rules", skillName);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await ensureSymlink(skillPath, linkPath);
      continue;
    }

    if (tool === "gemini") {
      const linkPath = path.join(projectRoot, ".gemini", "rules", skillName);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await ensureSymlink(skillPath, linkPath);
      continue;
    }

    if (tool === "copilot") {
      const linkPath = path.join(projectRoot, ".github", skillName);
      await mkdir(path.dirname(linkPath), { recursive: true });
      await ensureSymlink(skillPath, linkPath);
    }
  }

  return tools;
};

export const readLinkTarget = async (linkPath: string): Promise<string | null> => {
  try {
    const stats = await lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return null;
    }
    return await import("node:fs/promises").then((fs) => fs.readlink(linkPath));
  } catch {
    return null;
  }
};
