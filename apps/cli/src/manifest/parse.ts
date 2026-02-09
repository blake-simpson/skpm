import { readFile } from "node:fs/promises";
import type { Lockfile, PackageManifest, ProjectManifest } from "../types";
import { validateLockfile, validatePackageManifest, validateProjectManifest } from "./schema";

const readJsonFile = async (path: string): Promise<unknown> => {
  const contents = await readFile(path, "utf-8");
  return JSON.parse(contents) as unknown;
};

export const loadProjectManifest = async (path: string): Promise<ProjectManifest> => {
  const json = await readJsonFile(path);
  return validateProjectManifest(json);
};

export const loadPackageManifest = async (path: string): Promise<PackageManifest> => {
  const json = await readJsonFile(path);
  return validatePackageManifest(json);
};

export const loadLockfile = async (path: string): Promise<Lockfile> => {
  const json = await readJsonFile(path);
  return validateLockfile(json);
};
