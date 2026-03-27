import { glob } from "glob";
import { validateFiles } from "./validate-data.js";

const raceFiles = await glob("content/race/**/index.md");

if (raceFiles.length === 0) {
  console.error("No race files found");
  process.exit(1);
}

const success = await validateFiles("schemas/races.schema.yaml", raceFiles, {
  frontmatter: true,
});
process.exit(success ? 0 : 1);
