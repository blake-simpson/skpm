import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getRegistryCachePath,
  listSkillNames,
  listSkillVersions,
  scanRegistry
} from "./registry";

const createRegistry = async (): Promise<{ root: string; url: string }> => {
  const registryRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
  const packageIndexDir = path.join(registryRoot, "packages", "frontend");
  await mkdir(packageIndexDir, { recursive: true });
  await writeFile(
    path.join(registryRoot, "index.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        packages: {
          frontend: {
            name: "frontend",
            description: "Frontend skills",
            latest: "1.0.0",
            versions: ["1.0.0"]
          }
        }
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(packageIndexDir, "index.json"),
    JSON.stringify(
      {
        name: "frontend",
        description: "Frontend skills",
        versions: {
          "1.0.0": {
            manifest: {
              name: "frontend",
              version: "1.0.0",
              description: "Frontend skills",
              dependencies: {},
              files: ["skills/**"],
              license: "MIT",
              author: "Tests"
            },
            integrity: "sha256-test",
            tarball: "tarballs/frontend/1.0.0.tgz"
          }
        }
      },
      null,
      2
    )
  );
  return { root: registryRoot, url: pathToFileURL(registryRoot).toString() };
};

describe("registry utilities", () => {
  it("creates deterministic registry cache paths", () => {
    const first = getRegistryCachePath("https://example.com/registry.git", "/tmp");
    const second = getRegistryCachePath("https://example.com/registry.git", "/tmp");
    expect(first).toBe(second);
  });

  it("lists skill names and versions", async () => {
    const registry = await createRegistry();
    const names = await listSkillNames(registry.root, registry.url);
    expect(names).toEqual(["frontend"]);
    const versions = await listSkillVersions(registry.root, registry.url, "frontend");
    expect(versions).toEqual(["1.0.0"]);
  });

  it("scans registry entries with manifests", async () => {
    const registry = await createRegistry();
    const entries = await scanRegistry(registry.root, registry.url);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("frontend");
    expect(entries[0].manifest.description).toBe("Frontend skills");
    expect(entries[0].manifest.name).toBe("frontend");
  });
});
