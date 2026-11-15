import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { minimumWidgetHeight } from '../../apps/frontend/features/widgets/widget-management.mjs';
import { mountOverlayWidget } from '../../apps/shared/panel/overlay-renderer.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = read('apps/frontend/styles/overlay.css');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('LA-12 minimum widget height', () => {
  it.each([[8, 32], [24, 54], [32, 65], [128, 200]])('font %i needs %i px', (font, expected) => {
    expect(minimumWidgetHeight(font)).toBe(expected);
  });
});

describe('LA-12 status line inside the box', () => {
  const status = rule('.overlay-status');
  it('is a normal grid row, not positioned below the box', () => {
    expect(status).toBeTruthy();
    expect(status).not.toMatch(/position\s*:\s*absolute/);
    expect(status).not.toMatch(/top\s*:\s*100%/);
    expect(rule('.overlay-widget')).toMatch(/display\s*:\s*grid/);
    expect(rule('.overlay-widget')).toMatch(/grid-template-rows\s*:\s*1fr auto/);
  });
  it('is hidden when empty', () => {
    expect(css).toMatch(/\.overlay-status:empty\s*\{\s*display\s*:\s*none\s*;?\s*\}/);
  });
  it('renderer keeps the grid layout inline (inline style would override the CSS)', async () => {
    const mk = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {}, contains: () => false }, dataset: {} });
    const [widget, value, statusEl] = [mk(), mk(), mk()];
    const document = { body: { dataset: {} }, visibilityState: 'visible', addEventListener() {}, getElementById: (id) => ({ 'overlay-widget': widget, 'overlay-value': value, 'overlay-status': statusEl })[id] ?? null };
    const payload = { sourceType: 'fixed_text', value: 'x', fallbackText: '', style: { alignment: 'right' } };
    const fetch = async () => ({ ok: true, status: 200, json: async () => payload });
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'a'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    expect(widget.style.display).toBe('grid');
    expect(widget.style.gridTemplateRows).toBe('1fr auto');
    expect(widget.style.justifyItems).toBe('end');
  });
});

describe('LA-13 status legibility', () => {
  const status = rule('.overlay-status');
  const fg = status.match(/--overlay-status-fg\s*:\s*([^;]+);/)?.[1].trim();
  const bg = status.match(/--overlay-status-bg\s*:\s*rgba\(([^)]+)\)/)?.[1].split(',').map((v) => Number(v.trim()));
  it('declares the two variables and applies them', () => {
    expect(fg).toBe('#ffffff');
    expect(bg).toHaveLength(4);
    // D-2: native OBS measured 3.19:1 with 0.72 and 7.11:1 with 0.90 over a white scene.
    expect(bg[3]).toBeGreaterThanOrEqual(0.9);
    expect(status).toMatch(/color\s*:\s*var\(--overlay-status-fg\)/);
    expect(status).toMatch(/background\s*:\s*var\(--overlay-status-bg\)/);
    expect(status).not.toMatch(/(^|[;\s])opacity\s*:/);
  });
  it('stale dimming applies to the value only', () => {
    expect(rule('.overlay-widget.is-stale')).toBeNull();
    expect(rule('.overlay-widget.is-stale .overlay-value')).toMatch(/opacity\s*:\s*\.82/);
  });
  it('contrast of white text over the chip on pure white is at least 7:1', () => {
    const [r, g, b, a] = bg;
    const composite = [r, g, b].map((c) => c * a + 255 * (1 - a));
    expect(ratio([255, 255, 255], composite)).toBeGreaterThanOrEqual(7);
  });
  it('contrast stays at least 7:1 on pure white when the chip is blended in linear light (how native OBS composites)', () => {
    const alpha = bg[3];
    // Linear-light blend of a black chip over a white scene, then sRGB-encoded as the pixel OBS shows.
    const linear = (1 - alpha) * 1 + alpha * 0;
    const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    const pixel = Math.round(encoded * 255);
    expect(ratio([255, 255, 255], [pixel, pixel, pixel])).toBeGreaterThanOrEqual(6.9);
    // The pre-fix alpha 0.72 gives pixel 144 and 3.19:1, the OBS reading that failed LA-11.
    const old = Math.round((1.055 * 0.28 ** (1 / 2.4) - 0.055) * 255);
    expect(old).toBe(144);
    expect(ratio([255, 255, 255], [old, old, old])).toBeLessThan(4.5);
  });
});

describe('height keys in the three catalogs and runbook', () => {
  const placeholders = (text) => (text.match(/\{[a-z]+\}/g) ?? []).sort().join();
  for (const [key, expectedPlaceholders] of [['panel.widget.height_hint', '{min},{min}'], ['panel.widget.height_below_min', '{min}']]) {
    it(`${key} exists in en, es and pt-BR with {min}`, () => {
      for (const locale of ['en', 'es', 'pt-BR']) {
        const line = read(`apps/shared/localization/catalogs/panel/${locale}.tsv`).split('\n').find((l) => l.startsWith(`${key}\t`));
        expect(line, `${locale} ${key}`).toBeTruthy();
        expect(placeholders(line.split('\t')[1])).toBe(expectedPlaceholders);
      }
    });
  }
  it('runbook en and pt-BR carry the formula, the legacy URL and the dev:start warning', () => {
    for (const path of ['docs/stories/OPS-25/obs-native-runbook.md', 'docs/pt-BR/stories/OPS-25/obs-native-runbook.md']) {
      const text = read(path);
      expect(text).toMatch(/ceil\(.* x 1[.,]4\) \+ 20/);
      expect(text).toContain('65 px');
      expect(text).toContain('/overlay.html');
      expect(text).toMatch(/Never stream with `dev:start`|Nunca transmita com `dev:start`/);
    }
  });
});
