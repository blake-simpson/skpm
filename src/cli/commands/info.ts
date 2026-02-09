import semver from "semver";
import {
  ensureRegistry,
  listSkillVersions,
  readRegistryManifest
} from "../../registry/registry";
import { CommandContext, getLogger, readProjectManifestIfExists, resolveRegistryUrl } from "./shared";

export type InfoOptions = {
  name: string;
  version?: string;
};

export const runInfo = async (
  context: CommandContext,
  options: InfoOptions
): Promise<unknown | void> => {
  const logger = getLogger(context);
  const manifest = await readProjectManifestIfExists(context.projectRoot);
  const registryUrl = resolveRegistryUrl({
    manifest,
    registryOverride: context.registryOverride
  });
  const registryPath = await ensureRegistry({ registryUrl });

  const versions = await listSkillVersions(registryPath, options.name);
  if (versions.length === 0) {
    throw new Error(`Skill not found: ${options.name}`);
  }

  let version = options.version;
  if (!version) {
    const valid = versions.filter((entry) => semver.valid(entry));
    version = semver.rsort(valid)[0] ?? versions[versions.length - 1];
  }

  const manifestData = await readRegistryManifest(registryPath, options.name, version);

  if (!context.json) {
    logger.log(`${manifestData.name}@${manifestData.version}`);
    logger.log(manifestData.description);
    logger.log(`License: ${manifestData.license}`);
    logger.log(`Author: ${manifestData.author}`);
    if (manifestData.dependencies && Object.keys(manifestData.dependencies).length > 0) {
      logger.log("Dependencies:");
      for (const [name, range] of Object.entries(manifestData.dependencies)) {
        logger.log(`- ${name}@${range}`);
      }
    }
    return undefined;
  }

  return {
    name: manifestData.name,
    version: manifestData.version,
    description: manifestData.description,
    dependencies: manifestData.dependencies ?? {},
    files: manifestData.files,
    license: manifestData.license,
    author: manifestData.author
  };
};
