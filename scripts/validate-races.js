import { readFile } from "node:fs/promises";
import Ajv from "ajv-draft-04";
import { glob } from "glob";
import yaml from "yaml";

async function validateRaces() {
  try {
    // Read schema and extract item schema
    const schemaRaw = await readFile("schemas/races.schema.json", "utf8");
    const schema = JSON.parse(schemaRaw);
    const itemSchema = schema.items; // Validate single object, not array

    // Find all race markdown files
    const raceFiles = await glob("content/race/*/index.md");

    if (raceFiles.length === 0) {
      console.error("No race files found");
      process.exit(1);
    }

    // Setup validation
    const ajv = new Ajv();
    const validate = ajv.compile(itemSchema);

    let hasErrors = false;
    const races = [];

    // Validate each file
    for (const filePath of raceFiles) {
      const content = await readFile(filePath, "utf8");

      // Extract frontmatter between --- delimiters
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) {
        console.error(`${filePath}: No frontmatter found`);
        hasErrors = true;
        continue;
      }

      const frontmatter = yaml.parse(match[1]);

      // Remove Eleventy-specific fields before validation
      const raceData = { ...frontmatter };
      const valid = validate(raceData);

      if (!valid) {
        console.error(`${filePath}: validation failed:`);
        for (const err of validate.errors) {
          console.error(`  - ${err.instancePath || "/"}: ${err.message}`);
          if (err.params) {
            console.error(`    Details: ${JSON.stringify(err.params)}`);
          }
        }
        hasErrors = true;
      } else {
        races.push({ file: filePath, data: raceData });
      }
    }

    if (hasErrors) {
      console.error("\nValidation failed.");
      process.exit(1);
    }

    console.log(`✓ Validated ${races.length} race files successfully.`);
    process.exit(0);
  } catch (error) {
    console.error("Error during validation:");
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

validateRaces();
