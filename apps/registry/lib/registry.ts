import type { PublishMetadata } from "./validators";
import { readJson } from "./gcs";

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
  manifest: PublishMetadata["manifest"];
  integrity: string;
  tarball: string;
};

type PackageIndex = {
  name: string;
  description?: string;
  versions: Record<string, PackageVersionMetadata>;
  updatedAt?: string;
};

export const loadRootIndex = async (): Promise<RegistryIndex> => {
  const existing = await readJson<RegistryIndex>("index.json");
  return existing ?? { generatedAt: new Date().toISOString(), packages: {} };
};

export const loadPackageIndex = async (name: string): Promise<PackageIndex> => {
  const existing = await readJson<PackageIndex>(`packages/${name}/index.json`);
  return (
    existing ?? {
      name,
      versions: {},
      updatedAt: new Date().toISOString()
    }
  );
};

export const withPublishedVersion = (input: {
  metadata: PublishMetadata & { integrity: string };
  rootIndex: RegistryIndex;
  packageIndex: PackageIndex;
}): { rootIndex: RegistryIndex; packageIndex: PackageIndex } => {
  const { metadata, rootIndex, packageIndex } = input;

  if (packageIndex.versions[metadata.version]) {
    throw new Error(`Version already exists: ${metadata.name}@${metadata.version}`);
  }

  const nextPackageIndex: PackageIndex = {
    ...packageIndex,
    name: metadata.name,
    description: metadata.manifest.description,
    updatedAt: new Date().toISOString(),
    versions: {
      ...packageIndex.versions,
      [metadata.version]: {
        manifest: metadata.manifest,
        integrity: metadata.integrity,
        tarball: metadata.tarball
      }
    }
  };

  const versions = Object.keys(nextPackageIndex.versions).sort((a, b) => a.localeCompare(b));

  const nextRootIndex: RegistryIndex = {
    ...rootIndex,
    generatedAt: new Date().toISOString(),
    packages: {
      ...rootIndex.packages,
      [metadata.name]: {
        name: metadata.name,
        description: metadata.manifest.description,
        latest: versions[versions.length - 1],
        versions
      }
    }
  };

  return { rootIndex: nextRootIndex, packageIndex: nextPackageIndex };
};
