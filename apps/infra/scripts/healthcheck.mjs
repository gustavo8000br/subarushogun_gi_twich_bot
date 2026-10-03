const baseUrl = `http://127.0.0.1:${process.env.APP_PORT ?? 3000}`;
try {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
