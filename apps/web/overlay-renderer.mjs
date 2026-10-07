const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const fontFamilies = new Set(['system-ui', 'Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Courier New, monospace']);
const alignments = new Set(['left', 'center', 'right']);

function boundedNumber(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function safeDimension(value, max) {
  return value === 'auto' || (Number.isInteger(value) && value >= 1 && value <= max) ? value : 'auto';
}

function safeStyle(style = {}) {
  const alignment = alignments.has(style.alignment) ? style.alignment : 'center';
  const effect = ['none', 'outline', 'shadow'].includes(style.effect) ? style.effect : 'none';
  const overflow = ['wrap', 'clip', 'ellipsis'].includes(style.overflow) ? style.overflow : 'wrap';
  return {
    textColor: /^#[0-9A-Fa-f]{6}$/.test(style.textColor ?? '') ? style.textColor : '#FFFFFF',
    backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(style.backgroundColor ?? '') ? style.backgroundColor : '#000000',
    backgroundOpacity: boundedNumber(style.backgroundOpacity, 0, 100, 0),
    fontFamily: fontFamilies.has(style.fontFamily) ? style.fontFamily : 'system-ui',
    fontSize: boundedNumber(style.fontSize, 8, 128, 32),
    fontWeight: [300, 400, 500, 600, 700, 800, 900].includes(style.fontWeight) ? style.fontWeight : 700,
    alignment,
    effect,
    outlineWidth: boundedNumber(style.outlineWidth, 1, 8, 1),
    shadowBlur: boundedNumber(style.shadowBlur, 0, 32, 0),
    shadowOffsetX: boundedNumber(style.shadowOffsetX, -32, 32, 0),
    shadowOffsetY: boundedNumber(style.shadowOffsetY, -32, 32, 0),
    width: safeDimension(style.width, 3840),
    height: safeDimension(style.height, 2160),
    marginTop: boundedNumber(style.marginTop, 0, 256, 8),
    marginRight: boundedNumber(style.marginRight, 0, 256, 8),
    marginBottom: boundedNumber(style.marginBottom, 0, 256, 8),
    marginLeft: boundedNumber(style.marginLeft, 0, 256, 8),
    overflow,
  };
}

function renderStyle(widget, value, input) {
  const style = safeStyle(input);
  const alpha = style.backgroundOpacity / 100;
  const red = Number.parseInt(style.backgroundColor.slice(1, 3), 16);
  const green = Number.parseInt(style.backgroundColor.slice(3, 5), 16);
  const blue = Number.parseInt(style.backgroundColor.slice(5, 7), 16);
  widget.style.boxSizing = 'border-box';
  widget.style.display = 'flex';
  widget.style.alignItems = 'center';
  widget.style.justifyContent = ({ left: 'flex-start', center: 'center', right: 'flex-end' })[style.alignment];
  widget.style.color = style.textColor;
  widget.style.backgroundColor = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  widget.style.fontFamily = style.fontFamily;
  widget.style.fontSize = `${style.fontSize}px`;
  widget.style.fontWeight = String(style.fontWeight);
  widget.style.textAlign = style.alignment;
  widget.style.width = style.width === 'auto' ? 'auto' : `${style.width}px`;
  widget.style.height = style.height === 'auto' ? 'auto' : `${style.height}px`;
  widget.style.margin = `${style.marginTop}px ${style.marginRight}px ${style.marginBottom}px ${style.marginLeft}px`;
  widget.style.overflow = style.overflow === 'wrap' ? 'visible' : 'hidden';
  value.style.whiteSpace = style.overflow === 'ellipsis' ? 'nowrap' : 'normal';
  value.style.textOverflow = style.overflow === 'ellipsis' ? 'ellipsis' : 'clip';
  value.style.webkitTextStroke = style.effect === 'outline' ? `${style.outlineWidth}px ${style.textColor}` : '';
  value.style.textShadow = style.effect === 'shadow'
    ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px #000000`
    : '';
}

function displayValue(payload) {
  if (payload.value === null || payload.value === undefined || payload.value === '') return String(payload.fallbackText ?? '');
  if (payload.sourceType === 'queue_state') {
    if (payload.value === 'open') return payload.messages?.['overlay.state.open'] ?? 'Aberta';
    if (payload.value === 'closed') return payload.messages?.['overlay.state.closed'] ?? 'Fechada';
  }
  return String(payload.value);
}

/** Mount a capability-scoped, read-only OBS overlay and return its poll controls. */
export function mountOverlayWidget({
  document,
  fetch: fetcher = globalThis.fetch,
  location = globalThis.location,
  history = globalThis.history,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
}) {
  const widget = document.getElementById('overlay-widget');
  const value = document.getElementById('overlay-value');
  const status = document.getElementById('overlay-status');
  const token = String(location.hash ?? '').slice(1);
  let active = tokenPattern.test(token);
  let lastValue = null;
  let inFlight = false;
  let localizedMessages = {};
  function localized(key, fallback) { return localizedMessages[key] ?? fallback; }
  function setProductLocale(locale) {
    if (typeof locale !== 'string') return;
    try { document.documentElement.lang = Intl.getCanonicalLocales(locale)[0]; } catch { /* Ignore invalid catalog locale identifiers. */ }
  }
  if (String(location.hash ?? '')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (!active) status.textContent = localized('overlay.status.unavailable', 'Fonte indisponível');

  function clearForRevocation() {
    active = false;
    lastValue = null;
    value.textContent = '';
    status.textContent = localized('overlay.status.unavailable', 'Fonte indisponível');
    widget.classList.remove('is-stale');
  }

  async function pollNow() {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const response = await fetcher('/overlay/api/widget', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        clearForRevocation();
        return;
      }
      if (!response.ok) {
        if (lastValue === null) status.textContent = localized('overlay.status.data_unavailable', 'Dados temporariamente indisponíveis');
        else {
          status.textContent = localized('overlay.status.stale', 'Atualização atrasada');
          widget.classList.add('is-stale');
        }
        return;
      }
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !['string', 'number'].includes(typeof payload.value) && payload.value !== null) {
        if (lastValue === null) status.textContent = localized('overlay.status.data_unavailable', 'Dados temporariamente indisponíveis');
        else {
          status.textContent = localized('overlay.status.stale', 'Atualização atrasada');
          widget.classList.add('is-stale');
        }
        return;
      }
      setProductLocale(payload.productLocale);
      if (payload.messages && typeof payload.messages === 'object' && !Array.isArray(payload.messages)) localizedMessages = payload.messages;
      if (payload.messages?.['overlay.document.title']) document.title = payload.messages['overlay.document.title'];
      renderStyle(widget, value, payload.style);
      lastValue = displayValue(payload);
      value.textContent = lastValue;
      status.textContent = '';
      widget.classList.remove('is-stale');
    } catch {
      if (lastValue === null) status.textContent = localized('overlay.status.data_unavailable', 'Dados temporariamente indisponíveis');
      else {
        status.textContent = localized('overlay.status.stale', 'Atualização atrasada');
        widget.classList.add('is-stale');
      }
    } finally {
      inFlight = false;
    }
  }

  const interval = schedule(() => { void pollNow(); }, 1000);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void pollNow();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return {
    pollNow,
    destroy() {
      cancel(interval);
      document.removeEventListener?.('visibilitychange', onVisibilityChange);
    },
  };
}
