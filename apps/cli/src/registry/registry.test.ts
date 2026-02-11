import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import type { ClientRequest } from "node:http";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertGzipArchive,
  downloadTarball,
  ensureRegistry,
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

const createHttpMockRegistry = (): {
  url: string;
  calls: { http: string[]; https: string[] };
  restore: () => void;
} => {
  const indexPayload = JSON.stringify(
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
  );

  const packagePayload = JSON.stringify(
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
  );

  const tarballBuffer = gzipSync(Buffer.from("skpm-test-tarball"));
  const url = "http://registry.test";
  const calls = { http: [] as string[], https: [] as string[] };

  const createResponse = (body: Buffer, headers: Record<string, string>): PassThrough => {
    const response = new PassThrough() as PassThrough & { statusCode?: number; headers: Record<string, string> };
    response.statusCode = 200;
    response.headers = headers;
    process.nextTick(() => {
      response.end(body);
    });
    return response;
  };

  const resolvePayload = (requestUrl: string): { body: Buffer; headers: Record<string, string> } => {
    if (requestUrl.endsWith("/packages/frontend/index.json")) {
      return { body: Buffer.from(packagePayload), headers: { "content-type": "application/json" } };
    }
    if (requestUrl.endsWith("/index.json")) {
      return { body: Buffer.from(indexPayload), headers: { "content-type": "application/json" } };
    }
    if (requestUrl.endsWith("/tarballs/frontend/1.0.0.tgz")) {
      return { body: tarballBuffer, headers: { "content-type": "application/gzip" } };
    }
    return { body: Buffer.from("Not Found"), headers: { "content-type": "text/plain" } };
  };

  const createGet =
    (bucket: "http" | "https") =>
    ((requestUrl: unknown, options?: unknown, callback?: unknown): ClientRequest => {
      const urlString =
        typeof requestUrl === "string"
          ? requestUrl
          : requestUrl instanceof URL
            ? requestUrl.toString()
            : String(requestUrl);
      calls[bucket].push(urlString);
      const payload = resolvePayload(urlString);
      const response = createResponse(payload.body, payload.headers);
      const cb = typeof options === "function" ? options : callback;
      process.nextTick(() => (cb as ((res: PassThrough) => void) | undefined)?.(response));
      return new PassThrough() as unknown as ClientRequest;
    }) as unknown as typeof http.get;

  const originalHttpGet = http.get;
  const originalHttpsGet = https.get;

  (http as unknown as { get: typeof http.get }).get = createGet("http");
  (https as unknown as { get: typeof https.get }).get = createGet("https");

  return {
    url,
    calls,
    restore: () => {
      (http as unknown as { get: typeof http.get }).get = originalHttpGet;
      (https as unknown as { get: typeof https.get }).get = originalHttpsGet;
    }
  };
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

  it("fetches metadata from http registry URLs", async () => {
    const registry = createHttpMockRegistry();
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-cache-"));
    try {
      const registryPath = await ensureRegistry({ registryUrl: registry.url, baseDir: cacheRoot });
      const names = await listSkillNames(registryPath, registry.url);
      const versions = await listSkillVersions(registryPath, registry.url, "frontend");
      expect(names).toEqual(["frontend"]);
      expect(versions).toEqual(["1.0.0"]);
      expect(registry.calls.http.some((url) => url.startsWith(registry.url))).toBe(true);
      expect(registry.calls.https).toHaveLength(0);
    } finally {
      registry.restore();
    }
  });

  it("throws user-friendly error for nonexistent package on file registry", async () => {
    const registry = await createRegistry();
    await expect(
      listSkillVersions(registry.root, registry.url, "nonexistent-pkg")
    ).rejects.toThrow("Package 'nonexistent-pkg' not found in registry.");
  });

  it("throws user-friendly error for unreachable registry", async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "skpm-registry-bad-"));
    await expect(
      ensureRegistry({ registryUrl: "/nonexistent/path/to/registry", baseDir: cacheRoot })
    ).rejects.toThrow("Unable to reach registry at /nonexistent/path/to/registry.");
  });

  it("downloads tarballs from http registry URLs", async () => {
    const registry = createHttpMockRegistry();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "skpm-tarball-"));
    const tarballPath = path.join(tempDir, "frontend-1.0.0.tgz");
    try {
      const result = await downloadTarball({
        registryUrl: registry.url,
        tarball: "tarballs/frontend/1.0.0.tgz",
        targetPath: tarballPath
      });
      await assertGzipArchive(tarballPath, `${registry.url}/tarballs/frontend/1.0.0.tgz`, result.contentType);
      expect(registry.calls.http.some((url) => url.includes("tarballs/frontend/1.0.0.tgz"))).toBe(true);
      expect(registry.calls.https).toHaveLength(0);
    } finally {
      registry.restore();
    }
  });
});
