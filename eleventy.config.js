import pluginTOC from "eleventy-plugin-toc";
import { HtmlBasePlugin } from "@11ty/eleventy";
import YAML from "yaml";

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

function exposeRunMode(eleventyConfig) {
	let currentRunMode = "build";

	eleventyConfig.on("eleventy.before", ({ runMode }) => {
		currentRunMode = runMode;
	});

	// Make runMode available to templates
	eleventyConfig.addGlobalData("runMode", () => currentRunMode);
}

export default function (eleventyConfig) {
	exposeRunMode(eleventyConfig);
	setupPassthroughCopy(eleventyConfig);

	eleventyConfig.addWatchTarget("content/css/normalize.css");

	eleventyConfig.addPlugin(pluginTOC, {
		ul: true,
	});
	eleventyConfig.addPlugin(HtmlBasePlugin, {
		baseHref: process.env.ELEVENTY_BASEURL || "",
	});

	// This shortcode is used in the copyright notice to ensure it always shows
	// the current year.
	eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);
	eleventyConfig.addShortcode(
		"qrz",
		(callsign) => `[${callsign}](https://www.qrz.com/db/${callsign})`,
	);

	eleventyConfig.addDataExtension("yaml", (contents) => YAML.parse(contents));

	return {
		dir: {
			input: "content",
		},
	};
}
