import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_WIDGET_STYLE, validateOverlayWidgetConfiguration } from '../../apps/api/src/domain/overlay-widget-policy.mjs';

describe('OBS widget configuration policy', () => {
  it('requires a selected queue for queue fields and forbids queue scope for channel-wide fields', () => {
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'queue_name' })).toThrow('queue');
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'queue_waiting_count', queueId: 'q-1' })).not.toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'account_label', queueId: 'q-1' })).toThrow('queue');
  });

  it('counts fixed and fallback text in Unicode code points, including astral characters', () => {
    const twoHundredFortyCodePoints = '😀'.repeat(240);
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'fixed_text', fixedText: twoHundredFortyCodePoints, fallbackText: 'é'.repeat(240) })).not.toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'fixed_text', fixedText: '😀'.repeat(241) })).toThrow('240');
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'queue_name', queueId: 'q-1', fallbackText: 'a'.repeat(241) })).toThrow('240');
  });

  it('accepts bounded allowlisted styles and rejects malformed, remote, or executable style input', () => {
    const style = {
      textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 80,
      fontFamily: 'system-ui', fontSize: 32, fontWeight: 700, alignment: 'center',
      effect: 'outline', outlineWidth: 2, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8,
      overflow: 'wrap',
    };
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'account_label', style })).not.toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'account_label', style: { ...style, fontFamily: 'url(https://example.com/font)' } })).toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'account_label', style: { ...style, width: 3841 } })).toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'account_label', style: { ...style, extra: 'color:red' } })).toThrow();
  });

  it('requires fixed text only for the fixed_text source and rejects unsupported source types', () => {
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'fixed_text', fixedText: 'Olá' })).not.toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'fixed_text' })).toThrow();
    expect(() => validateOverlayWidgetConfiguration({ sourceType: 'unsupported' })).toThrow();
  });

  it('provides the UX-approved transparent and readable default style', () => {
    expect(DEFAULT_OVERLAY_WIDGET_STYLE).toMatchObject({
      textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui',
      fontSize: 32, fontWeight: 700, alignment: 'center', effect: 'none', width: 640, height: 100,
      marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
    });
  });
});
