import { randomBytes } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

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

/** Create a persistent local CA and localhost server certificate for the HTTPS panel. */
export async function ensureLocalTlsCertificate({ directory, exportDirectory, accessGid = 999, localeProjectionGid = 10001 }) {
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await mkdir(exportDirectory, { recursive: true, mode: 0o755 });
  const exportDirectoryStat = await stat(exportDirectory);
  if (process.getuid?.() === 0 && Number.isInteger(localeProjectionGid)) {
    const { chown } = await import('node:fs/promises');
    try { await chown(exportDirectory, exportDirectoryStat.uid, localeProjectionGid); } catch { /* Some host bind-mount providers do not support group changes. */ }
  }
  await chmod(exportDirectory, 0o2770);
  const paths = {
    caKeyPath: join(directory, 'localhost-ca.key'),
    caCertificatePath: join(directory, 'localhost-ca.crt'),
    privateKeyPath: join(directory, 'localhost.key'),
    certificatePath: join(directory, 'localhost.crt'),
  };
  const present = await Promise.all(Object.values(paths).map(async (path) => {
    try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }));
  if (present.some(Boolean) && !present.every(Boolean)) throw new Error('Existing localhost TLS material is incomplete.');

  if (!present.every(Boolean)) {
    const temporaryDirectory = await mkdtemp(join(directory, '.localhost-tls-'));
    const temporary = Object.fromEntries(Object.keys(paths).map((key) => [key, join(temporaryDirectory, basename(paths[key]))]));
    try {
      await writeFile(join(temporaryDirectory, 'ca.cnf'), [
        '[req]', 'distinguished_name=dn', 'x509_extensions=v3_ca', 'prompt=no', '[dn]',
        'CN=QueueBot Local Root CA', '[v3_ca]', 'basicConstraints=critical,CA:TRUE',
        'keyUsage=critical,keyCertSign,cRLSign', 'subjectKeyIdentifier=hash', '',
      ].join('\n'), { mode: 0o600 });
      await writeFile(join(temporaryDirectory, 'localhost.ext'), [
        '[server_cert]', 'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment', 'extendedKeyUsage=serverAuth',
        'subjectAltName=DNS:localhost,IP:127.0.0.1', 'subjectKeyIdentifier=hash',
        'authorityKeyIdentifier=keyid,issuer', '',
      ].join('\n'), { mode: 0o600 });
      await executeFile('openssl', ['genrsa', '-out', temporary.caKeyPath, '3072']);
      await executeFile('openssl', ['req', '-x509', '-new', '-key', temporary.caKeyPath, '-days', '3650', '-sha256', '-out', temporary.caCertificatePath, '-config', join(temporaryDirectory, 'ca.cnf')]);
      await executeFile('openssl', ['genrsa', '-out', temporary.privateKeyPath, '2048']);
      const requestPath = join(temporaryDirectory, 'localhost.csr');
      await executeFile('openssl', ['req', '-new', '-key', temporary.privateKeyPath, '-subj', '/CN=localhost', '-out', requestPath]);
      await executeFile('openssl', ['x509', '-req', '-in', requestPath, '-CA', temporary.caCertificatePath, '-CAkey', temporary.caKeyPath, '-CAcreateserial', '-out', temporary.certificatePath, '-days', '825', '-sha256', '-extfile', join(temporaryDirectory, 'localhost.ext'), '-extensions', 'server_cert']);
      await executeFile('openssl', ['verify', '-CAfile', temporary.caCertificatePath, temporary.certificatePath]);
      for (const key of Object.keys(paths)) await rename(temporary[key], paths[key]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  await executeFile('openssl', ['verify', '-CAfile', paths.caCertificatePath, paths.certificatePath]);
  await executeFile('openssl', ['x509', '-checkend', '0', '-noout', '-in', paths.certificatePath]);
  await chmod(paths.caKeyPath, 0o400);
  await chmod(paths.caCertificatePath, 0o444);
  await chmod(paths.privateKeyPath, 0o440);
  await chmod(paths.certificatePath, 0o444);
  if (process.getuid?.() === 0 && Number.isInteger(accessGid)) {
    const { chown } = await import('node:fs/promises');
    await chown(paths.privateKeyPath, 0, accessGid);
    await chown(directory, 0, accessGid);
  }
  const exportedCertificatePath = join(exportDirectory, 'localhost-ca.crt');
  await copyFile(paths.caCertificatePath, exportedCertificatePath);
  await chmod(exportedCertificatePath, 0o644);
  return { ...paths, exportedCertificatePath };
}
