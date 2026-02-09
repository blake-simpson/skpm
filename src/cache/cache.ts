import { access, cp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

  const source = path.join(input.registryPath, "skills", input.name, input.version);
  const parentDir = path.dirname(destination);
  await mkdir(parentDir, { recursive: true });
  await cp(source, destination, { recursive: true });

  return destination;
};
