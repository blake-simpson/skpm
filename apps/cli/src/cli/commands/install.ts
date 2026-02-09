import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import type { PackageManifest } from "../../types";
import { ensurePackageCached } from "../../cache/cache";
import { createLockfile, writeLockfile } from "../../lockfile/lockfile";
import { readRegistryManifest, listSkillVersions, ensureRegistry } from "../../registry/registry";
import { resolveDependencies, ResolutionError } from "../../resolver/resolve";
import { getStorePath, installTopLevelSkill } from "../../install/install";
import { hashDirectory } from "../../utils/integrity";
import {
  CommandContext,
  getLockfilePath,
  getLogger,
  loadProjectManifestOrThrow,
  resolveRegistryUrl
} from "./shared";

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};


const ensureStoredPackage = async (input: {
  projectRoot: string;
  name: string;
  version: string;
  cachedPath: string;
}): Promise<void> => {
  const storePath = getStorePath(input.projectRoot, input.name, input.version);
  if (!(await pathExists(storePath))) {
    await mkdir(path.dirname(storePath), { recursive: true });
    await cp(input.cachedPath, storePath, { recursive: true });
  }
};

const ensureIntegrity = async (input: {
  registryPath: string;
  registryUrl: string;
  name: string;
  version: string;
  cacheRoot?: string;
  memo: Map<string, string>;
}): Promise<string> => {
  const key = `${input.name}@${input.version}`;
  const cached = input.memo.get(key);
  if (cached) {
    return cached;
  }
  const cachedPath = await ensurePackageCached({
    registryUrl: input.registryUrl,
    registryPath: input.registryPath,
    name: input.name,
    version: input.version,
    baseDir: input.cacheRoot
  });
  const integrity = await hashDirectory(cachedPath);
  input.memo.set(key, integrity);
  return integrity;
};

export type InstallResult = {
  registry: string;
  installed: Array<{ name: string; version: string }>;
};

const readSkillVersions = async (
  registryPath: string,
  registryUrl: string,
  name: string
): Promise<string[]> => listSkillVersions(registryPath, registryUrl, name);

const readSkillManifest = async (
  registryPath: string,
  registryUrl: string,
  name: string,
  version: string
): Promise<PackageManifest> => readRegistryManifest(registryPath, registryUrl, name, version);

export const runInstall = async (context: CommandContext): Promise<InstallResult | void> => {
  const logger = getLogger(context);
  const manifest = await loadProjectManifestOrThrow(context.projectRoot);
  const registryUrl = resolveRegistryUrl({
    manifest,
    registryOverride: context.registryOverride
  });

  const registryPath = await ensureRegistry({ registryUrl });
  const integrityMemo = new Map<string, string>();

  const result = await resolveDependencies({
    rootName: manifest.name,
    skills: manifest.skills,
    source: {
      getVersions: async (name: string) => readSkillVersions(registryPath, registryUrl, name),
      getManifest: async (name: string, version: string) =>
        readSkillManifest(registryPath, registryUrl, name, version),
      getIntegrity: async (name: string, version: string) =>
        ensureIntegrity({
          registryPath,
          registryUrl,
          name,
          version,
          memo: integrityMemo
        })
    }
  });

  const lockfile = createLockfile({
    registry: registryUrl,
    rootName: result.root.name,
    skills: result.root.skills,
    packages: result.packages
  });

  await writeLockfile(getLockfilePath(context.projectRoot), lockfile);

  const agentTargets =
    context.agentTargetsOverride && context.agentTargetsOverride.length > 0
      ? context.agentTargetsOverride
      : manifest.agentTargets;

  const installed: Array<{ name: string; version: string }> = [];

  for (const pkg of Object.values(result.packages)) {
    const cachedPath = await ensurePackageCached({
      registryUrl,
      registryPath,
      name: pkg.name,
      version: pkg.version
    });

    if (Object.prototype.hasOwnProperty.call(result.root.skills, pkg.name)) {
      await installTopLevelSkill({
        projectRoot: context.projectRoot,
        name: pkg.name,
        version: pkg.version,
        cachedPath,
        agentTargets
      });
      installed.push({ name: pkg.name, version: pkg.version });
    } else {
      await ensureStoredPackage({
        projectRoot: context.projectRoot,
        name: pkg.name,
        version: pkg.version,
        cachedPath
      });
    }
  }

  if (!context.json) {
    if (installed.length === 0) {
      logger.log("No skills to install.");
    } else {
      logger.log("Installed skills:");
      for (const entry of installed) {
        logger.log(`- ${entry.name}@${entry.version}`);
      }
    }
  }

  return context.json ? { registry: registryUrl, installed } : undefined;
};

export const formatResolutionError = (error: ResolutionError): string => {
  if (error.conflicts.length === 0) {
    return error.message;
  }
  const lines: string[] = [error.message];
  for (const conflict of error.conflicts) {
    lines.push(
      `Conflict on ${conflict.name}: ${conflict.existingRange} (${conflict.existingPath.join(
        " -> "
      )}) vs ${conflict.newRange} (${conflict.newPath.join(" -> ")})`
    );
  }
  return lines.join("\n");
};
