import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  GROUP_LOOKUP_REASON_KEYS,
  groupLookupReasonKey,
  groupLookupReasonNeedsReconnect,
} from '../../apps/frontend/features/settings/group-lookup-reason.mjs';
import { GROUP_LOOKUP_REASONS } from '../../apps/api/src/twitch/group-lookup.mjs';

describe('OPS-31 X2: group lookup failure code -> catalog key (UX report section 1)', () => {
  it('maps the ten API reason codes to the four approved classes', () => {
    const expected = {
      scope_missing: 'reconnect', unauthorized: 'reconnect',
      timeout: 'slow', rate_limited: 'slow', twitch_unavailable: 'slow',
      channel_not_eligible: 'not_eligible',
      forbidden: 'failed', malformed_response: 'failed', lookup_error: 'failed', bad_request: 'failed',
    };
    expect(Object.keys(expected).sort()).toEqual([...GROUP_LOOKUP_REASONS].sort());
    for (const [code, kind] of Object.entries(expected)) expect(groupLookupReasonKey(code), code).toBe(`panel.group_lookup.reason.${kind}`);
  });

  it('never returns a blank or an inherited key: unknown and hostile values fall to "failed"', () => {
    for (const value of [undefined, null, 42, {}, '', 'nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(groupLookupReasonKey(value), String(value)).toBe('panel.group_lookup.reason.failed');
    }
  });

  it('offers the Reconnect action only for the reconnect class (forbidden is not promised a fix)', () => {
    expect(groupLookupReasonNeedsReconnect('scope_missing')).toBe(true);
    expect(groupLookupReasonNeedsReconnect('unauthorized')).toBe(true);
    for (const code of ['forbidden', 'timeout', 'channel_not_eligible', 'bad_request', 'unknown']) expect(groupLookupReasonNeedsReconnect(code), code).toBe(false);
  });

  it('every returned key exists in en, es and pt-BR with text of at most 200 characters, and the reconnect button reuses the connection key', async () => {
    expect([...GROUP_LOOKUP_REASON_KEYS].sort()).toEqual(['reconnect', 'slow', 'not_eligible', 'failed'].map((kind) => `panel.group_lookup.reason.${kind}`).sort());
    for (const locale of ['en', 'es', 'pt-BR']) {
      const catalog = new Map((await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8'))
        .split('\n').filter(Boolean).map((line) => line.split('\t')));
      for (const key of GROUP_LOOKUP_REASON_KEYS) {
        const text = catalog.get(key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        expect(text.length, `${locale} ${key}`).toBeLessThanOrEqual(200);
        expect(text, `${locale} ${key}`).not.toMatch(/\{|minute|minuto|segundo|second/i); // no placeholder, no invented retry time
      }
      expect(catalog.get('panel.connection.reconnect'), locale).toBeTruthy();
    }
  });
});
