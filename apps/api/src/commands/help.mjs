import { CHAT_COMMANDS, resolveAllowedRoles, resolveCommandAccess } from './catalog.mjs';

function isAllowed(entry, roles, policies, allowVipManagement) {
  return resolveCommandAccess({
    definition: entry,
    allowedRoles: resolveAllowedRoles(entry, policies),
    roles,
    allowVipManagement,
  }).allowed;
}

function bounded(text, suffix = '… Catálogo completo no painel.') {
  if (text.length <= 500) return text;
  return `${text.slice(0, 500 - suffix.length - 1).trimEnd()} ${suffix}`;
}

const globalRootLabels = Object.freeze({
  'pt-BR': { root: 'fila', commands: 'comandos', queues: 'filas', account: 'conta', reset: 'reset', name: '<nome>' },
  en: { root: 'queue', commands: 'commands', queues: 'queues', account: 'account', reset: 'reset', name: '<name>' },
  es: { root: 'cola', commands: 'comandos', queues: 'colas', account: 'cuenta', reset: 'restablecer', name: '<nombre>' },
});

function localizedGlobalSyntax(entry, locale, translate) {
  const labels = globalRootLabels[locale] ?? globalRootLabels['pt-BR'];
  const t = (key, fallback) => typeof translate === 'function' ? translate(key) : fallback;
  const root = t('chat.command.root', labels.root);
  if (entry.key === 'global:queue:comandos') return `!${root} ${t('chat.command.global.commands', labels.commands)}`;
  if (entry.key === 'global:queue:ping') return `!${root} ${t('chat.command.global.ping', 'ping')}`;
  if (entry.key === 'global:filas') return `!${root} ${t('chat.command.global.queues', labels.queues)}`;
  if (entry.key === 'global:conta:read') return `!${root} ${t('chat.command.global.account', labels.account)}`;
  if (entry.key === 'global:conta:set') return `!${root} ${t('chat.command.global.account', labels.account)} ${t('chat.syntax.name', labels.name)}`;
  if (entry.key === 'global:conta:reset') return `!${root} ${t('chat.command.global.account', labels.account)} ${t('chat.command.global.account_reset', labels.reset)}`;
  return entry.syntax;
}

function localizedQueueSyntax(entry, queueSlug, translate, locale = 'pt-BR') {
  const t = (key, fallback) => typeof translate === 'function' ? translate(key) : fallback;
  const queueLabel = t('chat.syntax.queue', locale === 'en' ? '<queue>' : locale === 'es' ? '<cola>' : '<fila>');
  const command = entry.key.slice('queue:'.length);
  const verb = t(`chat.command.queue.${command}`, entry.command);
  const user = t('chat.syntax.user', 'usuario');
  const position = t('chat.syntax.position', 'posição');
  const confirm = t('chat.command.queue.confirmar', 'confirmar');
  const suffix = {
    add: ` <${user}> [UID]`, remover: ` <${user}>`, proximo: ' [1-10]', atender: ` [${user}]`,
    concluir: ` [${user}]`, mover: ` <${user}> <${position}>`, limpar: ` [${confirm}]`,
  }[command] ?? '';
  return `!${queueSlug === '<queue>' || queueSlug === '<fila>' || queueSlug === '<cola>' ? queueLabel : queueSlug} ${verb}${suffix}`;
}

/** @param {{roles:string[],locale?:string,policies?:Record<string,string[]>,allowVipManagement?:boolean,translate?:(key:string)=>string}} input */
export function renderGlobalCommandHelp({ roles, locale = 'pt-BR', policies = {}, allowVipManagement = false, translate }) {
  const t = (key, fallback) => typeof translate === 'function' ? translate(key) : fallback;
  if (roles.includes('streamer')) return t('chat.help.streamer', 'Streamer, consulte o catálogo completo e configure os comandos na página “Comandos” do painel local.');
  const allowed = CHAT_COMMANDS.filter((entry) => isAllowed(entry, roles, policies, allowVipManagement));
  const global = allowed.filter(({ scope }) => scope === 'global').map((entry) => localizedGlobalSyntax(entry, locale, translate));
  const queue = allowed.filter(({ scope }) => scope === 'queue').map((entry) => localizedQueueSyntax(entry, '<queue>', translate, locale));
  if (!global.length && !queue.length) return t('chat.help.none', 'Não há comandos disponíveis para seu cargo. Consulte o streamer.');
  const sections = [];
  if (global.length) sections.push(`${t('chat.help.global_heading', 'Gerais')}: ${global.join(', ')}`);
  if (queue.length) sections.push(`${t('chat.help.queue_heading', 'Em cada fila')}: ${queue.join(', ')}`);
  return bounded(`${sections.join(' · ')} · ${t('chat.help.panel_suffix', 'Catálogo completo no painel.')}`, t('chat.help.panel_suffix', 'Catálogo completo no painel.'));
}

/** @param {{queueSlug:string,roles:string[],policies?:Record<string,string[]>,allowVipManagement?:boolean,locale?:string,translate?:(key:string)=>string}} input */
export function renderQueueCommandHelp({ queueSlug, roles, policies = {}, allowVipManagement = false, locale = 'pt-BR', translate }) {
  const t = (key, fallback) => typeof translate === 'function' ? translate(key) : fallback;
  if (roles.includes('streamer')) return t('chat.help.streamer', 'Streamer, consulte e configure o catálogo completo na página “Comandos” do painel local.');
  const available = CHAT_COMMANDS
    .filter((entry) => entry.scope === 'queue' && isAllowed(entry, roles, policies, allowVipManagement))
    .map((entry) => localizedQueueSyntax(entry, queueSlug, translate, locale));
  if (!available.length) return t('chat.help.queue_none', 'Não há comandos disponíveis para seu cargo nesta fila.');
  return bounded(`${t('chat.help.queue_for', 'Comandos de')} ${queueSlug}: ${available.join(', ')}.`);
}

/** @param {{productVersion:string,twitchHealth?:{pingMs?:number|null}|null,translate?:(key:string,values?:Record<string,string>)=>string}} input */
export function renderPingResponse({ productVersion, twitchHealth, translate }) {
  const latency = Number.isFinite(twitchHealth?.pingMs) && twitchHealth.pingMs >= 0
    ? `${Math.round(twitchHealth.pingMs)} ms`
    : typeof translate === 'function' ? translate('chat.ping.unavailable') : 'latência indisponível';
  if (typeof translate !== 'function') return bounded(`Pong 🏓 Bot ativo · ${productVersion} · Twitch: ${latency}`);
  return bounded(translate('chat.ping.response', { version: productVersion, latency }));
}
