import { ensureDatabaseSecret } from '../src/bootstrap-secret.mjs';

const directory = process.env.SECRETS_DIRECTORY ?? '/var/lib/aiox/secrets';
try {
  await ensureDatabaseSecret({ directory });
} catch {
  process.stderr.write('Unable to initialize local operational secrets. Check the local secrets volume permissions.\n');
  process.exitCode = 1;
}
