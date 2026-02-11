import { access, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { ProjectManifest } from "../../types";
import { readLockfile } from "../../lockfile/lockfile";
import { runInstall } from "./install";
import {
  CommandContext,
  getLogger,
  getLockfilePath,
  loadProjectManifestOrThrow,
  writeProjectManifest
} from "./shared";

export type RemoveOptions = {
  name: string;
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
  await rm(target, { recursive: true, force: true });
};

const removeToolLinks = async (projectRoot: string, name: string): Promise<void> => {
  const targets = [
    path.join(projectRoot, ".claude", "agents", name),
    path.join(projectRoot, ".codex", name),
    path.join(projectRoot, ".cursor", "rules", name),
    path.join(projectRoot, ".windsurf", "rules", name),
    path.join(projectRoot, ".gemini", "rules", name),
    path.join(projectRoot, ".github", name)
  ];

  for (const target of targets) {
    await removeIfExists(target);
  }
};

const cleanOrphanedStoreEntries = async (projectRoot: string): Promise<void> => {
  const storeDir = path.join(projectRoot, ".agents", "skills", ".store");
  if (!(await pathExists(storeDir))) {
    return;
  }

  const lockfilePath = getLockfilePath(projectRoot);
  let referencedKeys: Set<string>;
  try {
    const lockfile = await readLockfile(lockfilePath);
    referencedKeys = new Set(Object.keys(lockfile.packages));
  } catch {
    referencedKeys = new Set();
  }

  const entries = await readdir(storeDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!entry.name.includes("@")) {
      continue;
    }
    if (!referencedKeys.has(entry.name)) {
      await removeIfExists(path.join(storeDir, entry.name));
    }
  }
};

export const runRemove = async (
  context: CommandContext,
  options: RemoveOptions
): Promise<ProjectManifest | void> => {
  const logger = getLogger(context);
  const manifest = await loadProjectManifestOrThrow(context.projectRoot);

  if (!Object.prototype.hasOwnProperty.call(manifest.skills, options.name)) {
    throw new Error(`Skill not found in skpm.json: ${options.name}`);
  }

  const updated: ProjectManifest = {
    ...manifest,
    skills: Object.fromEntries(
      Object.entries(manifest.skills).filter(([name]) => name !== options.name)
    )
  };

  await writeProjectManifest(context.projectRoot, updated);

  await removeIfExists(path.join(context.projectRoot, ".agents", "skills", options.name));
  await removeToolLinks(context.projectRoot, options.name);

  await runInstall(context);
  await cleanOrphanedStoreEntries(context.projectRoot);

  if (!context.json) {
    logger.log(`Removed ${options.name} from skpm.json.`);
  }

  return context.json ? updated : undefined;
};
