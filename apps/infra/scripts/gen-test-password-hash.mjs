// Owner helper: turns a test password into the PBKDF2 hash line stored as the GitHub Secret TEST_INSTALLER_PASSWORD_HASH.
// The password is typed with echo off (or piped on stdin), never taken from argv or the environment, never written to disk.
// Only the hash line goes to stdout; prompts go to stderr. Format: pbkdf2-sha256$600000$<salt-base64>$<hash-base64>.
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ITERATIONS = 600000;
export const MIN_PASSWORD_LENGTH = 16;

const derive = (password, salt, iterations) => pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256');

export function hashPassword(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || [...password].length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters (a long random one or a 5-word passphrase).`);
  }
  if (!/^[\x20-\x7e]+$/.test(password)) {
    throw new Error('Use only ASCII characters (letters, digits and common symbols): the Windows console may encode other characters differently.');
  }
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${derive(password, salt, ITERATIONS).toString('base64')}`;
}

export function verifyPassword(password, line) {
  const parts = String(line).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const reference = Buffer.from(parts[3], 'base64');
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000 || salt.length !== 16 || reference.length !== 32) return false;
  return timingSafeEqual(derive(password, salt, iterations), reference);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => { data += chunk; });
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0]));
      stdin.on('error', reject);
      return;
    }
    stderr.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (result, error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stderr.write('\n');
      if (error) reject(error); else resolve(result);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') return finish(null, new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish(value);
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const password = await readHidden('Test password (hidden): ');
  if (process.stdin.isTTY) {
    const again = await readHidden('Repeat the password (hidden): ');
    if (again !== password) throw new Error('The two entries differ.');
  }
  process.stdout.write(`${hashPassword(password ?? '')}\n`);
  process.stderr.write('Hash printed above. Store it as the Secret TEST_INSTALLER_PASSWORD_HASH; keep the password out of chats, files and shell history.\n');
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
