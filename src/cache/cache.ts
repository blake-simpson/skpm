import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { assertGzipArchive, downloadTarball, readRegistryIntegrity } from "../registry/registry";
import { hashDirectory } from "../utils/integrity";

const execFileAsync = promisify(execFile);

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const getCacheRoot = (baseDir?: string): string =>
  baseDir ?? path.join(os.homedir(), ".skpm", "cache");

export const getCachedPackagePath = (input: {
  name: string;
  version: string;
  baseDir?: string;
}): string => {
  const root = getCacheRoot(input.baseDir);
  return path.join(root, input.name, input.version);
};

export const ensurePackageCached = async (input: {
  registryUrl: string;
  registryPath: string;
  name: string;
  version: string;
  baseDir?: string;
}): Promise<string> => {
  const destination = getCachedPackagePath({
    name: input.name,
    version: input.version,
    baseDir: input.baseDir
  });

  if (await pathExists(destination)) {
    return destination;
  }

  const { integrity, tarball } = await readRegistryIntegrity({
    registryPath: input.registryPath,
    registryUrl: input.registryUrl,
    name: input.name,
    version: input.version
  });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-cache-"));
  try {
    const tarPath = path.join(tempRoot, `${input.name}-${input.version}.tgz`);
    const extractDir = path.join(tempRoot, "extract");
    await mkdir(extractDir, { recursive: true });

    const downloadMeta = await downloadTarball({
      registryUrl: input.registryUrl,
      tarball,
      targetPath: tarPath
    });
    await assertGzipArchive(tarPath, tarball, downloadMeta.contentType);

    await execFileAsync("tar", ["-xzf", tarPath, "-C", extractDir]);

    const parentDir = path.dirname(destination);
    await mkdir(parentDir, { recursive: true });
    await cp(extractDir, destination, { recursive: true });

    const actual = await hashDirectory(destination);
    if (actual !== integrity) {
      throw new Error(
        `Integrity mismatch for ${input.name}@${input.version}: expected ${integrity}, got ${actual}`
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  return destination;
};
