import { NextResponse } from "next/server";
import { validateBearerToken } from "../../../lib/auth";
import { uploadTarball, writeJson } from "../../../lib/gcs";
import { loadPackageIndex, loadRootIndex, withPublishedVersion } from "../../../lib/registry";
import { validatePublishMetadata } from "../../../lib/validators";
import { ZodError } from "zod";

export const runtime = "nodejs";

const parseMetadata = (raw: FormDataEntryValue | null): ReturnType<typeof validatePublishMetadata> => {
  if (typeof raw !== "string") {
    throw new Error("metadata form field is required");
  }
  return validatePublishMetadata(JSON.parse(raw));
};

const parseTarball = async (raw: FormDataEntryValue | null): Promise<Uint8Array> => {
  if (!(raw instanceof File)) {
    throw new Error("tarball file is required");
  }
  const buffer = await raw.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("tarball cannot be empty");
  }
  return new Uint8Array(buffer);
};

const GZIP_MAGIC = [0x1f, 0x8b];

const assertGzipBytes = (bytes: Uint8Array): void => {
  if (bytes.length < 2 || bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) {
    throw new Error("Uploaded tarball is not a valid gzip archive");
  }
};

export async function POST(request: Request): Promise<Response> {
  try {
    if (!validateBearerToken(request.headers.get("authorization"))) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const metadata = parseMetadata(formData.get("metadata"));
    const tarballBytes = await parseTarball(formData.get("tarball"));

    assertGzipBytes(tarballBytes);

    const tarballPath = `tarballs/${metadata.name}/${metadata.version}.tgz`;
    if (metadata.tarball !== tarballPath) {
      return NextResponse.json(
        {
          ok: false,
          error: `Tarball path mismatch. Expected ${tarballPath}.`
        },
        { status: 400 }
      );
    }

    if (!metadata.integrity) {
      return NextResponse.json(
        { ok: false, error: "Client must provide integrity hash." },
        { status: 400 }
      );
    }

    const rootIndex = await loadRootIndex();
    const packageIndex = await loadPackageIndex(metadata.name);
    const updated = withPublishedVersion({ metadata, rootIndex, packageIndex });

    await uploadTarball(tarballPath, tarballBytes);
    await writeJson(`packages/${metadata.name}/index.json`, updated.packageIndex);
    await writeJson("index.json", updated.rootIndex);

    return NextResponse.json({ ok: true, name: metadata.name, version: metadata.version });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "Invalid metadata JSON" }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid metadata payload" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message.startsWith("Version already exists:")) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
      }
      if (
        error.message.includes("required") ||
        error.message.includes("cannot be empty") ||
        error.message.includes("Tarball path mismatch") ||
        error.message.includes("not a valid gzip")
      ) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal Server Error"
      },
      { status: 500 }
    );
  }
}
