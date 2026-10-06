const queueScopedSources = new Set(['queue_name', 'queue_state', 'queue_waiting_count']);
const channelSources = new Set(['account_label', 'called_viewer_display_name', 'called_viewer_position', 'in_service_viewer_display_name']);
const sourceTypes = new Set([...queueScopedSources, ...channelSources, 'fixed_text']);
const fontFamilies = new Set(['system-ui', 'Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Courier New, monospace']);
const styleFields = new Set([
  'textColor', 'backgroundColor', 'backgroundOpacity', 'fontFamily', 'fontSize', 'fontWeight', 'alignment',
  'effect', 'outlineWidth', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'width', 'height',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'overflow',
]);

export const DEFAULT_OVERLAY_WIDGET_STYLE = Object.freeze({
  textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui',
  fontSize: 32, fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1,
  shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, width: 640, height: 100,
  marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
});

function invalidConfiguration(reason) {
  return Object.assign(new Error(`Overlay widget configuration ${reason}`), { code: 'INVALID_OVERLAY_WIDGET_CONFIGURATION' });
}

function assertIntegerRange(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max) throw invalidConfiguration(`has an invalid ${field}`);
}

/** @param {Record<string, any>} [style] */
function validateStyle(style = {}) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) throw invalidConfiguration('has an invalid style');
  for (const key of Object.keys(style)) if (!styleFields.has(key)) throw invalidConfiguration('has an unsupported style field');

  if (style.textColor !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(style.textColor)) throw invalidConfiguration('has an invalid text color');
  if (style.backgroundColor !== undefined && style.backgroundColor !== null && !/^#[0-9A-Fa-f]{6}$/.test(style.backgroundColor)) throw invalidConfiguration('has an invalid background color');
  if (style.backgroundOpacity !== undefined) assertIntegerRange(style.backgroundOpacity, 0, 100, 'background opacity');
  if (style.fontFamily !== undefined && !fontFamilies.has(style.fontFamily)) throw invalidConfiguration('has an unsupported font family');
  if (style.fontSize !== undefined) assertIntegerRange(style.fontSize, 8, 128, 'font size');
  if (style.fontWeight !== undefined && ![300, 400, 500, 600, 700, 800, 900].includes(style.fontWeight)) throw invalidConfiguration('has an unsupported font weight');
  if (style.alignment !== undefined && !['left', 'center', 'right'].includes(style.alignment)) throw invalidConfiguration('has an unsupported alignment');
  if (style.effect !== undefined && !['none', 'outline', 'shadow'].includes(style.effect)) throw invalidConfiguration('has an unsupported effect');
  if (style.outlineWidth !== undefined) assertIntegerRange(style.outlineWidth, 1, 8, 'outline width');
  if (style.shadowBlur !== undefined) assertIntegerRange(style.shadowBlur, 0, 32, 'shadow blur');
  for (const field of ['shadowOffsetX', 'shadowOffsetY']) if (style[field] !== undefined) assertIntegerRange(style[field], -32, 32, field);
  for (const field of ['width', 'height']) {
    const max = field === 'width' ? 3840 : 2160;
    if (style[field] !== undefined && style[field] !== 'auto') assertIntegerRange(style[field], 1, max, field);
  }
  for (const field of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) if (style[field] !== undefined) assertIntegerRange(style[field], 0, 256, field);
  if (style.overflow !== undefined && !['wrap', 'clip', 'ellipsis'].includes(style.overflow)) throw invalidConfiguration('has an unsupported overflow mode');
}

export function normalizeOverlayWidgetStyle(style = {}) {
  const normalized = { ...DEFAULT_OVERLAY_WIDGET_STYLE, ...style };
  validateStyle(normalized);
  return normalized;
}

function validateText(value, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalidConfiguration(`requires ${field}`);
    return;
  }
  if (typeof value !== 'string' || [...value].length > 240) throw invalidConfiguration(`has invalid ${field}; maximum is 240 Unicode code points`);
}

/** Validate persisted widget source scope and allowlisted presentation values. */
/** @param {{sourceType: string, queueId?: string|null, fixedText?: string|null, fallbackText?: string, style?: Record<string, any>}} configuration */
export function validateOverlayWidgetConfiguration({ sourceType, queueId = null, fixedText = null, fallbackText = '', style = {} }) {
  if (!sourceTypes.has(sourceType)) throw invalidConfiguration('has an unsupported source');
  if (queueScopedSources.has(sourceType) && (typeof queueId !== 'string' || !queueId.trim())) throw invalidConfiguration('requires a queue');
  if ((channelSources.has(sourceType) || sourceType === 'fixed_text') && queueId !== null) throw invalidConfiguration('cannot include a queue for this source');
  if (sourceType === 'fixed_text') validateText(fixedText, 'fixed text', { required: true });
  else if (fixedText !== null) throw invalidConfiguration('cannot include fixed text for a dynamic source');
  validateText(fallbackText, 'fallback text');
  validateStyle(style);
  return true;
}
