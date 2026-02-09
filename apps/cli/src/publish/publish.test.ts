import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { publishPackage } from "./publish";

const createPackage = async (root: string): Promise<string> => {
  const packageRoot = path.join(root, "package");
  await mkdir(path.join(packageRoot, "skills"), { recursive: true });
  await writeFile(path.join(packageRoot, "skills", "demo.md"), "hello");
  await writeFile(
    path.join(packageRoot, "skpm.json"),
    JSON.stringify(
      {
        name: "demo-skill",
        version: "1.0.0",
        description: "Demo skill",
        dependencies: {},
        files: ["skills/**"],
        license: "MIT",
        author: "Tests",
        skills: [{ source: "skills/demo.md" }]
      },
      null,
      2
    )
  );
  return packageRoot;
};

describe("publish", () => {
  it("publishes tarball + metadata to a registry directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));
    const packageRoot = await createPackage(root);
    const registryUrl = pathToFileURL(root).toString();

    const result = await publishPackage({
      packageRoot,
      registryUrl
    });

    const tarballPath = path.join(root, result.tarball);
    const tarballStat = await readFile(tarballPath);
    expect(tarballStat.length).toBeGreaterThan(0);

    const indexText = await readFile(path.join(root, "index.json"), "utf-8");
    const index = JSON.parse(indexText) as {
      packages: Record<string, { versions: string[] }>;
    };
    expect(index.packages["demo-skill"].versions).toContain("1.0.0");

    const packageIndexText = await readFile(
      path.join(root, "packages", "demo-skill", "index.json"),
      "utf-8"
    );
    const packageIndex = JSON.parse(packageIndexText) as {
      versions: Record<string, { integrity: string; tarball: string }>;
    };
    expect(packageIndex.versions["1.0.0"].tarball).toBe(
      "tarballs/demo-skill/1.0.0.tgz"
    );
    expect(packageIndex.versions["1.0.0"].integrity).toContain("sha256-");
  });

  it("fails when file patterns match nothing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-"));

    const packageRoot = path.join(root, "bad-package");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, "skpm.json"),
      JSON.stringify(
        {
          name: "bad-skill",
          version: "0.1.0",
          description: "Bad skill",
          dependencies: {},
          files: ["missing/**"],
          license: "MIT",
          author: "Tests"
        },
        null,
        2
      )
    );

    await expect(
      publishPackage({
        packageRoot,
        registryUrl: pathToFileURL(root).toString()
      })
    ).rejects.toThrow(/No files match pattern/);
  });
});
