import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile, readdir, rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { loadPackageManifest } from "../manifest/parse";
import { DEFAULT_REGISTRY } from "../registry/registry";
import type { PackageManifest } from "../types";
import { hashFiles } from "../utils/integrity";

const execFileAsync = promisify(execFile);

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
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
      regex += `\\${char}`;
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

type RegistryIndexPackage = {
  name: string;
  description?: string;
  latest?: string;
  versions: string[];
};

type RegistryIndex = {
  generatedAt?: string;
  packages: Record<string, RegistryIndexPackage>;
};

type PackageVersionMetadata = {
  manifest: PackageManifest;
  integrity: string;
  tarball: string;
};

type PackageIndex = {
  name: string;
  description?: string;
  versions: Record<string, PackageVersionMetadata>;
  updatedAt?: string;
};

const readJsonIfExists = async <T>(filePath: string): Promise<T | null> => {
  if (!(await pathExists(filePath))) {
    return null;
  }
  const contents = await readFile(filePath, "utf-8");
  return JSON.parse(contents) as T;
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
};

const isHttpRegistry = (registryUrl: string): boolean => {
  const trimmed = registryUrl.trim();
  return /^https?:\/\//i.test(trimmed);
};

const resolveRegistryBaseDir = (input: {
  registryUrl: string;
  registryBaseDir?: string;
}): string => {
  if (input.registryBaseDir) {
    return input.registryBaseDir;
  }
  const trimmed = input.registryUrl.trim();
  if (trimmed.startsWith("file://")) {
    return fileURLToPath(trimmed);
  }
  if (path.isAbsolute(trimmed) || trimmed.startsWith(".")) {
    return path.resolve(trimmed);
  }
  throw new Error(
    "Publish requires a file:// registry URL or an explicit registryBaseDir."
  );
};

const derivePublishApiUrl = (registryUrl: string): string => {
  const url = new URL(registryUrl.trim());
  if (url.hostname.startsWith("registry.")) {
    url.hostname = url.hostname.replace(/^registry\./, "api.");
  }
  url.pathname = "/api/publish";
  return url.toString();
};

const writeTarball = async (input: {
  packageRoot: string;
  tarballPath: string;
  files: string[];
}): Promise<void> => {
  await mkdir(path.dirname(input.tarballPath), { recursive: true });
  const args = ["-czf", input.tarballPath, "-C", input.packageRoot, ...input.files];
  await execFileAsync("tar", args);
};

export type PublishResult = {
  name: string;
  version: string;
  registry: string;
  registryPath: string;
  tarball: string;
  integrity: string;
};

