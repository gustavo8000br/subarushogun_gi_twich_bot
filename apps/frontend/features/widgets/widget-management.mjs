export const WIDGET_SOURCE_KEYS = Object.freeze({
  account_label: 'panel.widget.source.account',
  queue_name: 'panel.widget.source.queue_name',
  queue_state: 'panel.widget.source.queue_state',
  queue_waiting_count: 'panel.widget.source.queue_count',
  called_viewer_display_name: 'panel.widget.source.called_name',
  called_viewer_position: 'panel.widget.source.called_position',
  fixed_text: 'panel.widget.source.fixed_text',
});

export const QUEUE_WIDGET_SOURCES = new Set(['queue_name', 'queue_state', 'queue_waiting_count']);

export const DEFAULT_WIDGET_STYLE = Object.freeze({
  textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui', fontSize: 32,
  fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0,
  shadowOffsetY: 0, width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
});

export const WIDGET_STYLE_FIELDS = Object.freeze(Object.keys(DEFAULT_WIDGET_STYLE));

export function createWidgetFormValues(widget = null) {
  return {
    sourceType: widget?.sourceType ?? 'account_label',
    queueId: widget?.queueId ?? '',
    fixedText: widget?.fixedText ?? '',
    fallbackText: widget?.fallbackText ?? '',
    ...Object.fromEntries(WIDGET_STYLE_FIELDS.map((field) => [field, widget?.style?.[field] ?? DEFAULT_WIDGET_STYLE[field]])),
  };
}

export function validateWidgetProjection(input) {
  if (!Array.isArray(input) || input.some((widget) => !widget || typeof widget !== 'object'
    || typeof widget.id !== 'string' || !widget.id || typeof widget.sourceType !== 'string'
    || !Number.isInteger(widget.version) || widget.version < 1
    || !widget.style || typeof widget.style !== 'object' || Array.isArray(widget.style))) {
    throw new Error('Invalid widget projection');
  }
  return input;
}
