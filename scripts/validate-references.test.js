import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { validateReferences } from "./validate-references.js";

function makeRaceFile({ primary, backup, towns }) {
  return [
    "---",
    "tags: race",
    "title: Test Race",
    "date: 2026-01-01T09:00:00-05:00",
    "race:",
    "  start:",
    "    name: Test School",
    '    address: "1 Main St"',
    "  url: https://example.com",
    "  frequency:",
    `    primary: ${primary}`,
    `    backup: ${backup}`,
    "  towns:",
    ...towns.map((t) => `    - ${t}`),
    "---",
    "",
  ].join("\n");
}

const validRepeaters = new Set(["w1glo-vhf", "w1glo-uhf", "n1hsy"]);
const validTowns = new Set(["gloucester", "rockport", "essex"]);

describe("validateReferences", () => {
  let tmpDir;

  async function writeRace(name, content) {
    const filePath = join(tmpDir, `${name}.md`);
    await writeFile(filePath, content);
    return filePath;
  }

  it("passes for valid references", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const file = await writeRace(
        "valid",
        makeRaceFile({
          primary: "w1glo-vhf",
          backup: "w1glo-uhf",
          towns: ["gloucester", "rockport"],
        }),
      );
      const result = await validateReferences([file], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, true);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("fails for unknown primary repeater", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const file = await writeRace(
        "bad-primary",
        makeRaceFile({
          primary: "w1glo-vhff",
          backup: "w1glo-uhf",
          towns: ["gloucester"],
        }),
      );
      const result = await validateReferences([file], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, false);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("fails for unknown backup repeater", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const file = await writeRace(
        "bad-backup",
        makeRaceFile({
          primary: "w1glo-vhf",
          backup: "bogus",
          towns: ["gloucester"],
        }),
      );
      const result = await validateReferences([file], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, false);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("fails for unknown town", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const file = await writeRace(
        "bad-town",
        makeRaceFile({
          primary: "w1glo-vhf",
          backup: "w1glo-uhf",
          towns: ["gloucester", "atlantis"],
        }),
      );
      const result = await validateReferences([file], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, false);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("reports multiple errors in one file", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const file = await writeRace(
        "multi-error",
        makeRaceFile({
          primary: "bad1",
          backup: "bad2",
          towns: ["atlantis"],
        }),
      );
      const result = await validateReferences([file], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, false);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("validates multiple files independently", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "validate-ref-"));
    try {
      const good = await writeRace(
        "good",
        makeRaceFile({
          primary: "w1glo-vhf",
          backup: "w1glo-uhf",
          towns: ["gloucester"],
        }),
      );
      const bad = await writeRace(
        "bad",
        makeRaceFile({
          primary: "w1glo-vhf",
          backup: "w1glo-uhf",
          towns: ["atlantis"],
        }),
      );
      const result = await validateReferences([good, bad], {
        repeaters: validRepeaters,
        towns: validTowns,
      });
      assert.equal(result, false);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});
