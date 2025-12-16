import { readFile } from "node:fs/promises";
import Ajv from "ajv-draft-04";
import yaml from "yaml";

async function validateRaces() {
  try {
    // Read and parse the JSON schema
    const schemaRaw = await readFile("content/races/races.schema.json", "utf8");
    const schema = JSON.parse(schemaRaw);

    // Read and parse the YAML file
    const yamlRaw = await readFile("content/races/races.yaml", "utf8");
    const data = yaml.parse(yamlRaw);

    // Validate using Ajv
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      // Report validation errors
      console.error("races.yaml validation failed:");
      for (const err of validate.errors) {
        console.error(`  - ${err.instancePath || "/"}: ${err.message}`);
        if (err.params) {
          console.error(`    Details: ${JSON.stringify(err.params)}`);
        }
      }
      process.exit(1);
    }

    console.log("races.yaml validation successful.");
    process.exit(0);
  } catch (error) {
    console.error("Error during validation:");
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

validateRaces();
