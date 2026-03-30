import yaml from "yaml";

export function extractFrontmatter(filePath, content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${filePath}: No frontmatter found`);
  return yaml.parse(match[1]);
}
