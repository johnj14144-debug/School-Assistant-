// Builds fable-review-kit.md: the Fable review instructions followed by every text file in the
// repository, so the whole project can be handed to Fable as a single attachment.
// Usage: pnpm fable-kit [output-path]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const INSTRUCTIONS = 'docs/prompts/fable-review.md';
const EXCLUDE = [
  /^pnpm-lock\.yaml$/,
  /\.(png|ico|jpe?g|gif|webp|pdf|woff2?)$/i,
  /\/db\/migrations\/meta\//, // drizzle-kit snapshots (generated; the .sql files are kept)
  new RegExp(`^${INSTRUCTIONS.replaceAll('.', '\\.')}$`),
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const output = process.argv[2] ?? 'fable-review-kit.md';

const files = git('ls-files', '-z')
  .split('\0')
  .filter((path) => path && !EXCLUDE.some((pattern) => pattern.test(path)))
  .filter((path) => !readFileSync(path).includes(0)); // skip any other binary file

const commit = git('rev-parse', '--short', 'HEAD').trim();
const date = git('log', '-1', '--format=%cs').trim();

const blocks = files.map(
  (path) => `<file path="${path}">\n${readFileSync(path, 'utf8').trimEnd()}\n</file>\n`,
);

const kit = [
  readFileSync(INSTRUCTIONS, 'utf8').trimEnd(),
  '',
  '---',
  '',
  `# The project: ${files.length} files from commit ${commit} (${date})`,
  '',
  ...blocks,
].join('\n');

writeFileSync(output, kit);
const kilobytes = Math.round(Buffer.byteLength(kit) / 1024);
console.log(`Wrote ${output}: ${files.length} files, ${kilobytes} KB`);
