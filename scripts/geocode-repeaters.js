import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { resolveLocation } from "./lib/geocode.js";

const REPEATERS_PATH = "content/_data/repeaters.yaml";
const OUTPUT_PATH = "content/_data/repeaterCoords.json";

export async function main() {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not set");

  const content = await readFile(REPEATERS_PATH, "utf8");
  const repeaters = YAML.parse(content);

  console.log(
    `Geocoding ${Object.keys(repeaters).length} repeater locations...`,
  );

  const coords = {};

  for (const [key, repeater] of Object.entries(repeaters)) {
    const display = repeater.display ?? repeater.callsign.toUpperCase();

    if (!repeater.location?.address) {
      console.warn(`  WARN: ${key} has no location address, skipping`);
      continue;
    }

    const result = await resolveLocation(repeater.location, apiKey);
    if (!result) {
      console.warn(
        `  WARN: failed to geocode "${repeater.location.address}" (${key}), skipping`,
      );
      continue;
    }

    coords[key] = { lat: result.lat, lon: result.lon };
    const tag =
      result.source === "coordinates"
        ? " (from coordinates field)"
        : result.source === "cached"
          ? " [cached]"
          : "";
    console.log(
      `  ${display}: ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}${tag}`,
    );
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(coords, null, 2)}\n`, "utf8");
  console.log(
    `  Wrote ${Object.keys(coords).length} coordinates → ${OUTPUT_PATH}`,
  );
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
