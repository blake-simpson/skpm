import { CommandContext, getLogger } from "./shared";
import { runInstall } from "./install";
import { cleanOrphanedStoreEntries } from "./remove";

export const runUpdate = async (context: CommandContext): Promise<unknown | void> => {
  const logger = getLogger(context);
  const result = await runInstall(context);
  await cleanOrphanedStoreEntries(context.projectRoot);
  if (!context.json) {
    logger.log("Update complete.");
  }
  return result ?? undefined;
};
