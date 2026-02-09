import { CommandContext, getLogger } from "./shared";
import { runInstall } from "./install";

export const runUpdate = async (context: CommandContext): Promise<unknown | void> => {
  const logger = getLogger(context);
  const result = await runInstall(context);
  if (!context.json) {
    logger.log("Update complete.");
  }
  return result ?? undefined;
};
