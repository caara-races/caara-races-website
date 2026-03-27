import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  extractFrontmatter,
  extractSpreadsheetId,
  resolveSheetUrl,
} from "./fetch-sheets.js";

describe("extractSpreadsheetId", () => {
  it("extracts ID from a standard Google Sheets URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1XzPijv-n7dFzoGK9roMNr12XNxfJET4HIs2mqLIQvOM/";
    assert.equal(
      extractSpreadsheetId(url),
      "1XzPijv-n7dFzoGK9roMNr12XNxfJET4HIs2mqLIQvOM",
    );
  });

  it("extracts ID from a URL with trailing path segments", () => {
    const url = "https://docs.google.com/spreadsheets/d/abc123-_XYZ/edit#gid=0";
    assert.equal(extractSpreadsheetId(url), "abc123-_XYZ");
  });

  it("throws on a URL with no spreadsheet ID", () => {
    assert.throws(
      () => extractSpreadsheetId("https://docs.google.com/spreadsheets/"),
      /Cannot extract spreadsheet ID/,
    );
  });
});

describe("extractFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = "---\ntitle: Test Race\nrace:\n  want: 2\n---\nBody text";
    const result = extractFrontmatter("test.md", content);
    assert.equal(result.title, "Test Race");
    assert.equal(result.race.want, 2);
  });

  it("throws when frontmatter is missing", () => {
    assert.throws(
      () => extractFrontmatter("test.md", "No frontmatter here"),
      /No frontmatter found/,
    );
  });
});

describe("resolveSheetUrl", () => {
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/abc123/";

  it("returns sheet URL from frontmatter when present", async () => {
    const result = await resolveSheetUrl("any/path/index.md", {
      race: { sheet: SHEET_URL },
    });
    assert.equal(result, SHEET_URL);
  });

  it("reads sheet URL from parent _data.11tydata.json when not in frontmatter", async () => {
    const tmp = await mkdtemp();
    try {
      const raceDir = path.join(tmp, "2026", "2026-03-28-foolsdual");
      await mkdir(raceDir, { recursive: true });
      await writeFile(
        path.join(tmp, "2026", "_data.11tydata.json"),
        JSON.stringify({ race: { sheet: SHEET_URL } }),
      );
      const result = await resolveSheetUrl(path.join(raceDir, "index.md"), {});
      assert.equal(result, SHEET_URL);
    } finally {
      await rm(tmp, { recursive: true });
    }
  });

  it("returns null when neither frontmatter nor parent file has sheet", async () => {
    const tmp = await mkdtemp();
    try {
      const raceDir = path.join(tmp, "2026", "2026-03-28-foolsdual");
      await mkdir(raceDir, { recursive: true });
      await writeFile(
        path.join(tmp, "2026", "_data.11tydata.json"),
        JSON.stringify({ race: {} }),
      );
      const result = await resolveSheetUrl(path.join(raceDir, "index.md"), {});
      assert.equal(result, null);
    } finally {
      await rm(tmp, { recursive: true });
    }
  });

  it("returns null when parent file does not exist", async () => {
    const result = await resolveSheetUrl(
      "/nonexistent/deep/path/race/index.md",
      {},
    );
    assert.equal(result, null);
  });

  it("returns null when parent file has invalid JSON", async () => {
    const tmp = await mkdtemp();
    try {
      const raceDir = path.join(tmp, "2026", "2026-03-28-foolsdual");
      await mkdir(raceDir, { recursive: true });
      await writeFile(
        path.join(tmp, "2026", "_data.11tydata.json"),
        "not valid json",
      );
      const result = await resolveSheetUrl(path.join(raceDir, "index.md"), {});
      assert.equal(result, null);
    } finally {
      await rm(tmp, { recursive: true });
    }
  });
});

async function mkdtemp() {
  const tmp = path.join(tmpdir(), `fetch-sheets-test-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  return tmp;
}
