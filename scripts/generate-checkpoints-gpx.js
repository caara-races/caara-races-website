import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import {
  readCache as libReadCache,
  writeCache as libWriteCache,
} from "./lib/cache.js";
import { escapeHtml } from "./lib/escape.js";
import { extractFrontmatter } from "./lib/frontmatter.js";

const CACHE_DIR = ".cache/geocoding";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cacheKey(address) {
  return createHash("sha256").update(address).digest("hex");
}

function formatCoords(lat, lon) {
  return `${lat.toFixed(6).padStart(10)}, ${lon.toFixed(6).padStart(11)}`;
}

async function readCache(address) {
  return libReadCache(CACHE_DIR, cacheKey(address), CACHE_TTL_MS);
}

async function writeCache(address, lat, lon) {
  return libWriteCache(CACHE_DIR, cacheKey(address), { lat, lon });
}

async function geocode(address, apiKey) {
  const cached = await readCache(address);
  if (cached) return { ...cached, cached: true };

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
  return { lat, lon: lng, cached: false };
}

function buildGpx(title, waypoints) {
  const time = new Date().toISOString();
  const wptElements = waypoints
    .map(({ name, desc, lat, lon, sym }) => {
      const symEl = sym ? `\n    <sym>${escapeHtml(sym)}</sym>` : "";
      return `  <wpt lat="${lat}" lon="${lon}">\n    <name>${escapeHtml(name)}</name>\n    <desc>${escapeHtml(desc)}</desc>${symEl}\n  </wpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="caara-races/generate-checkpoints-gpx" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeHtml(title)} Checkpoints</name>
    <time>${time}</time>
  </metadata>
${wptElements}
</gpx>
`;
}

async function main() {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not set");

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filter = args.find((a) => !a.startsWith("--"));

  const raceFiles = (await glob("content/race/**/index.md")).sort();

  for (const filePath of raceFiles) {
    const raceDir = path.dirname(filePath);
    const slug = path.basename(raceDir);
    const year = path.basename(path.dirname(raceDir));

    if (filter && `${year}/${slug}` !== filter) continue;

    const content = await readFile(filePath, "utf8");
    let frontmatter;
    try {
      frontmatter = extractFrontmatter(filePath, content);
    } catch (err) {
      console.warn(`WARN: ${err.message}, skipping`);
      continue;
    }

    const location = frontmatter.race?.start;
    const checkpoints = frontmatter.race?.checkpoints;
    if (!checkpoints || Object.keys(checkpoints).length === 0) {
      console.log(`${filePath}: no checkpoints, skipping`);
      continue;
    }

    const outPath = path.join(raceDir, `${slug}-checkpoints.gpx`);

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

    if (location) {
      let startCoords = null;
      if (location.coordinates) {
        const [lat, lon] = location.coordinates
          .split(",")
          .map((s) => parseFloat(s.trim()));
        startCoords = { lat, lon };
        console.log(
          `  START: ${formatCoords(lat, lon)} (from coordinates field)`,
        );
      } else {
        const startName = location.name ?? "Start";
        const geocodeAddress = `${startName}, ${location.address.replace(/(\r\n|\n|\r)/g, ", ")}`;
        startCoords = await geocode(geocodeAddress, apiKey);
        if (startCoords) {
          console.log(
            `  START: ${formatCoords(startCoords.lat, startCoords.lon)}${startCoords.cached ? " [cached]" : ""}`,
          );
        } else {
          console.warn(
            `  WARN: failed to geocode start/finish location, skipping`,
          );
        }
      }
      if (startCoords) {
        const startName = location.name ?? "Start";
        waypoints.push({
          name: "START",
          desc: `${startName}\n${location.address}`,
          lat: startCoords.lat,
          lon: startCoords.lon,
          sym: "Flag, Green",
        });
      }
    }

    const finish = frontmatter.race?.finish;
    if (finish) {
      let finishCoords = null;
      if (finish.coordinates) {
        const [lat, lon] = finish.coordinates
          .split(",")
          .map((s) => parseFloat(s.trim()));
        finishCoords = { lat, lon };
        console.log(
          `  FINISH: ${formatCoords(lat, lon)} (from coordinates field)`,
        );
      } else {
        const finishName = finish.name ?? "Finish";
        const geocodeAddress = `${finishName}, ${finish.address.replace(/(\r\n|\n|\r)/g, ", ")}`;
        finishCoords = await geocode(geocodeAddress, apiKey);
        if (finishCoords) {
          console.log(
            `  FINISH: ${formatCoords(finishCoords.lat, finishCoords.lon)}${finishCoords.cached ? " [cached]" : ""}`,
          );
        } else {
          console.warn(`  WARN: failed to geocode finish location, skipping`);
        }
      }
      if (finishCoords) {
        const finishName = finish.name ?? "Finish";
        waypoints.push({
          name: "FINISH",
          desc: `${finishName}\n${finish.address}`,
          lat: finishCoords.lat,
          lon: finishCoords.lon,
          sym: "Flag, Red",
        });
      }
    }

    for (const [key, cp] of Object.entries(checkpoints)) {
      const name = cp.name ?? key.toUpperCase();
      let coords;

      if (cp.coordinates) {
        const [lat, lon] = cp.coordinates
          .split(",")
          .map((s) => parseFloat(s.trim()));
        coords = { lat, lon };
        console.log(
          `  ${name}: ${formatCoords(lat, lon)} (from coordinates field)`,
        );
      } else if (cp.address) {
        coords = await geocode(cp.address, apiKey);
        if (!coords) {
          console.warn(
            `  WARN: failed to geocode "${cp.address}" (${key}), skipping`,
          );
          continue;
        }
        console.log(
          `  ${name}: ${formatCoords(coords.lat, coords.lon)}${coords.cached ? " [cached]" : ""}`,
        );
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
