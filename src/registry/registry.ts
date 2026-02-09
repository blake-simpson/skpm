import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { IncomingMessage, ClientRequest } from "node:http";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import type { PackageManifest } from "../types";

export const DEFAULT_REGISTRY = "https://registry.skpm.dev";

export type RegistryEntry = {
  name: string;
  version: string;
  manifest: PackageManifest;
  path: string;
};

export type GitRunner = (args: string[], options?: { cwd?: string }) => Promise<string>;

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

type RegistrySource =
  | { kind: "http"; baseUrl: string }
  | { kind: "file"; basePath: string };

type ResolvedSource =
  | { kind: "http"; url: string }
  | { kind: "file"; filePath: string };

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

const normalizeRegistryUrl = (registryUrl: string): string =>
  registryUrl.trim().replace(/\/+$/, "");

const resolveRegistrySource = (registryUrl: string): RegistrySource => {
  const trimmed = normalizeRegistryUrl(registryUrl);
  if (trimmed.startsWith("file://")) {
    return { kind: "file", basePath: fileURLToPath(trimmed) };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "http", baseUrl: trimmed };
  }
  if (path.isAbsolute(trimmed) || trimmed.startsWith(".")) {
    return { kind: "file", basePath: path.resolve(trimmed) };
  }
  throw new Error(`Unsupported registry URL: ${registryUrl}`);
};

const resolveRegistryLocation = (
  registryUrl: string,
  relativePath: string
): ResolvedSource => {
  const source = resolveRegistrySource(registryUrl);
  if (source.kind === "http") {
    const url = new URL(relativePath.replace(/^\/+/, ""), `${source.baseUrl}/`).toString();
    return { kind: "http", url };
  }
  return { kind: "file", filePath: path.join(source.basePath, relativePath) };
};

const DEFAULT_TIMEOUT_MS = 15000;

