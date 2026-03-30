import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { extractFrontmatter } from "./lib/frontmatter.js";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const RENDER_SCRIPT = new URL("render-map.py", import.meta.url).pathname;

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filter = args.find((a) => !a.startsWith("--"));

  const raceFiles = (await glob("content/race/**/index.md")).sort();

  let generated = 0;
  let skipped = 0;

  for (const filePath of raceFiles) {
    const raceDir = path.dirname(filePath);
    const slug = path.basename(raceDir);
    const year = path.basename(path.dirname(raceDir));

    if (filter && `${year}/${slug}` !== filter) continue;

    const content = await readFile(filePath, "utf8");
    let frontmatter;
    try {
      frontmatter = extractFrontmatter(filePath, content);
    } catch (err) {
      console.warn(`WARN: ${err.message}, skipping`);
      continue;
    }

    const courseGpxPath = path.join(raceDir, `${slug}.gpx`);
    if (!(await fileExists(courseGpxPath))) {
      console.log(`${filePath}: no course GPX (${slug}.gpx), skipping`);
      skipped++;
      continue;
    }

    const outPath = path.join(raceDir, `${slug}.pdf`);

    if (!force && (await fileExists(outPath))) {
      console.log(
        `${outPath}: already exists, skipping (use --force to overwrite)`,
      );
      skipped++;
      continue;
    }

    console.log(`${filePath}: generating map...`);

    const pyArgs = [
      RENDER_SCRIPT,
      "--lines",
      path.resolve(courseGpxPath),
      "--title",
      frontmatter.title,
      "--date",
      formatDate(frontmatter.date),
      "--output",
      path.resolve(outPath),
    ];

    const checkpointsGpxPath = path.join(raceDir, `${slug}-checkpoints.gpx`);
    if (await fileExists(checkpointsGpxPath)) {
      pyArgs.push("--points", path.resolve(checkpointsGpxPath));
    }

    try {
      execFileSync("python3", pyArgs, {
        stdio: ["ignore", "inherit", "inherit"],
        timeout: 60000,
      });
      console.log(`  Wrote ${outPath}`);
      generated++;
    } catch {
      console.error(`  ERROR: failed to generate ${outPath}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${generated} map(s) generated, ${skipped} skipped.`);
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
