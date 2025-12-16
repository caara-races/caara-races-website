import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { lint, readConfig } from "markdownlint/promise";

async function findMarkdownFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(join(entry.parentPath || entry.path, entry.name));
    }
  }

  return files;
}

async function validateMarkdown() {
  try {
    // Find all markdown files in content/ and include README.md
    const contentFiles = await findMarkdownFiles("content");
    const files = [...contentFiles, "README.md"];

    if (files.length === 0) {
      console.log("No markdown files found in content/");
      process.exit(0);
    }

    // Load configuration if it exists
    let config;
    try {
      config = await readConfig(".markdownlint.json");
    } catch {
      // No config file found, use defaults
      config = undefined;
    }

    // Lint the markdown files
    const results = await lint({ files, config });

    // Check for violations
    let hasErrors = false;
    for (const [file, violations] of Object.entries(results)) {
      if (violations.length > 0) {
        if (!hasErrors) {
          console.error("markdown validation failed:");
          hasErrors = true;
        }
        console.error(`\n${file}:`);
        for (const violation of violations) {
          console.error(
            `  - line ${violation.lineNumber}: ${violation.ruleNames[0]} - ${violation.ruleDescription}`,
          );
        }
      }
    }

    if (hasErrors) {
      process.exit(1);
    }

    console.log("markdown validation successful.");
    process.exit(0);
  } catch (error) {
    console.error("Error during validation:");
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

validateMarkdown();
