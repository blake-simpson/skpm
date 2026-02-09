export type SkillFileMapping = {
  source: string;
};

export type ProjectManifest = {
  name: string;
  skills: Record<string, string>;
  registry?: string;
  agentTargets?: string[];
};

export type PackageManifest = {
  name: string;
  version: string;
  description: string;
  dependencies?: Record<string, string>;
  files: string[];
  license: string;
  author: string;
  skills?: SkillFileMapping[];
  agents?: SkillFileMapping[];
};

export type ResolvedPackage = {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  resolved: Record<string, string>;
  integrity: string;
};

export type Lockfile = {
  lockfileVersion: number;
  registry: string;
  root: {
    name: string;
    skills: Record<string, string>;
  };
  packages: Record<string, ResolvedPackage>;
};
