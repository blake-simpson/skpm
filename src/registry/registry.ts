import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PackageManifest } from "../types";
import { loadPackageManifest } from "../manifest/parse";

const execFileAsync = promisify(execFile);

export const DEFAULT_REGISTRY = "https://github.com/blake-simpson/skpm-registry";

export type RegistryEntry = {
  name: string;
  version: string;
  manifest: PackageManifest;
  path: string;
};

export type GitRunner = (args: string[], options?: { cwd?: string }) => Promise<string>;

const defaultGitRunner: GitRunner = async (args, options) => {
  const result = await execFileAsync("git", args, { cwd: options?.cwd });
  return result.stdout.trim();
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const getRegistryCachePath = (registryUrl: string, baseDir?: string): string => {
  const root = baseDir ?? path.join(os.homedir(), ".skpm", "registry");
  const hash = createHash("sha256").update(registryUrl).digest("hex");
  return path.join(root, hash);
};

const resolveDefaultBranch = async (git: GitRunner, cwd: string): Promise<string> => {
  try {
    const ref = await git(["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd });
    const match = ref.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // fall through to default
  }
  return "main";
};

export const ensureRegistry = async (input: {
  registryUrl: string;
  baseDir?: string;
  git?: GitRunner;
}): Promise<string> => {
  const git = input.git ?? defaultGitRunner;
  const registryPath = getRegistryCachePath(input.registryUrl, input.baseDir);
  const parentDir = path.dirname(registryPath);
  await mkdir(parentDir, { recursive: true });

  if (!(await pathExists(registryPath))) {
    await git(["clone", input.registryUrl, registryPath]);
  } else {
    await git(["fetch", "--prune", "origin"], { cwd: registryPath });
  }

  const defaultBranch = await resolveDefaultBranch(git, registryPath);
  await git(["reset", "--hard", `origin/${defaultBranch}`], { cwd: registryPath });

  return registryPath;
};

export const listSkillNames = async (registryPath: string): Promise<string[]> => {
  const skillsRoot = path.join(registryPath, "skills");
  if (!(await pathExists(skillsRoot))) {
    return [];
  }
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

export const listSkillVersions = async (
  registryPath: string,
  name: string
): Promise<string[]> => {
  const versionsRoot = path.join(registryPath, "skills", name);
  if (!(await pathExists(versionsRoot))) {
    return [];
  }
  const entries = await readdir(versionsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

export const readRegistryManifest = async (
  registryPath: string,
  name: string,
  version: string
): Promise<PackageManifest> => {
  const manifestPath = path.join(registryPath, "skills", name, version, "skpm.json");
  return loadPackageManifest(manifestPath);
};

export const scanRegistry = async (registryPath: string): Promise<RegistryEntry[]> => {
  const names = await listSkillNames(registryPath);
  const entries: RegistryEntry[] = [];

  for (const name of names) {
    const versions = await listSkillVersions(registryPath, name);
    for (const version of versions) {
      const manifest = await readRegistryManifest(registryPath, name, version);
      entries.push({
        name,
        version,
        manifest,
        path: path.join(registryPath, "skills", name, version)
      });
    }
  }

  return entries;
};

export const searchRegistry = async (
  registryPath: string,
  query?: string
): Promise<RegistryEntry[]> => {
  const entries = await scanRegistry(registryPath);
  if (!query) {
    return entries;
  }
  const normalized = query.toLowerCase();
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalized) ||
      entry.manifest.description.toLowerCase().includes(normalized)
  );
};
