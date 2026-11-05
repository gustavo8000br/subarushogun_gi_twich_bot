import { constants } from 'node:fs';
import { access, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function ensureDevelopmentEnvFile(repositoryRoot) {
  const envPath = resolve(repositoryRoot, '.env.product.local');
  try {
    await access(envPath, constants.F_OK);
    return envPath;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const templatePath = resolve(repositoryRoot, '.env.product.example');
  try {
    await copyFile(templatePath, envPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return envPath;
}
