import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const markdownFiles = [
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  ...globSync('examples/*/README.md'),
];
const missing = [];

for (const file of markdownFiles) {
  const markdown = readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || /^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const target = decodeURIComponent(rawTarget.split('#')[0] ?? '');
    if (!target) continue;
    if (!existsSync(resolve(dirname(file), target))) missing.push(`${file} -> ${rawTarget}`);
  }
}

if (missing.length > 0) {
  console.error(`Broken local documentation links:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${markdownFiles.length} Markdown files: all local links resolve.`);
}
