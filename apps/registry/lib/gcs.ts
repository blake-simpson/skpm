import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

const createStorageClient = (): Storage => {
  const credentialsJson = process.env.SKPM_GCS_CREDENTIALS_JSON?.trim();
  if (credentialsJson) {
    return new Storage({ credentials: JSON.parse(credentialsJson) });
  }
  return new Storage();
};

const getStorage = (): Storage => {
  if (!storage) {
    storage = createStorageClient();
  }
  return storage;
};

export const getBucketName = (): string => {
  const bucket = process.env.SKPM_GCS_BUCKET?.trim();
  if (!bucket) {
    throw new Error("Missing SKPM_GCS_BUCKET environment variable.");
  }
  return bucket;
};

export const getBucket = () => getStorage().bucket(getBucketName());

export const readJson = async <T>(targetPath: string): Promise<T | null> => {
  const file = getBucket().file(targetPath);
  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }
  const [buffer] = await file.download();
  return JSON.parse(buffer.toString("utf-8")) as T;
};

export const writeJson = async (targetPath: string, payload: unknown): Promise<void> => {
  const file = getBucket().file(targetPath);
  const contents = JSON.stringify(payload, null, 2);
  await file.save(contents, {
    contentType: "application/json; charset=utf-8",
    resumable: false
  });
};

export const uploadTarball = async (targetPath: string, bytes: Uint8Array): Promise<void> => {
  const file = getBucket().file(targetPath);
  await file.save(Buffer.from(bytes), {
    contentType: "application/gzip",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
};
