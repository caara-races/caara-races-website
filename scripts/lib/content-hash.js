import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Compute a content hash from a list of strings. Used to detect when a
// generated file's inputs have changed, so pre-build steps can regenerate
// it without relying on "does the output file already exist".
export function hashContent(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function readStoredHash(hashPath) {
  try {
    return (await readFile(hashPath, "utf8")).trim();
  } catch {
    return null;
  }
}

export async function writeStoredHash(hashPath, hash) {
  await writeFile(hashPath, hash, "utf8");
}
