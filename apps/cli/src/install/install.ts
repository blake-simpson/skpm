import { access, cp, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { linkToolTargets } from "./tools";

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const removeIfExists = async (target: string): Promise<void> => {
  await rm(target, { recursive: true, force: true });
};

const ensureSymlink = async (target: string, linkPath: string): Promise<void> => {
  await removeIfExists(linkPath);
  try {
    await symlink(target, linkPath);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") {
      throw new Error(
        `Failed to create symlink at ${linkPath}. On Windows, enable Developer Mode or run with admin privileges.`
      );
    }
    throw error;
  }
};

export const getStorePath = (projectRoot: string, name: string, version: string): string =>
  path.join(projectRoot, ".agents", "skills", ".store", `${name}@${version}`);

export const getExposedSkillPath = (projectRoot: string, name: string): string =>
  path.join(projectRoot, ".agents", "skills", name);

export const installTopLevelSkill = async (input: {
  projectRoot: string;
  name: string;
  version: string;
  cachedPath: string;
  agentTargets?: string[];
}): Promise<void> => {
  const storePath = getStorePath(input.projectRoot, input.name, input.version);
  if (!(await pathExists(storePath))) {
    await mkdir(path.dirname(storePath), { recursive: true });
    await cp(input.cachedPath, storePath, { recursive: true });
  }

  const exposedPath = getExposedSkillPath(input.projectRoot, input.name);
  await mkdir(path.dirname(exposedPath), { recursive: true });
  await ensureSymlink(storePath, exposedPath);

  await linkToolTargets({
    projectRoot: input.projectRoot,
    skillName: input.name,
    agentTargets: input.agentTargets
  });
};
