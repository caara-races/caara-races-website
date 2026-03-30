import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { readCache, writeCache } from "./cache.js";
import { escapeHtml } from "./escape.js";
import { extractFrontmatter } from "./frontmatter.js";

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    assert.equal(escapeHtml("a & b"), "a &amp; b");
  });

  it("escapes double quotes", () => {
    assert.equal(escapeHtml('"hello"'), "&quot;hello&quot;");
  });

  it("escapes less-than and greater-than", () => {
    assert.equal(escapeHtml("<b>bold</b>"), "&lt;b&gt;bold&lt;/b&gt;");
  });

  it("coerces non-string values to string", () => {
    assert.equal(escapeHtml(42), "42");
  });

  it("returns empty string unchanged", () => {
    assert.equal(escapeHtml(""), "");
  });
});

// ── extractFrontmatter ──────────────────────────────────────────────────────

describe("extractFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = "---\ntitle: Test Race\n---\nBody text";
    const result = extractFrontmatter("test.md", content);
    assert.deepEqual(result, { title: "Test Race" });
  });

  it("throws when frontmatter is missing", () => {
    assert.throws(
      () => extractFrontmatter("test.md", "No frontmatter here"),
      /test\.md: No frontmatter found/,
    );
  });
});

// ── readCache / writeCache ──────────────────────────────────────────────────

describe("readCache / writeCache", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lib-cache-test-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("write then read returns same data", async () => {
    await writeCache(tmpDir, "testkey", { foo: "bar" });
    const result = await readCache(tmpDir, "testkey", 60_000);
    assert.deepEqual(result, { foo: "bar" });
  });

  it("returns null for a missing key", async () => {
    const result = await readCache(tmpDir, "missing", 60_000);
    assert.equal(result, null);
  });

  it("returns null for an expired entry", async () => {
    await writeCache(tmpDir, "expiredkey", { x: 1 });
    const result = await readCache(tmpDir, "expiredkey", 0);
    assert.equal(result, null);
  });

  it("returns null for invalid JSON in cache file", async () => {
    const filePath = path.join(tmpDir, "badkey.json");
    await fs.writeFile(filePath, "not json", "utf8");
    const result = await readCache(tmpDir, "badkey", 60_000);
    assert.equal(result, null);
  });

  it("creates the cache directory if it does not exist", async () => {
    const subDir = path.join(tmpDir, "subdir");
    await writeCache(subDir, "dirtest", { ok: true });
    const result = await readCache(subDir, "dirtest", 60_000);
    assert.deepEqual(result, { ok: true });
  });
});
