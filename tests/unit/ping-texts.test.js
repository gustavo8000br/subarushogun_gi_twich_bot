// OPS-26 slice A / D-8, AC-D8-7: the UX texts of `ping` exist in the three chat catalogs and the panel description names the codes.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function catalog(module, locale) {
  const text = await readFile(new URL(`../../apps/shared/localization/catalogs/${module}/${locale}.tsv`, import.meta.url), 'utf8');
  return new Map(text.split('\n').filter(Boolean).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
}

const EXPECTED = {
  response: { 'pt-BR': 'Pong 🏓 - {version} - {latency}ms.', en: 'Pong 🏓 - {version} - {latency}ms.', es: 'Pong 🏓 - {version} - {latency}ms.' },
  error: {
    'pt-BR': 'Pong 🏓 - {version} - sem medição da Twitch ({code}).',
    en: 'Pong 🏓 - {version} - no Twitch measurement ({code}).',
    es: 'Pong 🏓 - {version} - sin medición de Twitch ({code}).',
  },
};

describe('ping texts (D-8, UX review 2026-11-05)', () => {
  for (const locale of ['pt-BR', 'en', 'es']) {
    it(`${locale}: response and error use the UX wording, stay under 500 characters and chat.ping.unavailable is gone`, async () => {
      const chat = await catalog('chat', locale);
      expect(chat.get('chat.ping.response')).toBe(EXPECTED.response[locale]);
      expect(chat.get('chat.ping.error')).toBe(EXPECTED.error[locale]);
      expect(chat.has('chat.ping.unavailable')).toBe(false);
      for (const key of ['chat.ping.response', 'chat.ping.error']) expect(chat.get(key).replace('{version}', 'v0.3.0-beta').replace('{latency}', '99999').replace('{code}', 'TWITCH_NOT_CONNECTED').length).toBeLessThan(500);
    });

    it(`${locale}: the panel command description explains both codes`, async () => {
      const panel = await catalog('panel', locale);
      const description = panel.get('panel.command.description.global_queue_ping');
      expect(description).toContain('TWITCH_NOT_CONNECTED');
      expect(description).toContain('TWITCH_PROBE_FAILED');
    });
  }
});
