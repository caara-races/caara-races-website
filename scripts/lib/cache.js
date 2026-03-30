import fs from "node:fs/promises";
import path from "node:path";

export async function readCache(cacheDir, key, ttlMs) {
  const filePath = path.join(cacheDir, `${key}.json`);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const cached = JSON.parse(content);
    if (Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
  } catch {
    // Cache miss, expired, or invalid JSON
  }
  return null;
}

export async function writeCache(cacheDir, key, data) {
  await fs.mkdir(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `${key}.json`);
  await fs.writeFile(
    filePath,
    JSON.stringify({ timestamp: Date.now(), data }),
    "utf8",
  );
}
