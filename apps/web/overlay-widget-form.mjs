const queueScopedSources = new Set(['queue_name', 'queue_state', 'queue_waiting_count']);
const supportedSources = new Set([...queueScopedSources, 'account_label', 'called_viewer_display_name', 'called_viewer_position', 'in_service_viewer_display_name', 'fixed_text']);
const fixedTextLimit = 240;
const styleFields = ['textColor', 'backgroundColor', 'backgroundOpacity', 'fontFamily', 'fontSize', 'fontWeight', 'alignment', 'effect', 'outlineWidth', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'overflow'];
const fontFamilies = new Set(['system-ui', 'Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Courier New, monospace']);

function countCodePoints(value) { return [...value].length; }

function assertText(value, label, required = false) {
  if (typeof value !== 'string' || (required && !value.trim()) || countCodePoints(value) > fixedTextLimit) {
    throw new Error(`${label}: use até 240 pontos de código Unicode${required ? ' e informe um texto' : ''}.`);
  }
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Valor inválido para ${label}.`);
}

/** @param {{get: (key: string) => FormDataEntryValue|null}} values */
export function buildOverlayWidgetPayload(values) {
  const sourceType = String(values.get('sourceType') ?? '');
  const rawDimension = (key) => String(values.get(key) || 'auto').trim().toLowerCase() === 'auto' ? 'auto' : Number(values.get(key));
  const style = {};
  for (const field of styleFields) {
    if (field === 'width' || field === 'height') style[field] = rawDimension(field);
    else if (['backgroundOpacity', 'fontSize', 'fontWeight', 'outlineWidth', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'].includes(field)) style[field] = Number(values.get(field));
    else style[field] = String(values.get(field) ?? '');
  }
  const payload = {
    sourceType,
    queueId: queueScopedSources.has(sourceType) ? String(values.get('queueId') ?? '') : null,
    fixedText: sourceType === 'fixed_text' ? String(values.get('fixedText') ?? '') : null,
    fallbackText: String(values.get('fallbackText') ?? ''),
    style,
  };
  validateOverlayWidgetPayload(payload);
  return payload;
}

/** Keep browser-side limits aligned with API policy; the server remains authoritative. */
export function validateOverlayWidgetPayload({ sourceType, queueId, fixedText, fallbackText, style }) {
  if (!supportedSources.has(sourceType)) throw new Error('Selecione uma fonte permitida.');
  if (queueScopedSources.has(sourceType) && (typeof queueId !== 'string' || !queueId.trim())) throw new Error('Selecione uma fila.');
  if (!queueScopedSources.has(sourceType) && queueId !== null) throw new Error('Esta fonte não usa uma fila.');
  if (sourceType === 'fixed_text') assertText(fixedText, 'Texto fixo', true);
  if (sourceType !== 'fixed_text' && fixedText !== null) throw new Error('Esta fonte não aceita texto fixo.');
  assertText(fallbackText, 'Texto alternativo');
  if (!/^#[0-9A-Fa-f]{6}$/.test(style.textColor) || !/^#[0-9A-Fa-f]{6}$/.test(style.backgroundColor)) throw new Error('Revise as cores escolhidas.');
  assertInteger(style.backgroundOpacity, 0, 100, 'opacidade');
  if (!fontFamilies.has(style.fontFamily)) throw new Error('Selecione uma fonte permitida.');
  assertInteger(style.fontSize, 8, 128, 'tamanho da fonte');
  if (![300, 400, 500, 600, 700, 800, 900].includes(style.fontWeight)) throw new Error('Selecione um peso de fonte permitido.');
  if (!['left', 'center', 'right'].includes(style.alignment)) throw new Error('Selecione um alinhamento permitido.');
  if (!['none', 'outline', 'shadow'].includes(style.effect)) throw new Error('Selecione um efeito permitido.');
  assertInteger(style.outlineWidth, 1, 8, 'contorno');
  assertInteger(style.shadowBlur, 0, 32, 'desfoque');
  assertInteger(style.shadowOffsetX, -32, 32, 'deslocamento horizontal');
  assertInteger(style.shadowOffsetY, -32, 32, 'deslocamento vertical');
  for (const [field, max] of [['width', 3840], ['height', 2160]]) if (style[field] !== 'auto') assertInteger(style[field], 1, max, field);
  for (const field of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) assertInteger(style[field], 0, 256, field);
  if (!['wrap', 'clip', 'ellipsis'].includes(style.overflow)) throw new Error('Selecione um comportamento de texto permitido.');
  return true;
}

export function countOverlayTextCodePoints(value) { return countCodePoints(String(value ?? '')); }
