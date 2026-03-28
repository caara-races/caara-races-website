import path from "node:path";

export default {
  layout: "race",
  eleventyComputed: {
    // Calculate the number of unfilled checkpoint volunteer slots by comparing
    // the checkpoints defined in frontmatter with assigned CP* roles in the data file.
    race: (data) => {
      const want = (data.volunteers || []).filter(
        (v) => !v.Callsign?.trim(),
      ).length;
      return { ...data.race, want };
    },
    // Generate /race/YYYY/MM/DD/{slug}/ for individual race pages. For other
    // templates in this directory, preserve the permalink from their frontmatter.
    permalink: (data) => {
      const dirName = path.basename(path.dirname(data.page.inputPath));
      const match = dirName.match(/^(\d{4})-(\d{2})-(\d{2})-/);
      if (match) {
        return `/race/${match[1]}/${match[2]}/${match[3]}/${data.page.fileSlug}/`;
      }
      return data.permalink;
    },
  },
};
