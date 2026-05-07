import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { escapeHtml } from "./lib/escape.js";
import { extractFrontmatter } from "./lib/frontmatter.js";
import { resolveLocation } from "./lib/geocode.js";

function formatSource(source) {
  if (source === "coordinates") return " (from coordinates field)";
  if (source === "cached") return " [cached]";
  return "";
}

function formatCoords(lat, lon) {
  return `${lat.toFixed(6).padStart(10)}, ${lon.toFixed(6).padStart(11)}`;
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

export async function main() {
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
      const startCoords = await resolveLocation(location, apiKey);
      if (startCoords) {
        console.log(
          `  START: ${formatCoords(startCoords.lat, startCoords.lon)}${formatSource(startCoords.source)}`,
        );
        waypoints.push({
          name: "START",
          desc: `${location.name ?? "Start"}\n${location.address}`,
          lat: startCoords.lat,
          lon: startCoords.lon,
          sym: "Flag, Green",
        });
      } else {
        console.warn(`  WARN: failed to geocode start location, skipping`);
      }
    }

    const finish = frontmatter.race?.finish;
    if (finish) {
      const finishCoords = await resolveLocation(finish, apiKey);
      if (finishCoords) {
        console.log(
          `  FINISH: ${formatCoords(finishCoords.lat, finishCoords.lon)}${formatSource(finishCoords.source)}`,
        );
        waypoints.push({
          name: "FINISH",
          desc: `${finish.name ?? "Finish"}\n${finish.address}`,
          lat: finishCoords.lat,
          lon: finishCoords.lon,
          sym: "Flag, Red",
        });
      } else {
        console.warn(`  WARN: failed to geocode finish location, skipping`);
      }
    }

    for (const [key, cp] of Object.entries(checkpoints)) {
      const name = cp.name ?? key.toUpperCase();

      if (!cp.address) {
        console.warn(`  WARN: ${key} has no address, skipping`);
        continue;
      }

      const coords = await resolveLocation(cp, apiKey);
      if (!coords) {
        console.warn(
          `  WARN: failed to geocode "${cp.address}" (${key}), skipping`,
        );
        continue;
      }

      console.log(
        `  ${name}: ${formatCoords(coords.lat, coords.lon)}${formatSource(coords.source)}`,
      );
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
