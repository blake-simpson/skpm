import semver from "semver";
import type { PackageManifest, ResolvedPackage } from "../types";

export type PackageSource = {
  getVersions: (name: string) => Promise<string[]>;
  getManifest: (name: string, version: string) => Promise<PackageManifest>;
  getIntegrity: (name: string, version: string) => Promise<string>;
};

export type ResolveResult = {
  root: {
    name: string;
    skills: Record<string, string>;
  };
  packages: Record<string, ResolvedPackage>;
};

export type ConflictDetail = {
  name: string;
  existingRange: string;
  newRange: string;
  existingPath: string[];
  newPath: string[];
};

type RequirementEntry = {
  range: string;
  path: string[];
  source: string;
};

export class ResolutionError extends Error {
  readonly conflicts: ConflictDetail[];

  constructor(message: string, conflicts: ConflictDetail[]) {
    super(message);
    this.conflicts = conflicts;
  }
}

const formatPath = (path: string[]): string => path.join(" -> ");

const pickVersion = async (
  source: PackageSource,
  name: string,
  ranges: string[]
): Promise<string> => {
  const versions = await source.getVersions(name);
  const candidates = versions
    .filter((version) => semver.valid(version))
    .filter((version) => ranges.every((range) => semver.satisfies(version, range)));

  if (candidates.length === 0) {
    throw new Error(
      `No version of ${name} satisfies ranges ${ranges.length > 0 ? ranges.join(", ") : "none"}`
    );
  }

  return semver.rsort(candidates)[0];
};

export const resolveDependencies = async (input: {
  rootName: string;
  skills: Record<string, string>;
  source: PackageSource;
}): Promise<ResolveResult> => {
  const packages = new Map<string, ResolvedPackage>();
  const resolvedVersions = new Map<string, string>();
  const requirements = new Map<string, RequirementEntry[]>();
  const resolving = new Set<string>();
  const rootSkills = new Set(Object.keys(input.skills));

  const recordRequirement = (
    name: string,
    range: string,
    path: string[],
    source: string
  ): void => {
    const entries = requirements.get(name) ?? [];
    entries.push({ range, path, source });
    requirements.set(name, entries);
  };

  const removeRequirementsBySource = (source: string): void => {
    for (const [name, entries] of requirements.entries()) {
      const filtered = entries.filter((entry) => entry.source !== source);
      if (filtered.length === 0) {
        requirements.delete(name);
      } else {
        requirements.set(name, filtered);
      }
    }
  };

  const pruneUnrequired = (): void => {
    let removed = true;
    while (removed) {
      removed = false;
      for (const [name, version] of Array.from(resolvedVersions.entries())) {
        if (rootSkills.has(name)) {
          continue;
        }
        const entries = requirements.get(name);
        if (!entries || entries.length === 0) {
          const source = `${name}@${version}`;
          resolvedVersions.delete(name);
          packages.delete(source);
          removeRequirementsBySource(source);
          removed = true;
        }
      }
    }
  };

  const resolvePackage = async (
    name: string,
    range: string,
    path: string[],
    source: string
  ): Promise<void> => {
    recordRequirement(name, range, path, source);
    const entries = requirements.get(name) ?? [];
    const ranges = entries.map((entry) => entry.range);

    const existingVersion = resolvedVersions.get(name);
    if (existingVersion && ranges.every((current) => semver.satisfies(existingVersion, current))) {
      return;
    }

    if (resolving.has(name)) {
      throw new Error(`Detected cyclic dependency while resolving ${formatPath(path)}`);
    }

    resolving.add(name);
    let version: string;
    try {
      version = await pickVersion(input.source, name, ranges);
    } catch (error) {
      if (entries.length >= 2) {
        const existingRequirement = entries[0];
        const newRequirement = entries[entries.length - 1];
        const conflict: ConflictDetail = {
          name,
          existingRange: existingRequirement.range,
          newRange: newRequirement.range,
          existingPath: existingRequirement.path,
          newPath: newRequirement.path
        };
        throw new ResolutionError(
          `Conflict on ${name}: ${conflict.existingRange} vs ${conflict.newRange} (paths: ${formatPath(
            conflict.existingPath
          )} | ${formatPath(conflict.newPath)})`,
          [conflict]
        );
      }
      throw error;
    }

    const existingVersionAfterPick = resolvedVersions.get(name);
    if (existingVersionAfterPick && existingVersionAfterPick !== version) {
      const oldSource = `${name}@${existingVersionAfterPick}`;
      removeRequirementsBySource(oldSource);
      packages.delete(oldSource);
      resolvedVersions.set(name, version);
      pruneUnrequired();
    } else if (!existingVersionAfterPick) {
      resolvedVersions.set(name, version);
    }

    const manifest = await input.source.getManifest(name, version);
    const dependencies = manifest.dependencies ?? {};
    const dependencyNames = Object.keys(dependencies).sort();

    for (const dependencyName of dependencyNames) {
      await resolvePackage(
        dependencyName,
        dependencies[dependencyName],
        path.concat(dependencyName),
        `${name}@${version}`
      );
    }

    const resolved: Record<string, string> = {};
    for (const dependencyName of dependencyNames) {
      const resolvedVersion = resolvedVersions.get(dependencyName);
      if (resolvedVersion) {
        resolved[dependencyName] = resolvedVersion;
      }
    }

    const integrity = await input.source.getIntegrity(name, version);
    packages.set(`${name}@${version}`, {
      name,
      version,
      dependencies,
      resolved,
      integrity
    });

    resolving.delete(name);
  };

  const skillNames = Object.keys(input.skills).sort();
  for (const skillName of skillNames) {
    await resolvePackage(skillName, input.skills[skillName], ["root", skillName], "root");
  }

  return {
    root: {
      name: input.rootName,
      skills: input.skills
    },
    packages: Object.fromEntries(packages)
  };
};
