import { readFile, writeFile } from "node:fs/promises";
import type { Lockfile, ResolvedPackage } from "../types";
import { validateLockfile } from "../manifest/schema";

export const createLockfile = (input: {
  registry: string;
  rootName: string;
  skills: Record<string, string>;
  packages: Record<string, ResolvedPackage>;
  lockfileVersion?: number;
}): Lockfile => {
  const lockfile: Lockfile = {
    lockfileVersion: input.lockfileVersion ?? 1,
    registry: input.registry,
    root: {
      name: input.rootName,
      skills: input.skills
    },
    packages: input.packages
  };

  return validateLockfile(lockfile);
};

export const readLockfile = async (path: string): Promise<Lockfile> => {
  const contents = await readFile(path, "utf-8");
  const parsed = JSON.parse(contents) as unknown;
  return validateLockfile(parsed);
};

export const writeLockfile = async (path: string, lockfile: Lockfile): Promise<void> => {
  const validated = validateLockfile(lockfile);
  const contents = JSON.stringify(validated, null, 2);
  await writeFile(path, contents, "utf-8");
};
