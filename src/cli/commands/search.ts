import { ensureRegistry, searchRegistry } from "../../registry/registry";
import { CommandContext, getLogger, readProjectManifestIfExists, resolveRegistryUrl } from "./shared";

export const runSearch = async (
  context: CommandContext,
  query?: string
): Promise<unknown | void> => {
  const logger = getLogger(context);
  const manifest = await readProjectManifestIfExists(context.projectRoot);
  const registryUrl = resolveRegistryUrl({
    manifest,
    registryOverride: context.registryOverride
  });

  const registryPath = await ensureRegistry({ registryUrl });
  const entries = await searchRegistry(registryPath, query);

  if (!context.json) {
    if (entries.length === 0) {
      logger.log("No skills found.");
      return undefined;
    }
    for (const entry of entries) {
      logger.log(`${entry.name}@${entry.version} - ${entry.manifest.description}`);
    }
    return undefined;
  }

  return entries.map((entry) => ({
    name: entry.name,
    version: entry.version,
    description: entry.manifest.description,
    dependencies: entry.manifest.dependencies ?? {}
  }));
};
