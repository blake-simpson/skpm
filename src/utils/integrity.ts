import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const toPosixPath = (entry: string): string => entry.split(path.sep).join("/");

const listFiles = async (root: string, relativeBase = ""): Promise<string[]> => {
  const entries = await readdir(path.join(root, relativeBase), { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      results.push(relativePath);
    }
  }
  return results;
};

export const hashFiles = async (root: string, files: string[]): Promise<string> => {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => a.localeCompare(b));
  for (const filePath of sorted) {
    const normalized = toPosixPath(filePath);
    hash.update(normalized);
    hash.update("\u0000");
    const contents = await readFile(path.join(root, filePath));
    hash.update(contents);
  }
  return `sha256-${hash.digest("hex")}`;
};

export const hashDirectory = async (root: string): Promise<string> => {
  const files = await listFiles(root);
  return hashFiles(root, files);
};
