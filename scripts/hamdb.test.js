import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  buildTooltip,
  hamDbTooltip,
  lookupHamDb,
  readCache,
  writeCache,
} from "./hamdb.js";

// Cache tests use a temp directory swapped in via process.chdir
let originalCwd;
let tmpDir;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = path.join(tmpdir(), `hamdb-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true });
  mock.restoreAll();
});

describe("buildTooltip", () => {
  it("returns bare callsign when data is null", () => {
    assert.equal(buildTooltip("N1LKS", null), "N1LKS");
  });

  it("returns bare callsign when data is undefined", () => {
    assert.equal(buildTooltip("N1LKS", undefined), "N1LKS");
  });

  it("expands T to Technician", () => {
    const result = buildTooltip("W1AW", {
      class: "T",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.includes("Technician"));
  });

  it("expands G to General", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.includes("General"));
  });

  it("expands A to Amateur Extra", () => {
    const result = buildTooltip("W1AW", {
      class: "A",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.includes("Amateur Extra"));
  });

  it("displays unknown class verbatim", () => {
    const result = buildTooltip("W1AW", {
      class: "X",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.includes("X"));
    assert.ok(!result.includes("Technician"));
    assert.ok(!result.includes("General"));
  });

  it("returns abbr element with title on success", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.startsWith('<abbr title="'));
    assert.ok(result.endsWith(">W1AW</abbr>"));
  });

  it("encodes newlines as &#10; in title", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN",
      name: "DOE",
      addr2: "BOSTON",
      state: "MA",
    });
    assert.ok(result.includes("&#10;"));
  });

  it("HTML-escapes name with special chars", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN & JANE",
      name: "DOE",
      addr2: "CITY",
      state: "MA",
    });
    assert.ok(result.includes("&amp;"));
    assert.ok(!result.includes("JOHN & JANE"));
  });

  it("HTML-escapes city with special chars", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN",
      name: "DOE",
      addr2: 'CITY"NAME',
      state: "MA",
    });
    assert.ok(result.includes("&quot;"));
  });

  it("includes city and state in correct format", () => {
    const result = buildTooltip("W1AW", {
      class: "G",
      fname: "JOHN",
      name: "DOE",
      addr2: "GLOUCESTER",
      state: "MA",
    });
    assert.ok(result.includes("GLOUCESTER, MA"));
  });
});

describe("readCache / writeCache", () => {
  it("write then read returns same data", async () => {
    const data = { call: "N1LKS", class: "G", fname: "LARS", name: "KJOS" };
    await writeCache("N1LKS", data);
    const result = await readCache("N1LKS");
    assert.deepEqual(result, data);
  });

  it("normalizes callsign to uppercase for cache file", async () => {
    const data = { call: "N1LKS" };
    await writeCache("n1lks", data);
    const result = await readCache("N1LKS");
    assert.deepEqual(result, data);
  });

  it("returns null for a missing cache file", async () => {
    const result = await readCache("W9ZZZ");
    assert.equal(result, null);
  });

  it("returns null for an expired cache entry", async () => {
    const data = { call: "W1AW" };
    const cacheDir = ".hamdb-cache";
    await mkdir(cacheDir, { recursive: true });
    const expired = { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, data };
    await writeFile(
      path.join(cacheDir, "W1AW.json"),
      JSON.stringify(expired),
      "utf8",
    );
    const result = await readCache("W1AW");
    assert.equal(result, null);
  });

  it("returns null for invalid JSON in cache file", async () => {
    const cacheDir = ".hamdb-cache";
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, "W1AW.json"), "not json", "utf8");
    const result = await readCache("W1AW");
    assert.equal(result, null);
  });
});

describe("lookupHamDb", () => {
  const sampleData = {
    call: "N1LKS",
    class: "G",
    fname: "LARS",
    name: "KJOS",
    addr2: "BOSTON",
    state: "MA",
  };

  const okResponse = {
    hamdb: {
      callsign: sampleData,
      messages: { status: "OK" },
    },
  };

  it("returns cached data without fetching", async () => {
    await writeCache("N1LKS", sampleData);
    const fetchMock = mock.method(globalThis, "fetch", () => {
      throw new Error("fetch should not be called");
    });
    const result = await lookupHamDb("N1LKS");
    assert.deepEqual(result, sampleData);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("fetches from API on cache miss and writes cache", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(okResponse),
      }),
    );
    const result = await lookupHamDb("N1LKS");
    assert.deepEqual(result, sampleData);
    // Verify cache was written
    const cached = await readCache("N1LKS");
    assert.deepEqual(cached, sampleData);
  });

  it("returns null when API response is not ok", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.resolve({ ok: false, status: 404 }),
    );
    const result = await lookupHamDb("W9ZZZ");
    assert.equal(result, null);
  });

  it("returns null when status is not OK", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hamdb: {
              callsign: sampleData,
              messages: { status: "NOT_FOUND" },
            },
          }),
      }),
    );
    const result = await lookupHamDb("W9ZZZ");
    assert.equal(result, null);
  });

  it("returns null when fetch throws", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.reject(new Error("network error")),
    );
    // lookupHamDb itself doesn't catch; hamDbTooltip does
    await assert.rejects(() => lookupHamDb("W9ZZZ"), /network error/);
  });
});

describe("hamDbTooltip", () => {
  const sampleData = {
    call: "N1LKS",
    class: "G",
    fname: "LARS",
    name: "KJOS",
    addr2: "BOSTON",
    state: "MA",
  };

  it("returns abbr element when lookup succeeds", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hamdb: {
              callsign: sampleData,
              messages: { status: "OK" },
            },
          }),
      }),
    );
    const result = await hamDbTooltip("N1LKS");
    assert.ok(result.startsWith("<abbr"));
    assert.ok(result.includes("N1LKS"));
    assert.ok(result.includes("General"));
  });

  it("returns bare callsign when lookup fails", async () => {
    mock.method(globalThis, "fetch", () =>
      Promise.reject(new Error("network error")),
    );
    const result = await hamDbTooltip("W9ZZZ");
    assert.equal(result, "W9ZZZ");
  });

  it("returns callsign unchanged when callsign is falsy", async () => {
    assert.equal(await hamDbTooltip(""), "");
    assert.equal(await hamDbTooltip(null), null);
  });
});
