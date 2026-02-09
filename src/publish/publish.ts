import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { loadPackageManifest } from "../manifest/parse";
import { DEFAULT_REGISTRY, ensureRegistry, type GitRunner } from "../registry/registry";
import type { PackageManifest } from "../types";

const execFileAsync = promisify(execFile);

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

const resolveDefaultBranch = async (git: GitRunner, cwd: string): Promise<string> => {
  try {
    const ref = await git(["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd });
    const match = ref.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // fall through
  }
  return "main";
};

const ensureBranch = async (git: GitRunner, cwd: string): Promise<string> => {
  const current = (await git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).trim();
  if (current && current !== "HEAD") {
    return current;
  }
  const branch = await resolveDefaultBranch(git, cwd);
  await git(["checkout", "-B", branch, `origin/${branch}`], { cwd });
  return branch;
};

const assertRelativePattern = (pattern: string): void => {
  if (path.isAbsolute(pattern)) {
    throw new Error(`Publish file patterns must be relative: ${pattern}`);
  }
};

const normalizeRelative = (entry: string): string => {
  const normalized = path.normalize(entry).replace(/^([/\\])+/, "");
  if (normalized.split(path.sep).includes("..")) {
    throw new Error(`Publish file patterns must stay within the package: ${entry}`);
  }
  return normalized;
};

const toPosixPath = (entry: string): string => entry.split(path.sep).join("/");

const listFiles = async (root: string, relativeBase = ""): Promise<string[]> => {
  const entries = await readdir(path.join(root, relativeBase), { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      results.push(toPosixPath(relativePath));
    }
  }
  return results;
};

const globToRegExp = (pattern: string): RegExp => {
  const normalized = toPosixPath(pattern);
  let regex = "";
  let index = 0;
  while (index < normalized.length) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        while (normalized[index] === "*") {
          index += 1;
        }
        regex += ".*";
        continue;
      }
      regex += "[^/]*";
      index += 1;
      continue;
    }
    if (char === "?") {
      regex += ".";
      index += 1;
      continue;
    }
    if ("\\.[]{}()+-^$|".includes(char)) {
      regex += `\\\\${char}`;
    } else {
      regex += char;
    }
    index += 1;
  }
  return new RegExp(`^${regex}$`);
};

const matchGlob = (files: string[], pattern: string): string[] => {
  const matcher = globToRegExp(pattern);
  return files.filter((file) => matcher.test(toPosixPath(file)));
};

const collectPublishFiles = async (input: {
  packageRoot: string;
  manifest: PackageManifest;
}): Promise<string[]> => {
  const files = new Set<string>();
  const allFiles = await listFiles(input.packageRoot);

  for (const pattern of input.manifest.files) {
    const trimmed = pattern.trim();
    if (!trimmed) {
      continue;
    }
    assertRelativePattern(trimmed);
    const entries = matchGlob(allFiles, trimmed);
    if (entries.length === 0) {
      throw new Error(`No files match pattern: ${pattern}`);
    }
    for (const entry of entries) {
      files.add(normalizeRelative(entry));
    }
  }

  files.add("skpm.json");

  return Array.from(files).sort((a, b) => a.localeCompare(b));
};

const copyPublishFiles = async (input: {
  packageRoot: string;
  destination: string;
  files: string[];
}): Promise<void> => {
  for (const file of input.files) {
    const sourcePath = path.join(input.packageRoot, file);
    const destinationPath = path.join(input.destination, file);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { recursive: true });
  }
};

export type PublishResult = {
  name: string;
  version: string;
  registry: string;
  registryPath: string;
  destination: string;
  files: string[];
  commit: string;
};

export const publishPackage = async (input: {
  packageRoot: string;
  registryUrl?: string;
  registryBaseDir?: string;
  git?: GitRunner;
}): Promise<PublishResult> => {
  const registryUrl = input.registryUrl ?? DEFAULT_REGISTRY;
  const git = input.git ?? defaultGitRunner;

  const manifestPath = path.join(input.packageRoot, "skpm.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error("Missing skpm.json. Publish must be run from a package root.");
  }

  const manifest = await loadPackageManifest(manifestPath);
  const files = await collectPublishFiles({ packageRoot: input.packageRoot, manifest });

  const registryPath = await ensureRegistry({
    registryUrl,
    baseDir: input.registryBaseDir,
    git
  });

  const destination = path.join(registryPath, "skills", manifest.name, manifest.version);
  if (await pathExists(destination)) {
    throw new Error(`Registry already contains ${manifest.name}@${manifest.version}.`);
  }

  await mkdir(destination, { recursive: true });
  await copyPublishFiles({ packageRoot: input.packageRoot, destination, files });

  const branch = await ensureBranch(git, registryPath);
  const publishPath = path.posix.join("skills", manifest.name, manifest.version);
  await git(["add", publishPath], { cwd: registryPath });

  const status = await git(["status", "--porcelain"], { cwd: registryPath });
  if (!status) {
    throw new Error("No changes detected after publish.");
  }

  const message = `Publish ${manifest.name}@${manifest.version}`;
  await git(["commit", "-m", message], { cwd: registryPath });
  await git(["push", "origin", branch], { cwd: registryPath });

  const commit = await git(["rev-parse", "--short", "HEAD"], { cwd: registryPath });

  return {
    name: manifest.name,
    version: manifest.version,
    registry: registryUrl,
    registryPath,
    destination,
    files,
    commit
  };
};
