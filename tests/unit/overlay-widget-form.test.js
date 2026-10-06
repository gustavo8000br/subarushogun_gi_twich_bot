import { describe, expect, it } from 'vitest';
import { buildOverlayWidgetPayload, countOverlayTextCodePoints } from '../../apps/web/overlay-widget-form.mjs';

function values(overrides = {}) {
  return new Map(Object.entries({ sourceType: 'account_label', queueId: '', fixedText: '', fallbackText: '', width: '640', height: '100', textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: '0', fontFamily: 'system-ui', fontSize: '32', fontWeight: '700', alignment: 'center', effect: 'none', outlineWidth: '1', shadowBlur: '0', shadowOffsetX: '0', shadowOffsetY: '0', marginTop: '8', marginRight: '8', marginBottom: '8', marginLeft: '8', overflow: 'wrap', ...overrides }));
}

describe('OBS widget editor payload', () => {
  it('clears stale queue/fixed fields when changing source and converts bounded style controls to numbers', () => {
    expect(buildOverlayWidgetPayload(values({ queueId: 'old-queue', fixedText: 'old fixed text', fallbackText: 'Sem valor', width: 'auto' }))).toMatchObject({
      sourceType: 'account_label', queueId: null, fixedText: null, fallbackText: 'Sem valor',
      style: { width: 'auto', height: 100, backgroundOpacity: 0, fontSize: 32, fontWeight: 700 },
    });
  });

  it('requires the editor to supply the selected queue/text data without carrying unrelated fields', () => {
    expect(buildOverlayWidgetPayload(values({ sourceType: 'queue_name', queueId: 'queue-1', fixedText: 'stale' }))).toMatchObject({ sourceType: 'queue_name', queueId: 'queue-1', fixedText: null });
    expect(buildOverlayWidgetPayload(values({ sourceType: 'fixed_text', queueId: 'stale', fixedText: 'Live' }))).toMatchObject({ sourceType: 'fixed_text', queueId: null, fixedText: 'Live' });
  });

  it('uses Unicode code points for the same 240-character limit as the API', () => {
    expect(countOverlayTextCodePoints('😀'.repeat(240))).toBe(240);
    expect(() => buildOverlayWidgetPayload(values({ sourceType: 'fixed_text', fixedText: '😀'.repeat(240) }))).not.toThrow();
    expect(() => buildOverlayWidgetPayload(values({ sourceType: 'fixed_text', fixedText: '😀'.repeat(241) }))).toThrow('240');
    expect(() => buildOverlayWidgetPayload(values({ sourceType: 'queue_name', queueId: 'queue-1', fallbackText: 'a'.repeat(241) }))).toThrow('240');
  });

  it('rejects unsupported source and font values in the browser before submitting', () => {
    expect(() => buildOverlayWidgetPayload(values({ sourceType: 'unknown' }))).toThrow();
    expect(() => buildOverlayWidgetPayload(values({ fontFamily: 'url(https://invalid.example)' }))).toThrow();
  });
});
