import type { ProjectManifest } from "../../types";
import { runInstall } from "./install";
import {
  CommandContext,
  getLogger,
  loadProjectManifestOrThrow,
  parseSkillSpec,
  writeProjectManifest
} from "./shared";

export type AddOptions = {
  spec: string;
  range?: string;
};

export const runAdd = async (
  context: CommandContext,
  options: AddOptions
): Promise<ProjectManifest | void> => {
  const logger = getLogger(context);
  const manifest = await loadProjectManifestOrThrow(context.projectRoot);
  const parsed = parseSkillSpec(options.spec, options.range);

  const updated: ProjectManifest = {
    ...manifest,
    skills: {
      ...manifest.skills,
      [parsed.name]: parsed.range
    }
  };

  await writeProjectManifest(context.projectRoot, updated);

  try {
    await runInstall(context);
  } catch (error) {
    await writeProjectManifest(context.projectRoot, manifest);
    throw error;
  }

  if (!context.json) {
    logger.log(`Added ${parsed.name}@${parsed.range} to skpm.json.`);
  }

  return context.json ? updated : undefined;
};
