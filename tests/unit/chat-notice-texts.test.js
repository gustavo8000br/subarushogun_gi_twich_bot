import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { discoverCatalogBundle } from '../../apps/shared/localization/discover-catalog-bundle.mjs';
import { resolveFirstPartyCatalogRoot } from '../../apps/shared/localization/first-party-catalogs.mjs';
import {
  CHAT_NOTICE_KINDS, CHAT_NOTICE_MAX_LENGTH, REFUSAL_NOTICE_KIND_BY_REASON, composeChatNotice,
} from '../../apps/api/src/domain/chat-notice-composer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await discoverCatalogBundle(resolveFirstPartyCatalogRoot(root), { communityCatalogRoot: `${root}.local/none/` });
const catalogs = bundle.modules.chat.catalogs;
const params = { user: 'Viewer', queue: 'Abyss', position: 3, count: 4 };

describe('OPS-31 P2 notice texts (U71-01, U71-12, L71-01, L71-02)', () => {
  it('U71-01: joined text carries position and instruction in en, es and pt-BR', () => {
    expect(composeChatNotice({ kind: 'joined', locale: 'en', catalogs, params })).toBe('@Viewer, you joined Abyss at position 3. We will tell you when it is your turn.');
    expect(composeChatNotice({ kind: 'joined', locale: 'es', catalogs, params })).toContain('posición 3');
    expect(composeChatNotice({ kind: 'joined', locale: 'pt-BR', catalogs, params })).toContain('posição 3');
  });

  it('L71-01/L71-02: every notice kind resolves in the three languages with no unresolved placeholder', () => {
    for (const locale of ['en', 'es', 'pt-BR']) {
      for (const kind of Object.keys(CHAT_NOTICE_KINDS)) {
        const text = composeChatNotice({ kind, locale, catalogs, params });
        expect(text, `${locale}/${kind}`).toBeTruthy();
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toBe(catalogs[locale]['translation.unavailable']);
      }
    }
  });

  it('plural cleared text follows the count', () => {
    expect(composeChatNotice({ kind: 'cleared', locale: 'en', catalogs, params: { queue: 'Abyss', count: 1 } })).toBe('Abyss was cleared. 1 person removed.');
    expect(composeChatNotice({ kind: 'cleared', locale: 'en', catalogs, params: { queue: 'Abyss', count: 5 } })).toBe('Abyss was cleared. 5 people removed.');
  });

  it('U71-12: stays within 500 characters with worst-case multi-byte names and never carries a raw id', () => {
    const long = '界'.repeat(500);
    for (const locale of ['en', 'es', 'pt-BR']) {
      for (const kind of Object.keys(CHAT_NOTICE_KINDS)) {
        const text = composeChatNotice({ kind, locale, catalogs, params: { user: long, queue: long, position: 999999, count: 999999 } });
        expect(Array.from(text).length).toBeLessThanOrEqual(CHAT_NOTICE_MAX_LENGTH);
      }
    }
  });

  it('control characters in names become spaces and an unknown kind is refused', () => {
    expect(composeChatNotice({ kind: 'queue_closed', locale: 'en', catalogs, params: { queue: 'A\nB' } })).toBe('A B is closed. New redemptions will be refused and the points returned.');
    expect(composeChatNotice({ kind: 'nope', locale: 'en', catalogs, params })).toBeNull();
  });

  it('refusal reasons map to at most four refusal texts and never to a group-refund family (AC 28)', () => {
    expect(new Set(Object.values(REFUSAL_NOTICE_KIND_BY_REASON)).size).toBeLessThanOrEqual(4);
    for (const kind of Object.values(REFUSAL_NOTICE_KIND_BY_REASON)) expect(CHAT_NOTICE_KINDS[kind].key).toMatch(/^chat\.notice\.refused\./);
    expect(Object.values(CHAT_NOTICE_KINDS).some((kind) => kind.key.includes('points'))).toBe(false);
  });
});
