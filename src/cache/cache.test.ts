import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensurePackageCached, getCachedPackagePath } from "./cache";

const createRegistryPackage = async (
  root: string,
  name: string,
  version: string
): Promise<string> => {
  const packageDir = path.join(root, "skills", name, version);
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "README.md"), `# ${name}`);
  await writeFile(
    path.join(packageDir, "skpm.json"),
    JSON.stringify(
      {
        name,
        version,
        description: `${name} skills`,
        dependencies: {},
        files: ["skills/**"],
        license: "MIT",
        author: "Tests"
      },
      null,
      2
    )
  );
  return packageDir;
};

describe("cache", () => {
  it("copies packages into the global cache", async () => {
    const registryRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
    await createRegistryPackage(registryRoot, "frontend", "1.2.0");
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-cache-"));

    const cachedPath = await ensurePackageCached({
      registryPath: registryRoot,
      name: "frontend",
      version: "1.2.0",
      baseDir: cacheRoot
    });

    const expectedPath = getCachedPackagePath({
      name: "frontend",
      version: "1.2.0",
      baseDir: cacheRoot
    });
    expect(cachedPath).toBe(expectedPath);
    const readme = await readFile(path.join(cachedPath, "README.md"), "utf-8");
    expect(readme).toContain("frontend");
  });
});
