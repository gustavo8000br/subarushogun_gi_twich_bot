import { CHAT_COMMANDS, resolveAllowedRoles, resolveCommandAccess } from './catalog.mjs';

function isAllowed(entry, roles, policies, allowVipManagement) {
  return resolveCommandAccess({
    definition: entry,
    allowedRoles: resolveAllowedRoles(entry, policies),
    roles,
    allowVipManagement,
  }).allowed;
}

function bounded(text) {
  if (text.length <= 500) return text;
  const suffix = '… Catálogo completo no painel.';
  return `${text.slice(0, 500 - suffix.length - 1).trimEnd()} ${suffix}`;
}

/** @param {{roles:string[],policies?:Record<string,string[]>,allowVipManagement?:boolean}} input */
export function renderGlobalCommandHelp({ roles, policies = {}, allowVipManagement = false }) {
  if (roles.includes('streamer')) return 'Streamer, consulte o catálogo completo e configure os comandos na página “Comandos” do painel local.';
  const allowed = CHAT_COMMANDS.filter((entry) => isAllowed(entry, roles, policies, allowVipManagement));
  const global = allowed.filter(({ scope }) => scope === 'global').map(({ syntax }) => syntax);
  const queue = allowed.filter(({ scope }) => scope === 'queue').map(({ syntax }) => syntax);
  if (!global.length && !queue.length) return 'Não há comandos disponíveis para seu cargo. Consulte o streamer.';
  const sections = [];
  if (global.length) sections.push(`Gerais: ${global.join(', ')}`);
  if (queue.length) sections.push(`Em cada fila: ${queue.join(', ')}`);
  return bounded(`${sections.join(' · ')} · Catálogo completo no painel.`);
}

/** @param {{queueSlug:string,roles:string[],policies?:Record<string,string[]>,allowVipManagement?:boolean}} input */
export function renderQueueCommandHelp({ queueSlug, roles, policies = {}, allowVipManagement = false }) {
  if (roles.includes('streamer')) return 'Streamer, consulte e configure o catálogo completo na página “Comandos” do painel local.';
  const available = CHAT_COMMANDS
    .filter((entry) => entry.scope === 'queue' && isAllowed(entry, roles, policies, allowVipManagement))
    .map(({ syntax }) => syntax.replaceAll('<fila>', queueSlug));
  if (!available.length) return 'Não há comandos disponíveis para seu cargo nesta fila.';
  return bounded(`Comandos de ${queueSlug}: ${available.join(', ')}.`);
}

/** @param {{productVersion:string,twitchHealth?:{pingMs?:number|null}|null}} input */
export function renderPingResponse({ productVersion, twitchHealth }) {
  const latency = Number.isFinite(twitchHealth?.pingMs) && twitchHealth.pingMs >= 0
    ? `${Math.round(twitchHealth.pingMs)} ms`
    : 'latência indisponível';
  return bounded(`Pong 🏓 Bot ativo · ${productVersion} · Twitch: ${latency}`);
}
