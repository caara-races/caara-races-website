import fs from "node:fs";
import path from "node:path";
import { escape as url_escape } from "node:querystring";
import { v5 as uuidv5 } from "uuid";

import { HtmlBasePlugin } from "@11ty/eleventy";
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
	passthroughCopyExtension(eleventyConfig, "kmz");
	passthroughCopyExtension(eleventyConfig, "kml");
	passthroughCopyExtension(eleventyConfig, "png");
	passthroughCopyExtension(eleventyConfig, "jpg");
	passthroughCopyExtension(eleventyConfig, "pdf");
	passthroughCopyExtension(eleventyConfig, "txt");
	passthroughCopyExtension(eleventyConfig, "gpx");
	passthroughCopyExtension(eleventyConfig, "css");
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

// Configure filters
function setupFilters(eleventyConfig) {
	eleventyConfig.addFilter("lastModified", (filePath) => {
		const stats = fs.statSync(filePath);
		return stats.mtime;
	});
	eleventyConfig.addFilter("uuid", (s) => {
		const u = uuidv5(s, CAARA_RACES_NS);
		return u;
	});
	eleventyConfig.addFilter("urlEscape", (url) => {
		return url_escape(url);
	});
	eleventyConfig.addFilter("googleMapSearch", (s) => {
		return `https://www.google.com/maps/search/?api=1&query=${url_escape(s)}`;
	});
	eleventyConfig.addFilter("dirExists", (dirPath) => {
		// Resolve the path relative to the project root (or input dir, as needed)
		const absolutePath = path.join(eleventyConfig.dir.input, dirPath);

		try {
			const stats = fs.statSync(absolutePath);
			return stats.isDirectory(); // Returns true if it is a directory
		} catch (e) {
			return false; // If an error occurs (e.g., directory doesn't exist), return false
		}
	});
}

export default function (eleventyConfig) {
	exposeRunMode(eleventyConfig);
	setupPassthroughCopy(eleventyConfig);
	setupFilters(eleventyConfig);

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
