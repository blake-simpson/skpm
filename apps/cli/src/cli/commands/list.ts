import { access } from "node:fs/promises";
import { readLockfile } from "../../lockfile/lockfile";
import { CommandContext, getLockfilePath, getLogger, loadProjectManifestOrThrow } from "./shared";

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const resolveVersions = (
  packages: Record<string, { name: string; version: string }>
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const pkg of Object.values(packages)) {
    if (!map.has(pkg.name)) {
      map.set(pkg.name, pkg.version);
    }
  }
  return map;
};

export const runList = async (context: CommandContext): Promise<unknown | void> => {
  const logger = getLogger(context);
  const manifest = await loadProjectManifestOrThrow(context.projectRoot);
  const lockfilePath = getLockfilePath(context.projectRoot);

  if (!(await pathExists(lockfilePath))) {
    if (!context.json) {
      logger.log("No lockfile found. Listing manifest entries:");
      for (const [name, range] of Object.entries(manifest.skills)) {
        logger.log(`- ${name}@${range}`);
      }
      return undefined;
    }
    return Object.entries(manifest.skills).map(([name, range]) => ({ name, range }));
  }

  const lockfile = await readLockfile(lockfilePath);
  const versions = resolveVersions(lockfile.packages as Record<string, { name: string; version: string }>);

  if (!context.json) {
    for (const [name, range] of Object.entries(lockfile.root.skills)) {
      const version = versions.get(name) ?? range;
      logger.log(`- ${name}@${version}`);
    }
    return undefined;
  }

  return Object.entries(lockfile.root.skills).map(([name, range]) => ({
    name,
    range,
    version: versions.get(name) ?? null
  }));
};
