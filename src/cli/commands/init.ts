import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { detectTools } from "../../install/tools";
import type { ProjectManifest } from "../../types";
import {
  CommandContext,
  getLogger,
  getProjectManifestPath,
  parseToolTargets,
  readPackageJsonName,
  writeProjectManifest
} from "./shared";

export type InitOptions = {
  name?: string;
  registry?: string;
  tool?: string | string[];
  prompt?: (question: string) => Promise<string>;
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const defaultPrompt = async (question: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
};

const shouldUseDetectedTools = async (prompt: (question: string) => Promise<string>): Promise<boolean> => {
  const answer = await prompt("Configure agentTargets for detected tools? (Y/n) ");
  return answer === "" || /^y(es)?$/i.test(answer);
};

const promptForTargets = async (
  prompt: (question: string) => Promise<string>,
  detected: string[]
): Promise<string[]> => {
  const answer = await prompt(
    `Enter comma-separated tools to enable (default: ${detected.join(", ")}): `
  );
  if (!answer) {
    return detected;
  }
  return parseToolTargets(answer);
};

const resolveProjectName = async (
  projectRoot: string,
  inputName?: string,
  prompt?: (question: string) => Promise<string>
): Promise<string> => {
  if (inputName && inputName.trim().length > 0) {
    return inputName.trim();
  }

  const inferred = (await readPackageJsonName(projectRoot)) ?? path.basename(projectRoot);
  if (!prompt) {
    return inferred;
  }

  const response = await prompt(`Project name (${inferred}): `);
  return response.trim() || inferred;
};

export const runInit = async (
  context: CommandContext,
  options: InitOptions
): Promise<ProjectManifest | void> => {
  const logger = getLogger(context);
  const manifestPath = getProjectManifestPath(context.projectRoot);

  if (await pathExists(manifestPath)) {
    throw new Error("skpm.json already exists in this directory.");
  }

  const prompt = options.prompt ?? defaultPrompt;
  const name = await resolveProjectName(context.projectRoot, options.name, prompt);
  const registry = options.registry?.trim();

  let agentTargets = parseToolTargets(options.tool);
  if (agentTargets.length === 0) {
    const detected = await detectTools(context.projectRoot);
    if (detected.length > 0 && (await shouldUseDetectedTools(prompt))) {
      agentTargets = await promptForTargets(prompt, detected);
    }
  }

  const manifest: ProjectManifest = {
    name,
    skills: {}
  };

  if (registry) {
    manifest.registry = registry;
  }

  if (agentTargets.length > 0) {
    manifest.agentTargets = agentTargets;
  }

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeProjectManifest(context.projectRoot, manifest);

  if (!context.json) {
    logger.log(`Initialized skpm.json for ${name}.`);
  }

  return context.json ? manifest : undefined;
};
