import fs from "node:fs";
import path from "node:path";
import { escape as url_escape } from "node:querystring";

import { HtmlBasePlugin } from "@11ty/eleventy";
import markdownItAnchor from "markdown-it-anchor";
import { v5 as uuidv5 } from "uuid";
import YAML from "yaml";

// This is used as the uuid v5 namespace by the uuid filter
const CAARA_RACES_NS = "7bdc4d20-17a0-466f-996a-4dea5666969b";

// Helper function for configuring passthrough copy by extension
function passthroughCopyExtension(eleventyConfig, ext) {
  [ext, ext.toUpperCase()].forEach((item, _) => {
    eleventyConfig.addPassthroughCopy(`content/**/*.${item}`);
  });
}

// Define files that should be copied into the rendered content directory.
function setupPassthroughCopy(eleventyConfig) {
  ["kmz", "kml", "png", "jpg", "pdf", "txt", "gpx", "css"].forEach(
    (item, _) => {
      passthroughCopyExtension(eleventyConfig, item);
    },
  );
}

// Expose current run mode as global runMode variable
function exposeRunMode(eleventyConfig) {
  let currentRunMode = "build";

  eleventyConfig.on("eleventy.before", ({ runMode }) => {
    currentRunMode = runMode;
  });

  // Make runMode available to templates
  eleventyConfig.addGlobalData("runMode", () => currentRunMode);
}

// Configure collections
function setupCollections(eleventyConfig) {
  // Group races by year, sorted chronologically within each year.
  eleventyConfig.addCollection("raceYears", (collection) => {
    const races = collection.getFilteredByTag("race");
    const yearMap = new Map();
    for (const race of races) {
      const year = new Date(race.data.date).getFullYear();
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year).push(race);
    }
    return [...yearMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, races]) => ({
        year,
        races: races.sort(
          (a, b) => new Date(a.data.date) - new Date(b.data.date),
        ),
      }));
  });

  // Group races by year+month, sorted chronologically within each month.
  eleventyConfig.addCollection("raceMonths", (collection) => {
    const races = collection.getFilteredByTag("race");
    const monthMap = new Map();
    for (const race of races) {
      const d = new Date(race.data.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      if (!monthMap.has(key)) monthMap.set(key, { year, month, races: [] });
      monthMap.get(key).races.push(race);
    }
    return [...monthMap.values()]
      .sort((a, b) => a.year - b.year || a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        races: m.races.sort(
          (a, b) => new Date(a.data.date) - new Date(b.data.date),
        ),
      }));
  });
}

// Configure filters
function setupFilters(eleventyConfig) {
  // Return the web-accessible base path for a race's static assets (cover
  // image, PDF, GPX). Assets are passthrough-copied from the source directory,
  // so their web path mirrors the source tree (e.g. /race/2026-03-28-foolsdual/)
  // regardless of the page's computed permalink.
  eleventyConfig.addFilter("raceAssetBase", (inputPath) => {
    const sourceDir = path.basename(path.dirname(inputPath));
    return `/race/${sourceDir}/`;
  });

  eleventyConfig.addFilter("lastModified", (filePath) => {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  });

  // Generate a UUIDv5.
  eleventyConfig.addFilter("uuid", (s) => {
    const u = uuidv5(s, CAARA_RACES_NS);
    return u;
  });

  // URL-escape the given string.
  eleventyConfig.addFilter("urlEscape", (url) => {
    return url_escape(url);
  });

  // Transform the given input into a URL for a google map search.
  eleventyConfig.addFilter("googleMapSearch", (s) => {
    return `https://www.google.com/maps/search/?api=1&query=${url_escape(s)}`;
  });

  // Return true if the given path is a directory. The path is relative to
  // the input directory.
  eleventyConfig.addFilter("dirExists", (relpath) => {
    // Resolve the path relative to the project root (or input dir, as needed)
    const absolutePath = path.join(eleventyConfig.dir.input, relpath);

    try {
      const stats = fs.statSync(absolutePath);
      return stats.isDirectory(); // Returns true if it is a directory
    } catch (_error) {
      return false; // If an error occurs (e.g., directory doesn't exist), return false
    }
  });

  eleventyConfig.addFilter("townName", (slug, town) => {
    return town?.display ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  });

  // Return true if the given path is a regular file. The path is relative to
  // the input directory.
  eleventyConfig.addFilter("fileExists", (relpath) => {
    // Resolve the path relative to the project root (or input dir, as needed)
    const absolutePath = path.join(eleventyConfig.dir.input, relpath);

    try {
      const stats = fs.statSync(absolutePath);
      return stats.isFile(); // Returns true if it is a directory
    } catch (_error) {
      return false; // If an error occurs (e.g., directory doesn't exist), return false
    }
  });
}

export default function (eleventyConfig) {
  eleventyConfig.amendLibrary("md", (mdLib) => mdLib.use(markdownItAnchor));

  exposeRunMode(eleventyConfig);
  setupPassthroughCopy(eleventyConfig);
  setupFilters(eleventyConfig);
  setupCollections(eleventyConfig);

  eleventyConfig.setDataFileBaseName("_data");

  // Setting a watch target on a file means that changes to that file will
  // trigger a site rebuild. This happens by default for files that
  // eleventy normally processes (.md, .liquid, etc), but needs explicit
  // configuration for other file types.
  eleventyConfig.addWatchTarget("content/css/normalize.css");

  // Permit setting base url from the environment.
  eleventyConfig.addPlugin(HtmlBasePlugin, {
    baseHref: process.env.ELEVENTY_BASEURL || "",
  });

  // This shortcode is used in the copyright notice to ensure it always shows
  // the current year.
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // Create callsign links to qrz
  eleventyConfig.addShortcode(
    "qrz",
    (callsign) => `[${callsign}](https://www.qrz.com/db/${callsign})`,
  );

  // Allow the use of YAML for data files
  eleventyConfig.addDataExtension("yaml", (contents) => YAML.parse(contents));

  return {
    dir: {
      input: "content",
    },
  };
}
