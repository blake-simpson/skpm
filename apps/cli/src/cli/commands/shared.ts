import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { loadProjectManifest } from "../../manifest/parse";
import { validateProjectManifest } from "../../manifest/schema";
import type { ProjectManifest } from "../../types";
import { DEFAULT_REGISTRY } from "../../registry/registry";

export type Logger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type CommandContext = {
  projectRoot: string;
  registryOverride?: string;
  agentTargetsOverride?: string[];
  json?: boolean;
  verbose?: boolean;
  logger?: Logger;
};

export type JsonResult = {
  ok: boolean;
  data?: unknown;
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const getLogger = (context: CommandContext): Logger => context.logger ?? console;

export const getProjectManifestPath = (projectRoot: string): string =>
  path.join(projectRoot, "skpm.json");

export const getLockfilePath = (projectRoot: string): string =>
  path.join(projectRoot, "skpm-lock.json");

export const readProjectManifest = async (projectRoot: string): Promise<ProjectManifest> => {
  const manifestPath = getProjectManifestPath(projectRoot);
  return loadProjectManifest(manifestPath);
};

export const readProjectManifestIfExists = async (
  projectRoot: string
): Promise<ProjectManifest | null> => {
  const manifestPath = getProjectManifestPath(projectRoot);
  if (!(await pathExists(manifestPath))) {
    return null;
  }
  return readProjectManifest(projectRoot);
};

export const writeProjectManifest = async (
  projectRoot: string,
  manifest: ProjectManifest
): Promise<void> => {
  const manifestPath = getProjectManifestPath(projectRoot);
  const validated = validateProjectManifest(manifest);
  await writeFile(manifestPath, JSON.stringify(validated, null, 2), "utf-8");
};

export const loadProjectManifestOrThrow = async (
  projectRoot: string
): Promise<ProjectManifest> => {
  const manifestPath = getProjectManifestPath(projectRoot);
  if (!(await pathExists(manifestPath))) {
    throw new Error("Missing skpm.json. Run 'skpm init' first.");
  }
  return readProjectManifest(projectRoot);
};

export const resolveRegistryUrl = (input: {
  manifest?: ProjectManifest | null;
  registryOverride?: string;
}): string => {
  if (input.registryOverride && input.registryOverride.trim().length > 0) {
    return input.registryOverride.trim();
  }
  if (input.manifest?.registry) {
    return input.manifest.registry;
  }
  return DEFAULT_REGISTRY;
};

export const parseToolTargets = (value?: string | string[]): string[] => {
  if (!value) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  const targets = values
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(targets));
};

export const parseSkillSpec = (
  spec: string,
  explicitRange?: string
): { name: string; range: string } => {
  if (!spec) {
    throw new Error("Skill name is required.");
  }
  if (explicitRange && !semver.validRange(explicitRange)) {
    throw new Error(`Invalid semver range: ${explicitRange}`);
  }
  const atIndex = spec.lastIndexOf("@");
  if (atIndex > 0) {
    const name = spec.slice(0, atIndex);
    const range = spec.slice(atIndex + 1) || "*";
    if (explicitRange) {
      throw new Error("Provide a range either with @ or --range, not both.");
    }
    if (!semver.validRange(range)) {
      throw new Error(`Invalid semver range: ${range}`);
    }
    return { name, range };
  }
  return { name: spec, range: explicitRange ?? "*" };
};

export const readPackageJsonName = async (projectRoot: string): Promise<string | null> => {
  const packagePath = path.join(projectRoot, "package.json");
  if (!(await pathExists(packagePath))) {
    return null;
  }
  const contents = await readFile(packagePath, "utf-8");
  try {
    const parsed = JSON.parse(contents) as { name?: string };
    if (parsed.name && parsed.name.trim().length > 0) {
      return parsed.name.trim();
    }
  } catch {
    return null;
  }
  return null;
};
