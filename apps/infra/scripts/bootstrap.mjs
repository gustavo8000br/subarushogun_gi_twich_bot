import { ensureDatabaseSecret, ensureLocalTlsCertificate } from '../src/bootstrap-secret.mjs';

const directory = process.env.SECRETS_DIRECTORY ?? '/var/lib/aiox/secrets';
const exportDirectory = process.env.SECRETS_EXPORT_DIRECTORY ?? '/var/lib/aiox/export';
try {
  await ensureDatabaseSecret({ directory });
  await ensureLocalTlsCertificate({ directory, exportDirectory });
} catch {
  process.stderr.write('Unable to initialize local secrets or the HTTPS certificate. Check local volume permissions and bootstrap logs.\n');
  process.exitCode = 1;
}
