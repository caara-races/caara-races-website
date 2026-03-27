import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFrontmatter, extractSpreadsheetId } from "./fetch-sheets.js";

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
