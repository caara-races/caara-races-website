import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv from "ajv";
import yaml from "yaml";
import { extractFrontmatter } from "./lib/frontmatter.js";

async function parseFile(filePath) {
  const content = await readFile(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return yaml.parse(content);
  }
  return JSON.parse(content);
}

export async function validateFiles(
  schemaPath,
  dataFiles,
  { frontmatter = false } = {},
) {
  const schema = await parseFile(schemaPath);
  const ajv = new Ajv();
  const validate = ajv.compile(schema);

  let hasErrors = false;

  for (const filePath of dataFiles) {
    let data;
    try {
      if (frontmatter) {
        const content = await readFile(filePath, "utf8");
        data = extractFrontmatter(filePath, content);
      } else {
        data = await parseFile(filePath);
      }
    } catch (err) {
      console.error(`${filePath}: failed to parse: ${err.message}`);
      hasErrors = true;
      continue;
    }

    const valid = validate(data);
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
      console.log(`✓ ${filePath}`);
    }
  }

  if (hasErrors) {
    console.error("\nValidation failed.");
  }

  return !hasErrors;
}

// CLI entry point — only runs when executed directly, not when imported
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const args = process.argv.slice(2);
  const usage =
    "Usage: validate-data.js [--frontmatter|-f] <schema-path> <data-file> [data-file...]";

  const frontmatter = args[0] === "--frontmatter" || args[0] === "-f";
  const rest = frontmatter ? args.slice(1) : args;
  const [schemaPath, ...dataFiles] = rest;

  if (!schemaPath || dataFiles.length === 0) {
    console.error(usage);
    process.exit(1);
  }

  try {
    const success = await validateFiles(schemaPath, dataFiles, { frontmatter });
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("Error during validation:");
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}
