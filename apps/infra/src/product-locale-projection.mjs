import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

function parseSnapshot(contents) {
  if (typeof contents !== 'string') return null;
  const match = /^locale=([^\r\n]+)\nrevision=([1-9][0-9]*)\n$/.exec(contents);
  if (!match) return null;
  try {
    if (Intl.getCanonicalLocales(match[1])[0] !== match[1]) return null;
  } catch { return null; }
  const revision = Number(match[2]);
  return Number.isSafeInteger(revision) ? { locale: match[1], revision } : null;
}

async function writeAtomic(path, state) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o770 });
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`locale=${state.locale}\nrevision=${state.revision}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporaryPath, 0o644);
    await rename(temporaryPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/** Persist the DB locale as an atomic, secret-free host-readable projection. */
export async function writeProductLocaleProjection(path, state) {
  let canonicalLocale;
  try { canonicalLocale = Intl.getCanonicalLocales(state?.locale)[0]; } catch { canonicalLocale = null; }
  if (typeof path !== 'string' || !path || canonicalLocale !== state?.locale
      || !Number.isSafeInteger(state?.revision) || state.revision < 1) {
    throw Object.assign(new Error('Product locale projection is invalid'), { code: 'INVALID_PRODUCT_LOCALE_PROJECTION' });
  }

  const existing = await readFile(path, 'utf8').then(parseSnapshot).catch(() => null);
  const next = { locale: canonicalLocale, revision: state.revision };
  await writeAtomic(`${path}.last-valid`, existing ?? next);
  await writeAtomic(path, next);
  return { locale: canonicalLocale, revision: state.revision };
}

/** Read the current snapshot, then the last valid snapshot when the current file is damaged. */
export async function readProductLocaleProjection(path) {
  for (const candidate of [path, `${path}.last-valid`]) {
    const state = await readFile(candidate, 'utf8').then(parseSnapshot).catch(() => null);
    if (state) return state;
  }
  return null;
}
