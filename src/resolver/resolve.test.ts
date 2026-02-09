import { describe, expect, it } from "vitest";
import type { PackageManifest } from "../types";
import { ResolutionError, resolveDependencies } from "./resolve";

const createManifest = (input: {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}): PackageManifest => ({
  name: input.name,
  version: input.version,
  description: "test",
  dependencies: input.dependencies,
  files: ["skills/**"],
  license: "MIT",
  author: "Tests"
});

const createSource = (data: Record<string, Record<string, PackageManifest>>) => {
  return {
    getVersions: async (name: string) => Object.keys(data[name] ?? {}),
    getManifest: async (name: string, version: string) => {
      const manifest = data[name]?.[version];
      if (!manifest) {
        throw new Error(`Missing manifest for ${name}@${version}`);
      }
      return manifest;
    },
    getIntegrity: async (name: string, version: string) => `sha256-${name}-${version}`
  };
};

describe("resolveDependencies", () => {
  it("resolves a deterministic dependency tree", async () => {
    const source = createSource({
      frontend: {
        "1.1.0": createManifest({
          name: "frontend",
          version: "1.1.0",
          dependencies: { core: "^2.0.0" }
        })
      },
      core: {
        "2.0.0": createManifest({ name: "core", version: "2.0.0" })
      }
    });

    const result = await resolveDependencies({
      rootName: "my-project",
      skills: { frontend: "^1.0.0" },
      source
    });

    expect(result.packages["frontend@1.1.0"]).toBeDefined();
    expect(result.packages["core@2.0.0"]).toBeDefined();
    expect(result.packages["frontend@1.1.0"].resolved.core).toBe("2.0.0");
  });

  it("selects the highest satisfying version", async () => {
    const source = createSource({
      core: {
        "2.0.0": createManifest({ name: "core", version: "2.0.0" }),
        "2.1.0": createManifest({ name: "core", version: "2.1.0" })
      }
    });

    const result = await resolveDependencies({
      rootName: "my-project",
      skills: { core: "^2.0.0" },
      source
    });

    expect(result.packages["core@2.1.0"]).toBeDefined();
  });

  it("throws on dependency conflicts", async () => {
    const source = createSource({
      frontend: {
        "1.0.0": createManifest({
          name: "frontend",
          version: "1.0.0",
          dependencies: { shared: "^1.0.0" }
        })
      },
      backend: {
        "1.0.0": createManifest({
          name: "backend",
          version: "1.0.0",
          dependencies: { shared: "^2.0.0" }
        })
      },
      shared: {
        "1.0.0": createManifest({ name: "shared", version: "1.0.0" }),
        "2.0.0": createManifest({ name: "shared", version: "2.0.0" })
      }
    });

    await expect(
      resolveDependencies({
        rootName: "my-project",
        skills: { frontend: "^1.0.0", backend: "^1.0.0" },
        source
      })
    ).rejects.toBeInstanceOf(ResolutionError);
  });
});
