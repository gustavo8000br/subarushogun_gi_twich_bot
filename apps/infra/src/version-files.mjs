import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { materializeVersion, validateVersionSources } from './version.mjs';

const VERSION_PATTERN = /^v(.+)-([0-9a-f]{7})-(alpha|beta|rc|stable)$/;

/** @param {string} root */
async function readProductSources(root) {
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const stage = /** @type {import('./version.mjs').ReleaseStage} */ (
    (await readFile(resolve(root, '.release-stage'), 'utf8')).trim()
  );
  const runtimeVersion = (await readFile(resolve(root, 'VERSION'), 'utf8')).trim();
  const match = VERSION_PATTERN.exec(runtimeVersion);

  if (!match) {
    throw new Error('VERSION must match vMAJOR.MINOR.PATCH-HHHHHHH-STAGE.');
  }

  return {
    baseVersion: packageJson.version,
    stage,
    sourceSha: match[2],
    runtimeVersion,
  };
}

/**
 * Validate package/stage/VERSION sources without writing any file.
 * @param {string} root
 * @returns {Promise<{valid: true, version: string}>}
 */
export async function validateVersionFiles(root) {
  return validateVersionSources(await readProductSources(root));
}

/**
 * Derive a source identity from the exact repository at root. A present but
 * broken/uncommitted repository is an error, never an invitation to use zeros.
 * @param {string} root
 * @returns {string | undefined}
 */
function discoverSourceCommit(root) {
  try {
    const topLevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (resolve(topLevel) !== resolve(root)) {
      throw new Error('Git repository root does not match the requested product root.');
    }
    return execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD^{commit}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('Git metadata exists but the exact source commit could not be discovered.');
  }
}

/** @param {string} root @param {string} outputPath */
function assertOutputIsExternal(root, outputPath) {
  const rootPath = resolve(root);
  const output = resolve(outputPath);
  const relativePath = relative(rootPath, output);
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    throw new Error('Materialized VERSION output must be outside the source checkout.');
  }
}

/**
 * Materialize only an external artifact file; source version files remain intact.
 * @param {string} root
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
export async function materializeVersionFile(root, outputPath) {
  if (!outputPath) {
    throw new Error('An external artifact output path is required.');
  }
  assertOutputIsExternal(root, outputPath);
  const sources = await readProductSources(root);
  const gitDirectory = resolve(root, '.git');
  let gitAvailable = true;
  try {
    await lstat(gitDirectory);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    gitAvailable = false;
  }

  const version = materializeVersion({
    baseVersion: sources.baseVersion,
    stage: sources.stage,
    gitAvailable,
    ...(gitAvailable ? { sourceCommitSha: discoverSourceCommit(resolve(root)) } : {}),
  });

  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  const parentRealPath = await realpath(dirname(destination));
  const sourceRealPath = await realpath(root);
  const relativeFromSource = relative(sourceRealPath, resolve(parentRealPath, basename(destination)));
  if (relativeFromSource === '' || (!relativeFromSource.startsWith('..') && !isAbsolute(relativeFromSource))) {
    throw new Error('Materialized VERSION output resolves inside the source checkout.');
  }
  try {
    const existing = await lstat(destination);
    if (existing.isSymbolicLink()) throw new Error('Materialized VERSION output cannot be a symbolic link.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await writeFile(destination, `${version}\n`, { encoding: 'utf8', flag: 'w' });
  return version;
}
