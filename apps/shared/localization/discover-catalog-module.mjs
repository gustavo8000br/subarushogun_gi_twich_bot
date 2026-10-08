import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseCatalogBytes } from './parse-catalog-bytes.mjs';
import { validateCatalogSet } from './validate-catalog-set.mjs';

const DEFAULT_REQUIRED_LOCALES = Object.freeze(['pt-BR', 'en', 'es']);
const MODULE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_PLACEHOLDERS = Object.freeze({
  chat: Object.freeze({
    'chat.account.current': Object.freeze(['label']),
    'chat.ping.response': Object.freeze(['version', 'latency']),
    'chat.queue.position': Object.freeze(['user', 'position']),
    'chat.queue.viewer_called': Object.freeze(['user']),
    'chat.queue.viewer_in_progress': Object.freeze(['user']),
    'chat.queue.more': Object.freeze(['count']),
    'chat.queue.called_many': Object.freeze(['count']),
    'chat.queue.added': Object.freeze(['user']),
    'chat.queue.clear_confirm': Object.freeze(['queue', 'clear_command', 'confirm_command', 'count', 'refunds']),
    'chat.queue.clear_done': Object.freeze(['count', 'refunds']),
  }),
  setup: Object.freeze({
    'setup.callback.success_message': Object.freeze(['channel']),
    'setup.callback.return_message': Object.freeze(['seconds']),
  }),
  lifecycle: Object.freeze({
    'lifecycle.uninstall.confirm_prompt': Object.freeze(['word']),
  }),
  panel: Object.freeze({
    'panel.command.audience.everyone_includes': Object.freeze(['roles']),
    'panel.command.audience.proposed': Object.freeze(['roles']),
    'panel.queue_settings.call_placeholders': Object.freeze(['user', 'queue', 'position', 'uid', 'account']),
    'panel.queue_settings.call_message_default': Object.freeze(['user']),
    'panel.operation.attempts': Object.freeze(['count']),
    'panel.reconciliation.complete': Object.freeze(['count']),
    'panel.reconciliation.issues': Object.freeze(['count']),
    'panel.queue.confirm.delete': Object.freeze(['title', 'count']),
    'panel.queue.clear.confirm': Object.freeze(['title', 'count', 'refunds']),
    'panel.queue.clear.changed': Object.freeze(['count']),
    'panel.queue.clear.done': Object.freeze(['count', 'refunds']),
    'panel.widget.card_details': Object.freeze(['queue', 'width', 'height', 'id']),
    'panel.entry.call.remaining': Object.freeze(['time']),
    'panel.error.reference': Object.freeze(['id']),
    'panel.reward.candidate_counts': Object.freeze(['compatible', 'total']),
    'panel.reward.mismatch_summary': Object.freeze(['reasons']),
    'panel.reward.mismatch.title': Object.freeze(['count']),
    'panel.reward.mismatch.cost': Object.freeze(['count']),
    'panel.reward.mismatch.prompt': Object.freeze(['count']),
    'panel.reward.mismatch.uid': Object.freeze(['count']),
    'panel.reward.mismatch.stream_limit': Object.freeze(['count']),
    'panel.reward.mismatch.viewer_limit': Object.freeze(['count']),
    'panel.reward.mismatch.cooldown': Object.freeze(['count']),
    'panel.reward.mismatch.auto_fulfill': Object.freeze(['count']),
    'panel.reward.mismatch.skip_queue': Object.freeze(['count']),
    'panel.reward.mismatch.disabled': Object.freeze(['count']),
    'panel.reward.mismatch.not_paused': Object.freeze(['count']),
  }),
});

function isCanonicalLocale(locale) {
  if (typeof locale !== 'string') return false;
  try {
    return globalThis.Intl.getCanonicalLocales(locale)[0] === locale;
  } catch {
    return false;
  }
}

async function readCatalog(filePath, locale, required) {
  try {
    return parseCatalogBytes(await readFile(filePath));
  } catch {
    if (required) throw new Error(`Required catalog is invalid for locale ${locale}`);
    return null;
  }
}

/**
 * Discover catalog files for one module. New canonical locale filenames are
 * considered automatically; incomplete community catalogs are excluded.
 * @param {string} catalogRoot
 * @param {string} moduleName
 * @param {{requiredLocales?: readonly string[], placeholders?: Record<string, string[]>}} [options]
 * @returns {Promise<{catalogs: Readonly<Record<string, Record<string, string>>>, locales: readonly string[], rejectedLocales: ReadonlyArray<{locale: string, reason: string}>}>}
 */
export async function discoverCatalogModule(catalogRoot, moduleName, options = {}) {
  if (typeof moduleName !== 'string' || !MODULE_PATTERN.test(moduleName)) {
    throw new Error('Invalid catalog module identifier');
  }

  const requiredLocales = options.requiredLocales ?? DEFAULT_REQUIRED_LOCALES;
  const modulePath = resolve(catalogRoot, moduleName);
  let entries;
  try {
    entries = await readdir(modulePath, { withFileTypes: true });
  } catch {
    throw new Error('Catalog module directory is unavailable');
  }

  const localeFiles = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.tsv')) continue;
    const locale = entry.name.slice(0, -4);
    if (isCanonicalLocale(locale)) localeFiles.set(locale, join(modulePath, entry.name));
  }

  const catalogs = Object.create(null);
  for (const locale of requiredLocales) {
    if (!localeFiles.has(locale)) throw new Error(`Required catalog is missing for locale ${locale}`);
    catalogs[locale] = await readCatalog(localeFiles.get(locale), locale, true);
  }
  const placeholders = options.placeholders ?? MODULE_PLACEHOLDERS[moduleName] ?? {};
  validateCatalogSet(catalogs, { locales: requiredLocales, placeholders });

  const rejectedLocales = [];
  for (const locale of [...localeFiles.keys()].filter((item) => !requiredLocales.includes(item)).sort()) {
    const catalog = await readCatalog(localeFiles.get(locale), locale, false);
    if (!catalog) {
      rejectedLocales.push({ locale, reason: 'invalid-catalog' });
      continue;
    }

    try {
      validateCatalogSet({ ...catalogs, [locale]: catalog }, {
        locales: requiredLocales,
        placeholders,
      });
      catalogs[locale] = catalog;
    } catch {
      rejectedLocales.push({ locale, reason: 'invalid-catalog' });
    }
  }

  const orderedLocales = Object.keys(catalogs).sort();
  return Object.freeze({
    catalogs: Object.freeze(catalogs),
    locales: Object.freeze(orderedLocales),
    rejectedLocales: Object.freeze(rejectedLocales),
  });
}
