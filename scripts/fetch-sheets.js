import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { extractFrontmatter } from "./lib/frontmatter.js";

export { extractFrontmatter };

export function extractSpreadsheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error(`Cannot extract spreadsheet ID from: ${url}`);
  return match[1];
}

export async function resolveSheetUrl(filePath, frontmatter) {
  if (frontmatter.race?.sheet) return frontmatter.race.sheet;

  const parentDataFile = path.join(
    path.dirname(filePath),
    "..",
    "_data.11tydata.json",
  );
  try {
    const content = await readFile(parentDataFile, "utf8");
    const data = JSON.parse(content);
    return data.race?.sheet ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const credsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  if (!credsPath) throw new Error("GOOGLE_SHEETS_CREDENTIALS_PATH is not set");
  const creds = JSON.parse(await readFile(credsPath, "utf8"));
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const raceFiles = await glob("content/race/*/*/index.md");

  // Group races by spreadsheet URL so each sheet is loaded only once.
  const bySheet = new Map();
  for (const filePath of raceFiles) {
    const content = await readFile(filePath, "utf8");
    const frontmatter = extractFrontmatter(filePath, content);
    const sheetUrl = await resolveSheetUrl(filePath, frontmatter);
    if (!sheetUrl) {
      console.warn(`${filePath}: no sheet URL found, skipping`);
      continue;
    }
    const slug = path
      .basename(path.dirname(filePath))
      .replace(/^\d{4}-\d{2}-\d{2}-/, "");
    if (!bySheet.has(sheetUrl)) bySheet.set(sheetUrl, []);
    bySheet.get(sheetUrl).push({ filePath, slug });
  }

  for (const [sheetUrl, races] of bySheet) {
    const id = extractSpreadsheetId(sheetUrl);
    const doc = new GoogleSpreadsheet(id, auth);
    await doc.loadInfo();

    for (const { filePath, slug } of races) {
      console.log(`${filePath}: fetching sheet data...`);
      const sheet = doc.sheetsByTitle[slug];
      if (!sheet) {
        console.warn(`${filePath}: no sheet tab named "${slug}", skipping`);
        continue;
      }
      const rows = await sheet.getRows();
      const volunteers = rows.map((row) => row.toObject());

      const outPath = path.join(path.dirname(filePath), "_data.11tydata.json");
      await writeFile(outPath, JSON.stringify({ volunteers }, null, 2));
      console.log(`${filePath}: wrote ${volunteers.length} rows → ${outPath}`);
    }
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
