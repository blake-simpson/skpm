import { describe, expect, it } from "vitest";
import { validateLockfile, validatePackageManifest, validateProjectManifest } from "./schema";

describe("manifest schema validation", () => {
  it("accepts a valid project manifest", () => {
    const manifest = validateProjectManifest({
      name: "my-project",
      skills: {
        frontend: "^1.2.0"
      },
      registry: "https://example.com/registry.git",
      agentTargets: ["claude", "codex"]
    });

    expect(manifest.name).toBe("my-project");
    expect(manifest.skills.frontend).toBe("^1.2.0");
  });

  it("rejects unknown fields in project manifest", () => {
    expect(() =>
      validateProjectManifest({
        name: "my-project",
        skills: {
          core: "^1.0.0"
        },
        extra: true
      })
    ).toThrow();
  });

  it("rejects invalid semver ranges", () => {
    expect(() =>
      validateProjectManifest({
        name: "my-project",
        skills: {
          core: "not-a-range"
        }
      })
    ).toThrow();
  });

  it("accepts a valid package manifest", () => {
    const manifest = validatePackageManifest({
      name: "frontend",
      version: "1.2.3",
      description: "Frontend skills",
      dependencies: {
        core: "^2.0.0"
      },
      files: ["skills/**"],
      license: "MIT",
      author: "Example",
      skills: [{ source: "skills/**" }],
      agents: [{ source: "agents/**" }]
    });

    expect(manifest.name).toBe("frontend");
    expect(manifest.version).toBe("1.2.3");
  });

  it("rejects invalid package versions", () => {
    expect(() =>
      validatePackageManifest({
        name: "frontend",
        version: "bad",
        description: "Frontend skills",
        files: ["skills/**"],
        license: "MIT",
        author: "Example"
      })
    ).toThrow();
  });

  it("validates lockfile structure", () => {
    const lockfile = validateLockfile({
      lockfileVersion: 1,
      registry: "https://example.com/registry.git",
      root: {
        name: "my-project",
        skills: {
          frontend: "^1.0.0"
        }
      },
      packages: {
        "frontend@1.2.0": {
          name: "frontend",
          version: "1.2.0",
          dependencies: {},
          resolved: {},
          integrity: "sha256-test"
        }
      }
    });

    expect(lockfile.packages["frontend@1.2.0"].integrity).toBe("sha256-test");
  });
});
