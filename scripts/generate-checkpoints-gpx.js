import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import yaml from "yaml";

const CACHE_DIR = ".cache/geocoding";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cacheKey(address) {
  return createHash("sha256").update(address).digest("hex");
}

async function readCache(address) {
  const filePath = path.join(CACHE_DIR, `${cacheKey(address)}.json`);
  try {
    const content = await readFile(filePath, "utf8");
    const cached = JSON.parse(content);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { lat: cached.lat, lon: cached.lon };
    }
  } catch {
    // Cache miss, expired, or invalid JSON
  }
  return null;
}

async function writeCache(address, lat, lon) {
  await mkdir(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, `${cacheKey(address)}.json`);
  await writeFile(
    filePath,
    JSON.stringify({ timestamp: Date.now(), lat, lon }),
    "utf8",
  );
}

async function geocode(address, apiKey) {
  const cached = await readCache(address);
  if (cached) return cached;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const json = await response.json();
  if (json.status !== "OK" || !json.results.length) {
    console.warn(
      `  WARN: geocoding API returned status ${json.status} for "${address}"`,
    );
    return null;
  }

  const { lat, lng } = json.results[0].geometry.location;
  await writeCache(address, lat, lng);
  return { lat, lon: lng };
}

function buildGpx(title, waypoints) {
  const time = new Date().toISOString();
  const wptElements = waypoints
    .map(
      ({ name, desc, lat, lon }) =>
        `  <wpt lat="${lat}" lon="${lon}">\n    <name>${escapeXml(name)}</name>\n    <desc>${escapeXml(desc)}</desc>\n  </wpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="caara-races/generate-checkpoints-gpx" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(title)} Checkpoints</name>
    <time>${time}</time>
  </metadata>
${wptElements}
</gpx>
`;
}

function extractFrontmatter(filePath, content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${filePath}: No frontmatter found`);
  return yaml.parse(match[1]);
}

async function main() {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not set");

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filter = args.find((a) => !a.startsWith("--"));

  const raceFiles = (await glob("content/race/*/*/index.md")).sort();

  for (const filePath of raceFiles) {
    const parts = filePath.split(path.sep);
    const year = parts[2];
    const slug = parts[3];

    if (filter && `${year}/${slug}` !== filter) continue;

    const content = await readFile(filePath, "utf8");
    let frontmatter;
    try {
      frontmatter = extractFrontmatter(filePath, content);
    } catch (err) {
      console.warn(`WARN: ${err.message}, skipping`);
      continue;
    }

    const checkpoints = frontmatter.race?.checkpoints;
    if (!checkpoints || Object.keys(checkpoints).length === 0) {
      console.log(`${filePath}: no checkpoints, skipping`);
      continue;
    }

    const outPath = path.join(
      path.dirname(filePath),
      `${slug}-checkpoints.gpx`,
    );

    if (!force) {
      try {
        await access(outPath);
        console.log(
          `${outPath}: already exists, skipping (use --force to overwrite)`,
        );
        continue;
      } catch {
        // File doesn't exist, proceed
      }
    }

    console.log(
      `${filePath}: geocoding ${Object.keys(checkpoints).length} checkpoints...`,
    );

    const waypoints = [];

    for (const [key, cp] of Object.entries(checkpoints)) {
      const name = key.toUpperCase();
      let coords;

      if (cp.coordinates) {
        const [lat, lon] = cp.coordinates
          .split(",")
          .map((s) => parseFloat(s.trim()));
        coords = { lat, lon };
        console.log(`  ${name}: ${lat}, ${lon} (from coordinates field)`);
      } else if (cp.address) {
        coords = await geocode(cp.address, apiKey);
        if (!coords) {
          console.warn(
            `  WARN: failed to geocode "${cp.address}" (${key}), skipping`,
          );
          continue;
        }
        console.log(`  ${name}: ${coords.lat}, ${coords.lon}`);
      } else {
        console.warn(`  WARN: ${key} has no coordinates or address, skipping`);
        continue;
      }
      waypoints.push({
        name,
        desc: cp.address,
        lat: coords.lat,
        lon: coords.lon,
      });
    }

    if (waypoints.length === 0) {
      console.warn(`  WARN: all checkpoints failed geocoding, not writing GPX`);
      continue;
    }

    const gpx = buildGpx(frontmatter.title, waypoints);
    await writeFile(outPath, gpx, "utf8");
    console.log(`  Wrote ${waypoints.length} waypoints → ${outPath}`);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
