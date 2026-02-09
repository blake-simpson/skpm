import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "./init";

const createTempProject = async (): Promise<string> =>
  mkdtemp(path.join(os.tmpdir(), "skpm-cli-"));

describe("runInit", () => {
  it("creates a skpm.json with provided name", async () => {
    const projectRoot = await createTempProject();
    await runInit(
      {
        projectRoot,
        json: true,
        logger: { log: () => {}, warn: () => {}, error: () => {} }
      },
      {
        name: "example-project",
        prompt: async () => ""
      }
    );

    const manifestPath = path.join(projectRoot, "skpm.json");
    const contents = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(contents) as { name: string; skills: Record<string, string> };

    expect(parsed.name).toBe("example-project");
    expect(parsed.skills).toEqual({});
  });
});