const publishToHttpRegistry = async (input: {
  packageRoot: string;
  manifest: PackageManifest;
  files: string[];
  registryUrl: string;
  token?: string;
}): Promise<PublishResult> => {
  const token = input.token ?? process.env.SKPM_PUBLISH_TOKEN;
  if (!token) {
    throw new Error(
      "Missing publish token. Set SKPM_PUBLISH_TOKEN or pass --token."
    );
  }

  const tarball = `tarballs/${input.manifest.name}/${input.manifest.version}.tgz`;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "skpm-publish-"));

  try {
    const tarballPath = path.join(tmpDir, `${input.manifest.version}.tgz`);
    await writeTarball({
      packageRoot: input.packageRoot,
      tarballPath,
      files: input.files
    });

    const integrity = await hashFiles(input.packageRoot, input.files);

    const normalizedManifest = {
      ...input.manifest,
      dependencies: input.manifest.dependencies ?? {}
    };

    const metadata = {
      name: input.manifest.name,
      version: input.manifest.version,
      manifest: normalizedManifest,
      integrity,
      tarball
    };

    const tarballBytes = await readFile(tarballPath);
    const formData = new FormData();
    formData.set("metadata", JSON.stringify(metadata));
    formData.set(
      "tarball",
      new Blob([tarballBytes], { type: "application/gzip" }),
      `${input.manifest.version}.tgz`
    );

    const apiUrl = derivePublishApiUrl(input.registryUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const body = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok) {
      throw new Error(
        `Publish failed (HTTP ${response.status}): ${body.error ?? "Unknown error"}`
      );
    }

    return {
      name: input.manifest.name,
      version: input.manifest.version,
      registry: input.registryUrl,
      registryPath: apiUrl,
      tarball,
      integrity
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

const publishToFileRegistry = async (input: {
  packageRoot: string;
  manifest: PackageManifest;
  files: string[];
  registryUrl: string;
  registryBaseDir?: string;
}): Promise<PublishResult> => {
  const registryPath = resolveRegistryBaseDir({
    registryUrl: input.registryUrl,
    registryBaseDir: input.registryBaseDir
  });

  const tarball = path.posix.join(
    "tarballs",
    input.manifest.name,
    `${input.manifest.version}.tgz`
  );
  const tarballPath = path.join(registryPath, tarball);

  if (await pathExists(tarballPath)) {
    throw new Error(
      `Registry already contains ${input.manifest.name}@${input.manifest.version}.`
    );
  }

  await writeTarball({
    packageRoot: input.packageRoot,
    tarballPath,
    files: input.files
  });

  const integrity = await hashFiles(input.packageRoot, input.files);

  const registryIndexPath = path.join(registryPath, "index.json");
  const packageIndexPath = path.join(
    registryPath,
    "packages",
    input.manifest.name,
    "index.json"
  );

  const registryIndex =
    (await readJsonIfExists<RegistryIndex>(registryIndexPath)) ??
    ({
      generatedAt: new Date().toISOString(),
      packages: {}
    } satisfies RegistryIndex);

  const packageIndex =
    (await readJsonIfExists<PackageIndex>(packageIndexPath)) ??
    ({
      name: input.manifest.name,
      description: input.manifest.description,
      versions: {}
    } satisfies PackageIndex);

  if (packageIndex.versions[input.manifest.version]) {
    throw new Error(
      `Registry already contains ${input.manifest.name}@${input.manifest.version}.`
    );
  }

  packageIndex.description = input.manifest.description;
  packageIndex.versions[input.manifest.version] = {
    manifest: input.manifest,
    integrity,
    tarball
  };
  packageIndex.updatedAt = new Date().toISOString();

  const versions = Object.keys(packageIndex.versions);
  const valid = versions.filter((version) => semver.valid(version));
  const latest = semver.rsort(valid)[0] ?? versions.sort().slice(-1)[0];

  registryIndex.packages[input.manifest.name] = {
    name: input.manifest.name,
    description: input.manifest.description,
    latest,
    versions: versions.sort((a, b) => a.localeCompare(b))
  };
  registryIndex.generatedAt = new Date().toISOString();

  await writeJson(packageIndexPath, packageIndex);
  await writeJson(registryIndexPath, registryIndex);

  return {
    name: input.manifest.name,
    version: input.manifest.version,
    registry: input.registryUrl,
    registryPath,
    tarball,
    integrity
  };
};

export const publishPackage = async (input: {
  packageRoot: string;
  registryUrl?: string;
  registryBaseDir?: string;
  token?: string;
}): Promise<PublishResult> => {
  const registryUrl = input.registryUrl ?? DEFAULT_REGISTRY;

  const manifestPath = path.join(input.packageRoot, "skpm.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error(
      "Missing skpm.json. Publish must be run from a package root."
    );
  }

  const manifest = await loadPackageManifest(manifestPath);
  const files = await collectPublishFiles({
    packageRoot: input.packageRoot,
    manifest
  });

  if (isHttpRegistry(registryUrl)) {
    return publishToHttpRegistry({
      packageRoot: input.packageRoot,
      manifest,
      files,
      registryUrl,
      token: input.token
    });
  }

  return publishToFileRegistry({
    packageRoot: input.packageRoot,
    manifest,
    files,
    registryUrl,
    registryBaseDir: input.registryBaseDir
  });
};
