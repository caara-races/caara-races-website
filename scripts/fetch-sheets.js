import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import yaml from "yaml";

const CREDS_PATH = ".creds/caara-races-fe63879fe58a.json";

export function extractFrontmatter(filePath, content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${filePath}: No frontmatter found`);
  return yaml.parse(match[1]);
}

export function extractSpreadsheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error(`Cannot extract spreadsheet ID from: ${url}`);
  return match[1];
}

async function main() {
  const creds = JSON.parse(await readFile(CREDS_PATH, "utf8"));
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const raceFiles = await glob("content/race/*/index.md");
  for (const filePath of raceFiles) {
    const content = await readFile(filePath, "utf8");
    const data = extractFrontmatter(filePath, content);
    if (!data.race?.sheet) continue;

    console.log(`${filePath}: fetching sheet data...`);
    const id = extractSpreadsheetId(data.race.sheet);
    const doc = new GoogleSpreadsheet(id, auth);
    await doc.loadInfo();
    const slug = path
      .basename(path.dirname(filePath))
      .replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const sheet = doc.sheetsByTitle[slug];
    if (!sheet) throw new Error(`No sheet tab named "${slug}" in spreadsheet`);
    const rows = await sheet.getRows();
    const volunteers = rows.map((row) => row.toObject());

    const outPath = path.join(path.dirname(filePath), "_data.11tydata.json");
    await writeFile(outPath, JSON.stringify({ volunteers }, null, 2));
    console.log(`${filePath}: wrote ${volunteers.length} rows → ${outPath}`);
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
