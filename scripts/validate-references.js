import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import yaml from "yaml";
import { extractFrontmatter } from "./lib/frontmatter.js";

async function loadYamlKeys(filePath) {
  const content = await readFile(filePath, "utf8");
  const data = yaml.parse(content);
  return new Set(Object.keys(data));
}

export async function validateReferences(raceFiles, { repeaters, towns }) {
  let hasErrors = false;

  for (const filePath of raceFiles) {
    const content = await readFile(filePath, "utf8");
    const data = extractFrontmatter(filePath, content);
    const errors = [];

    const primary = data.race?.frequency?.primary;
    if (primary && !repeaters.has(primary)) {
      errors.push(`race.frequency.primary: unknown repeater "${primary}"`);
    }

    const backup = data.race?.frequency?.backup;
    if (backup && !repeaters.has(backup)) {
      errors.push(`race.frequency.backup: unknown repeater "${backup}"`);
    }

    const raceTowns = data.race?.towns;
    if (Array.isArray(raceTowns)) {
      for (const town of raceTowns) {
        if (!towns.has(town)) {
          errors.push(`race.towns: unknown town "${town}"`);
        }
      }
    }

    if (errors.length > 0) {
      console.error(`${filePath}: invalid references:`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      hasErrors = true;
    } else {
      console.log(`\u2713 ${filePath}`);
    }
  }

  if (hasErrors) {
    console.error("\nReference validation failed.");
  }

  return !hasErrors;
}

// CLI entry point — only runs when executed directly, not when imported
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const raceFiles = await glob("content/race/**/index.md");

  if (raceFiles.length === 0) {
    console.error("No race files found");
    process.exit(1);
  }

  const repeaters = await loadYamlKeys("content/_data/repeaters.yaml");
  const towns = await loadYamlKeys("content/_data/towns.yaml");

  const success = await validateReferences(raceFiles, { repeaters, towns });
  process.exit(success ? 0 : 1);
}
