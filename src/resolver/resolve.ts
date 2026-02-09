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
  range: string
): Promise<string> => {
  const versions = await source.getVersions(name);
  const candidates = versions
    .filter((version) => semver.valid(version))
    .filter((version) => semver.satisfies(version, range));

  if (candidates.length === 0) {
    throw new Error(`No version of ${name} satisfies range ${range}`);
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
  const requirements = new Map<string, { range: string; path: string[] }[]>();
  const resolving = new Set<string>();

  const recordRequirement = (name: string, range: string, path: string[]): void => {
    const entries = requirements.get(name) ?? [];
    entries.push({ range, path });
    requirements.set(name, entries);
  };

  const resolvePackage = async (name: string, range: string, path: string[]): Promise<void> => {
    recordRequirement(name, range, path);

    const existingVersion = resolvedVersions.get(name);
    if (existingVersion) {
      if (!semver.satisfies(existingVersion, range)) {
        const existingRequirement = requirements.get(name)?.[0];
        const conflict: ConflictDetail = {
          name,
          existingRange: existingRequirement?.range ?? "unknown",
          newRange: range,
          existingPath: existingRequirement?.path ?? [name],
          newPath: path
        };
        throw new ResolutionError(
          `Conflict on ${name}: ${conflict.existingRange} vs ${conflict.newRange} (paths: ${formatPath(
            conflict.existingPath
          )} | ${formatPath(conflict.newPath)})`,
          [conflict]
        );
      }

      return;
    }

    if (resolving.has(name)) {
      throw new Error(`Detected cyclic dependency while resolving ${formatPath(path)}`);
    }

    resolving.add(name);
    const version = await pickVersion(input.source, name, range);
    resolvedVersions.set(name, version);

    const manifest = await input.source.getManifest(name, version);
    const dependencies = manifest.dependencies ?? {};
    const dependencyNames = Object.keys(dependencies).sort();

    for (const dependencyName of dependencyNames) {
      await resolvePackage(
        dependencyName,
        dependencies[dependencyName],
        path.concat(dependencyName)
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
    await resolvePackage(skillName, input.skills[skillName], ["root", skillName]);
  }

  return {
    root: {
      name: input.rootName,
      skills: input.skills
    },
    packages: Object.fromEntries(packages)
  };
};
