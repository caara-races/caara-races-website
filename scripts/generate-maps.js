import { execFileSync, execSync } from "node:child_process";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { extractFrontmatter } from "./lib/frontmatter.js";

const DOCKER_IMAGE = "qgis/qgis:3.44";
const RENDER_SCRIPT = "scripts/render-map.py";

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

function dockerAvailable() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filter = args.find((a) => !a.startsWith("--"));

  const raceFiles = (await glob("content/race/**/index.md")).sort();

  const commands = [];
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
    const checkpointsGpxPath = path.join(raceDir, `${slug}-checkpoints.gpx`);
    const hasCourse = await fileExists(courseGpxPath);
    const hasCheckpoints = await fileExists(checkpointsGpxPath);

    if (!hasCourse && !hasCheckpoints) {
      console.log(`${filePath}: no GPX files found, skipping`);
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
      "python3",
      RENDER_SCRIPT,
      "--title",
      frontmatter.title,
      "--date",
      formatDate(frontmatter.date),
      "--output",
      outPath,
    ];

    if (hasCourse) {
      pyArgs.push("--lines", courseGpxPath);
    }
    if (hasCheckpoints) {
      pyArgs.push("--points", checkpointsGpxPath);
    }

    commands.push({ outPath, line: pyArgs.map(shellQuote).join(" ") });
  }

  if (commands.length === 0) {
    console.log(`\nDone: 0 map(s) generated, ${skipped} skipped.`);
    return;
  }

  if (!dockerAvailable()) {
    console.warn(
      `WARN: Docker is not available; skipping generation of ${commands.length} map(s).`,
    );
    return;
  }

  const scriptContent = [
    "#!/bin/sh",
    "set -e",
    ...commands.map((c) => c.line),
  ].join("\n");

  const scriptPath = path.join("scripts", ".render-maps.sh");
  await writeFile(scriptPath, scriptContent, { mode: 0o755 });

  try {
    const workDir = process.cwd();
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${workDir}:/work`,
        "-w",
        "/work",
        "-e",
        "MAPTILER_API_KEY",
        DOCKER_IMAGE,
        "bash",
        scriptPath,
      ],
      {
        stdio: ["ignore", "inherit", "inherit"],
        timeout: commands.length * 60000,
      },
    );

    for (const cmd of commands) {
      console.log(`  Wrote ${cmd.outPath}`);
    }
    console.log(
      `\nDone: ${commands.length} map(s) generated, ${skipped} skipped.`,
    );
  } catch {
    throw new Error("Docker map generation failed");
  } finally {
    await unlink(scriptPath).catch(() => {});
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
