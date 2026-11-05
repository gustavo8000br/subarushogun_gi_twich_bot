export function resolveApiHost(env = process.env) {
  return env.APP_HOST ?? '127.0.0.1';
}
