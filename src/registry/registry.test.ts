import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRegistryCachePath,
  listSkillNames,
  listSkillVersions,
  scanRegistry
} from "./registry";

const createRegistry = async (): Promise<string> => {
  const registryRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
  const skillDir = path.join(registryRoot, "skills", "frontend", "1.0.0");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "skpm.json"),
    JSON.stringify(
      {
        name: "frontend",
        version: "1.0.0",
        description: "Frontend skills",
        dependencies: {},
        files: ["skills/**"],
        license: "MIT",
        author: "Tests"
      },
      null,
      2
    )
  );
  return registryRoot;
};

describe("registry utilities", () => {
  it("creates deterministic registry cache paths", () => {
    const first = getRegistryCachePath("https://example.com/registry.git", "/tmp");
    const second = getRegistryCachePath("https://example.com/registry.git", "/tmp");
    expect(first).toBe(second);
  });

  it("lists skill names and versions", async () => {
    const registryRoot = await createRegistry();
    const names = await listSkillNames(registryRoot);
    expect(names).toEqual(["frontend"]);
    const versions = await listSkillVersions(registryRoot, "frontend");
    expect(versions).toEqual(["1.0.0"]);
  });

  it("scans registry entries with manifests", async () => {
    const registryRoot = await createRegistry();
    const entries = await scanRegistry(registryRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("frontend");
    expect(entries[0].manifest.description).toBe("Frontend skills");
    const manifestText = await readFile(
      path.join(entries[0].path, "skpm.json"),
      "utf-8"
    );
    expect(JSON.parse(manifestText).name).toBe("frontend");
  });
});
