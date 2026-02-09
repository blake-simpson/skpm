import { publishPackage } from "../../publish/publish";
import { CommandContext, getLogger, resolveRegistryUrl } from "./shared";

export const runPublish = async (context: CommandContext): Promise<unknown | void> => {
  const logger = getLogger(context);
  const registryUrl = resolveRegistryUrl({
    registryOverride: context.registryOverride
  });

  const result = await publishPackage({
    packageRoot: context.projectRoot,
    registryUrl
  });

  if (!context.json) {
    logger.log(`Published ${result.name}@${result.version}`);
    logger.log(`Registry: ${result.registry}`);
    return undefined;
  }

  return result;
};
