import path from "node:path";

export default {
  layout: "race",
  eleventyComputed: {
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
