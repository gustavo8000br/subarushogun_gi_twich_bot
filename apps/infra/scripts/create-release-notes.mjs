import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const IDENTITY_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-([0-9a-f]{7})-(alpha|beta|rc|stable)$/;

export function getChangelogHeading(version) {
  const match = IDENTITY_PATTERN.exec(version);
  if (!match) {
    throw new Error('Invalid release identity; expected vMAJOR.MINOR.PATCH-seven hexadecimal characters-STAGE.');
  }

  return `v${match[1]}.${match[2]}.${match[3]}-${match[5]}`;
}

export function getChangelogPaths(version) {
  const match = IDENTITY_PATTERN.exec(version);
  if (!match) getChangelogHeading(version);
  const stage = match[5];
  return {
    english: `CHANGELOG-${stage}.md`,
    portuguese: `docs/pt-BR/CHANGELOG-${stage}.md`,
  };
}

function findSection(changelog, heading, language) {
  const lines = changelog.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line === `## ${heading}`);
  if (titleIndex < 0) {
    throw new Error(`No matching section for ${heading} in the ${language} changelog.`);
  }

  const endIndex = lines.findIndex((line, index) => index > titleIndex && line.startsWith('## '));
  const content = lines.slice(titleIndex + 1, endIndex < 0 ? undefined : endIndex).join('\n').trim();
  if (!content) throw new Error(`The ${language} changelog section ${heading} is empty.`);
  return content;
}

export function createReleaseNotes({ version, english, portuguese }) {
  const changelogHeading = getChangelogHeading(version);
  const englishSection = findSection(english, changelogHeading, 'English');
  const portugueseSection = findSection(portuguese, changelogHeading, 'Português brasileiro');

  return [
    `# ${version}`,
    '',
    '## English',
    '',
    englishSection,
    '',
    '## Português brasileiro',
    '',
    portugueseSection,
    '',
  ].join('\n');
}

async function main() {
  const versionIndex = process.argv.indexOf('--version');
  const version = versionIndex >= 0 ? process.argv[versionIndex + 1] : process.env.GITHUB_REF_NAME;
  if (!version) throw new Error('Pass --version or set GITHUB_REF_NAME to the materialized release identity.');

  const paths = getChangelogPaths(version);
  const [english, portuguese] = await Promise.all([
    readFile(paths.english, 'utf8'),
    readFile(paths.portuguese, 'utf8'),
  ]);
  process.stdout.write(createReleaseNotes({ version, english, portuguese }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
