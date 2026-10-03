import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Create the persistent database password on first run and retain it thereafter. */
export async function ensureDatabaseSecret({ directory, accessGid = 999 }) {
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const secretPath = join(directory, 'db_password');
  let handle;
  let alreadyExists = false;
  try {
    handle = await open(secretPath, 'wx', 0o440);
    const password = randomBytes(48).toString('base64url');
    await handle.writeFile(password);
    await handle.sync();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    alreadyExists = true;
  } finally {
    await handle?.close();
  }
  if (alreadyExists && !(await readFile(secretPath, 'utf8')).trim()) {
    throw new Error('Existing database secret is empty or invalid.');
  }
  await chmod(secretPath, 0o440);
  if (process.getuid?.() === 0 && Number.isInteger(accessGid)) {
    const { chown } = await import('node:fs/promises');
    await chown(secretPath, 0, accessGid);
    await chown(directory, 0, accessGid);
  }
  return { secretPath };
}