const requestGet = async (
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<IncomingMessage> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = new URL(url).protocol === "http:" ? http : https;
  let request: ClientRequest | null = null;
  const timeout = setTimeout(() => {
    request?.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
  }, timeoutMs);

  try {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = client.get(
        url,
        {
          headers: {
            "User-Agent": "skpm",
            ...(options.headers ?? {})
          }
        },
        resolve
      );
      request = req;
      req.on("error", reject);
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const requestGetWithRedirects = async (
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<IncomingMessage> => {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = url;
  for (let remaining = maxRedirects; remaining >= 0; remaining -= 1) {
    const response = await requestGet(currentUrl, options);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location && remaining > 0) {
      response.resume();
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects for ${url}`);
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await requestGetWithRedirects(url);
  if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode} for ${url}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T;
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const contents = await readFile(filePath, "utf-8");
  return JSON.parse(contents) as T;
};

const writeJsonFile = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
};

const loadJsonWithCache = async <T>(input: {
  registryUrl: string;
  registryPath: string;
  relativePath: string;
}): Promise<T> => {
  const cachePath = path.join(input.registryPath, input.relativePath);
  const resolved = resolveRegistryLocation(input.registryUrl, input.relativePath);

  if (resolved.kind === "file") {
    const data = await readJsonFile<T>(resolved.filePath);
    await writeJsonFile(cachePath, data);
    return data;
  }

  try {
    const data = await fetchJson<T>(resolved.url);
    await writeJsonFile(cachePath, data);
    return data;
  } catch (error) {
    if (await pathExists(cachePath)) {
      return readJsonFile<T>(cachePath);
    }
    throw error;
  }
};

export const ensureRegistry = async (input: {
  registryUrl: string;
  baseDir?: string;
}): Promise<string> => {
  const registryPath = getRegistryCachePath(input.registryUrl, input.baseDir);
  await mkdir(registryPath, { recursive: true });
  await loadJsonWithCache<RegistryIndex>({
    registryUrl: input.registryUrl,
    registryPath,
    relativePath: "index.json"
  });
  return registryPath;
};

const readRegistryIndex = async (input: {
  registryUrl: string;
  registryPath: string;
}): Promise<RegistryIndex> =>
  loadJsonWithCache<RegistryIndex>({
    registryUrl: input.registryUrl,
    registryPath: input.registryPath,
    relativePath: "index.json"
  });

const readPackageIndex = async (input: {
  registryUrl: string;
  registryPath: string;
  name: string;
}): Promise<PackageIndex> =>
  loadJsonWithCache<PackageIndex>({
    registryUrl: input.registryUrl,
    registryPath: input.registryPath,
    relativePath: path.posix.join("packages", input.name, "index.json")
  });

export const listSkillNames = async (
  registryPath: string,
  registryUrl: string
): Promise<string[]> => {
  const index = await readRegistryIndex({ registryPath, registryUrl });
  return Object.keys(index.packages ?? {}).sort();
};

export const listSkillVersions = async (
  registryPath: string,
  registryUrl: string,
  name: string
): Promise<string[]> => {
  const pkg = await readPackageIndex({ registryPath, registryUrl, name });
  const versions = Object.keys(pkg.versions ?? {});
  const valid = versions.filter((version) => semver.valid(version));
  const invalid = versions.filter((version) => !semver.valid(version)).sort();
  return [...semver.rsort(valid), ...invalid];
};

export const readRegistryManifest = async (
  registryPath: string,
  registryUrl: string,
  name: string,
  version: string
): Promise<PackageManifest> => {
  const pkg = await readPackageIndex({ registryPath, registryUrl, name });
  const entry = pkg.versions?.[version];
  if (!entry) {
    throw new Error(`Registry metadata missing ${name}@${version}`);
  }
  return entry.manifest;
};

export const readRegistryIntegrity = async (input: {
  registryPath: string;
  registryUrl: string;
  name: string;
  version: string;
}): Promise<{ integrity: string; tarball: string }> => {
  const pkg = await readPackageIndex({
    registryPath: input.registryPath,
    registryUrl: input.registryUrl,
    name: input.name
  });
  const entry = pkg.versions?.[input.version];
  if (!entry) {
    throw new Error(`Registry metadata missing ${input.name}@${input.version}`);
  }
  return { integrity: entry.integrity, tarball: entry.tarball };
};

const resolveTarballSource = (registryUrl: string, tarball: string): ResolvedSource => {
  if (/^https?:\/\//i.test(tarball)) {
    return { kind: "http", url: tarball };
  }
  if (tarball.startsWith("file://")) {
    return { kind: "file", filePath: fileURLToPath(tarball) };
  }
  return resolveRegistryLocation(registryUrl, tarball);
};

export const downloadTarball = async (input: {
  registryUrl: string;
  tarball: string;
  targetPath: string;
}): Promise<{ statusCode?: number; contentType?: string }> => {
  const source = resolveTarballSource(input.registryUrl, input.tarball);
  if (source.kind === "file") {
    const data = await readFile(source.filePath);
    await writeFile(input.targetPath, data);
    return { statusCode: 200, contentType: "application/gzip" };
  }

  const response = await requestGetWithRedirects(source.url);
  if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode} for ${source.url}`);
  }
  await pipeline(response, createWriteStream(input.targetPath));
  return {
    statusCode: response.statusCode,
    contentType: Array.isArray(response.headers["content-type"])
      ? response.headers["content-type"][0]
      : response.headers["content-type"]
  };
};

export const assertGzipArchive = async (
  tarPath: string,
  url: string,
  contentType?: string
): Promise<void> => {
  const handle = await open(tarPath, "r");
  try {
    const buffer = Buffer.alloc(2);
    await handle.read(buffer, 0, 2, 0);
    const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
    if (!isGzip) {
      const previewBuffer = Buffer.alloc(512);
      const { bytesRead } = await handle.read(previewBuffer, 0, 512, 0);
      const preview = previewBuffer.subarray(0, bytesRead).toString("utf-8").trim();
      throw new Error(
        `Downloaded archive is not gzip. URL=${url} content-type=${contentType ?? "unknown"} ` +
          `preview="${preview.slice(0, 200)}"`
      );
    }
  } finally {
    await handle.close();
  }
};

export const scanRegistry = async (
  registryPath: string,
  registryUrl: string
): Promise<RegistryEntry[]> => {
  const names = await listSkillNames(registryPath, registryUrl);
  const entries: RegistryEntry[] = [];

  for (const name of names) {
    const versions = await listSkillVersions(registryPath, registryUrl, name);
    for (const version of versions) {
      const manifest = await readRegistryManifest(registryPath, registryUrl, name, version);
      entries.push({
        name,
        version,
        manifest,
        path: path.posix.join("packages", name, "index.json")
      });
    }
  }

  return entries;
};

export const searchRegistry = async (
  registryPath: string,
  registryUrl: string,
  query?: string
): Promise<RegistryEntry[]> => {
  const entries = await scanRegistry(registryPath, registryUrl);
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
