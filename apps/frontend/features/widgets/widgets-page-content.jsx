'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { usePanel } from '../panel-shell/panel-provider.jsx';
import { buildOverlayWidgetPayload, countOverlayTextCodePoints } from '../../../web/overlay-widget-form.mjs';
import { createWidgetFormValues, QUEUE_WIDGET_SOURCES, validateWidgetProjection, WIDGET_SOURCE_KEYS, WIDGET_STYLE_FIELDS } from './widget-management.mjs';

function safeReferenceId(error) {
  return typeof error?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.referenceId)
    ? error.referenceId : null;
}

const STYLE_LABELS = Object.freeze({
  textColor: 'panel.widget.style.text_color', backgroundColor: 'panel.widget.style.background_color',
  backgroundOpacity: 'panel.widget.style.background_opacity', fontFamily: 'panel.widget.style.font_family',
  fontSize: 'panel.widget.style.font_size', fontWeight: 'panel.widget.style.font_weight',
  alignment: 'panel.widget.style.alignment', effect: 'panel.widget.style.effect',
  outlineWidth: 'panel.widget.style.outline_width', shadowBlur: 'panel.widget.style.shadow_blur',
  shadowOffsetX: 'panel.widget.style.shadow_x', shadowOffsetY: 'panel.widget.style.shadow_y',
  width: 'panel.widget.style.width', height: 'panel.widget.style.height',
  marginTop: 'panel.widget.style.margin_top', marginRight: 'panel.widget.style.margin_right',
  marginBottom: 'panel.widget.style.margin_bottom', marginLeft: 'panel.widget.style.margin_left',
  overflow: 'panel.widget.style.overflow',
});

const SOURCE_SAMPLE_KEYS = Object.freeze({
  account_label: 'panel.widget.preview.account', queue_name: 'panel.widget.preview.queue',
  queue_state: 'panel.widget.preview.open', queue_waiting_count: 'panel.widget.preview.waiting',
  called_viewer_display_name: 'panel.widget.preview.called', called_viewer_position: 'panel.widget.preview.position',
});

function styleFromForm(values) {
  const style = {};
  for (const field of WIDGET_STYLE_FIELDS) {
    if (field === 'width' || field === 'height') style[field] = String(values[field]).toLowerCase() === 'auto' ? 'auto' : Number(values[field]);
    else if (['backgroundOpacity', 'fontSize', 'fontWeight', 'outlineWidth', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'].includes(field)) style[field] = Number(values[field]);
    else style[field] = values[field];
  }
  return style;
}

function formData(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, String(value ?? ''));
  return data;
}

function previewStyle(values) {
  const color = values.textColor;
  const bg = values.backgroundColor;
  const opacity = Math.max(0, Math.min(100, Number(values.backgroundOpacity) || 0)) / 100;
  const rgba = `rgba(${Number.parseInt(bg.slice(1, 3), 16)}, ${Number.parseInt(bg.slice(3, 5), 16)}, ${Number.parseInt(bg.slice(5, 7), 16)}, ${opacity})`;
  return {
    color, backgroundColor: rgba, fontFamily: values.fontFamily, fontSize: `${values.fontSize}px`, fontWeight: values.fontWeight,
    textAlign: values.alignment, width: values.width === 'auto' ? 'auto' : `${values.width}px`,
    minHeight: values.height === 'auto' ? 'auto' : `${values.height}px`,
    margin: `${values.marginTop}px ${values.marginRight}px ${values.marginBottom}px ${values.marginLeft}px`,
    WebkitTextStroke: values.effect === 'outline' ? `${values.outlineWidth}px ${color}` : undefined,
    textShadow: values.effect === 'shadow' ? `${values.shadowOffsetX}px ${values.shadowOffsetY}px ${values.shadowBlur}px #000` : undefined,
    whiteSpace: values.overflow === 'ellipsis' ? 'nowrap' : undefined,
    overflow: ['clip', 'ellipsis'].includes(values.overflow) ? 'hidden' : undefined,
    textOverflow: values.overflow === 'ellipsis' ? 'ellipsis' : undefined,
    overflowWrap: values.overflow === 'wrap' ? 'anywhere' : undefined,
  };
}

export function WidgetsPageView({ t, request = apiClient.request, queues = [], initialStatus = 'loading' }) {
  const [widgets, setWidgets] = useState([]);
  const [loadStatus, setLoadStatus] = useState(initialStatus);
  const [editor, setEditor] = useState(null);
  const [values, setValues] = useState(() => createWidgetFormValues());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [secret, setSecret] = useState('');
  const [secretNotice, setSecretNotice] = useState('');
  const [secretNoticeError, setSecretNoticeError] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [conflictLatest, setConflictLatest] = useState(null);
  const [conflictMissing, setConflictMissing] = useState(false);
  const [loadErrorReference, setLoadErrorReference] = useState(null);
  const hasLoadedWidgets = useRef(false);
  const loadErrorReferenceRef = useRef(null);

  const loadWidgets = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const result = validateWidgetProjection(await request('/api/overlay-widgets'));
      setWidgets(result);
      hasLoadedWidgets.current = true;
      setLoadStatus('ready');
      loadErrorReferenceRef.current = null;
      setLoadErrorReference(null);
      return true;
    } catch (error) {
      setLoadStatus(hasLoadedWidgets.current ? 'ready' : 'error');
      const referenceId = safeReferenceId(error);
      loadErrorReferenceRef.current = referenceId;
      setLoadErrorReference(referenceId);
      return false;
    }
  }, [request]);

  useEffect(() => { void loadWidgets(); }, [loadWidgets]);

  useEffect(() => {
    const active = Boolean(editor || secret || confirmation);
    if (!active) return undefined;
    const dialog = document.querySelector('.widget-editor-backdrop [role="dialog"], .widget-editor-backdrop [role="alertdialog"]');
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (secret) { setSecret(''); setSecretNotice(''); setSecretNoticeError(false); }
        else if (confirmation) setConfirmation(null);
        else if (!busy) setEditor(null);
      } else if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [busy, confirmation, editor, secret]);

  const activeQueues = useMemo(() => queues.filter((queue) => !queue.isDeleted && queue.lifecycleStatus !== 'deleting' && queue.lifecycleStatus !== 'deleted'), [queues]);
  const previewText = values.sourceType === 'fixed_text'
    ? values.fixedText || t('panel.widget.preview_example')
    : values.sourceType === 'queue_name'
      ? activeQueues.find((queue) => queue.id === values.queueId)?.title ?? t('panel.widget.preview.queue')
      : t(SOURCE_SAMPLE_KEYS[values.sourceType] ?? 'panel.widget.preview_example');

  function openEditor(widget = null) {
    setValues(createWidgetFormValues(widget));
    setEditor(widget ? { id: widget.id, version: widget.version } : { id: null, version: null });
    setConflictLatest(null);
    setConflictMissing(false);
    setNotice(null);
  }

  function updateValue(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function saveWidget(event) {
    event.preventDefault();
    if (conflictMissing) return;
    if (QUEUE_WIDGET_SOURCES.has(values.sourceType) && !activeQueues.some((queue) => queue.id === values.queueId)) {
      document.querySelector('[name="queueId"]')?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    setConflictLatest(null);
    setConflictMissing(false);
    try {
      const payload = buildOverlayWidgetPayload(formData({ ...values, ...styleFromForm(values) }));
      const result = editor.id
        ? await request(`/api/overlay-widgets/${editor.id}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: editor.version, changes: payload }) })
        : await request('/api/overlay-widgets', { method: 'POST', body: JSON.stringify(payload) });
      const action = editor.id ? 'saved' : 'created';
      setEditor(null);
      if (result?.capabilityUrl) { setSecret(result.capabilityUrl); setSecretNotice(t('panel.widget.link.copied_once')); setSecretNoticeError(false); }
      const refreshed = await loadWidgets();
      setNotice(refreshed
        ? { key: `panel.widget.notice.${action}`, tone: 'success' }
        : { key: 'panel.widget.notice.refresh_failed', values: { action: t(`panel.widget.notice.action_${action}`) }, tone: 'error', referenceId: loadErrorReferenceRef.current });
    } catch (error) {
      if (error?.status === 409) setConflictMissing(false);
      setNotice({ key: error?.status === 409 ? 'panel.widget.notice.conflict' : 'panel.widget.notice.error', tone: 'error', referenceId: safeReferenceId(error) });
    } finally { setBusy(false); }
  }

  async function runAction(widget, action) {
    setBusy(true); setNotice(null);
    try {
      if (action === 'regenerate') {
        const result = await request(`/api/overlay-widgets/${widget.id}/regenerate`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) });
        setSecret(result.capabilityUrl); setSecretNotice(t('panel.widget.link.copied_once')); setSecretNoticeError(false);
      } else if (action === 'revoke') {
        await request(`/api/overlay-widgets/${widget.id}/revoke`, { method: 'POST', body: JSON.stringify({ expectedVersion: widget.version }) });
      } else {
        await request(`/api/overlay-widgets/${widget.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: widget.version }) });
      }
      setConfirmation(null);
      const refreshed = await loadWidgets();
      if (action !== 'regenerate') setNotice(refreshed
        ? { key: `panel.widget.notice.${action === 'revoke' ? 'revoked' : 'deleted'}`, tone: 'success' }
        : { key: 'panel.widget.notice.refresh_failed', values: { action: t(`panel.widget.notice.action_${action === 'revoke' ? 'revoked' : 'deleted'}`) }, tone: 'error', referenceId: loadErrorReferenceRef.current });
    } catch (error) {
      setConfirmation(null);
      setNotice({ key: error?.status === 409 ? 'panel.widget.notice.conflict' : 'panel.widget.notice.error', tone: 'error', referenceId: safeReferenceId(error) });
    } finally { setBusy(false); }
  }

  async function copySecret() {
    try { await globalThis.navigator.clipboard.writeText(secret); setSecretNotice(t('panel.widget.link.copied')); setSecretNoticeError(false); }
    catch { setSecretNotice(t('panel.widget.link.copy_fallback')); setSecretNoticeError(true); }
  }

  async function refreshConflictWidget() {
    if (!editor?.id || busy) return;
    setBusy(true);
    try {
      const result = validateWidgetProjection(await request('/api/overlay-widgets'));
      setWidgets(result);
      hasLoadedWidgets.current = true;
      setLoadStatus('ready');
      loadErrorReferenceRef.current = null;
      const latest = result.find((item) => item.id === editor.id);
      setConflictLatest(latest ?? null);
      setConflictMissing(!latest);
      setNotice({ key: latest ? 'panel.widget.notice.conflict_refreshed' : 'panel.widget.notice.conflict_missing', tone: latest ? 'success' : 'error' });
    } catch (error) {
      const referenceId = safeReferenceId(error);
      loadErrorReferenceRef.current = referenceId;
      setLoadErrorReference(referenceId);
      setNotice({ key: 'panel.widget.notice.error', tone: 'error', referenceId });
    } finally { setBusy(false); }
  }

  function replaceDraftWithLatest() {
    if (!editor?.id || !conflictLatest) return;
    setValues(createWidgetFormValues(conflictLatest));
    setEditor({ id: conflictLatest.id, version: conflictLatest.version });
    setConflictLatest(null);
    setConflictMissing(false);
    setNotice({ key: 'panel.widget.notice.conflict_replaced', tone: 'success' });
  }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{t('panel.widgets.eyebrow')}</p><h1>{t('panel.widgets.title')}</h1><p className="page-description">{t('panel.widgets.description')}</p></div>
      <button className="button button-primary" type="button" onClick={() => openEditor()}>{t('panel.widgets.create')}</button>
    </div>
    <p className="status-card widgets-obs-help">{t('panel.widget.obs_help')}</p>
    {notice && !editor && loadStatus !== 'error' ? <div className={`status-card${notice.tone === 'error' ? ' error-card' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}><p>{t(notice.key, notice.values ? { values: notice.values } : undefined)}</p>{notice.referenceId ? <small>{t('panel.widget.notice.reference', { values: { id: notice.referenceId } })}</small> : null}<button className="button button-secondary" type="button" onClick={() => void loadWidgets()}>{t('panel.widgets.refresh')}</button></div> : null}
    <section className="widgets-section" aria-labelledby="widgets-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('panel.widgets.list_eyebrow')}</p><h2 id="widgets-list-title">{t('panel.widgets.list_title')}</h2></div></div>
      {loadStatus === 'loading' ? <p className="status-card" role="status">{t('panel.widgets.loading')}</p> : null}
    {loadStatus === 'error' ? <div className="status-card error-card" role="alert"><p>{t('panel.widgets.load_failed')}</p>{loadErrorReference ? <small>{t('panel.widget.notice.reference', { values: { id: loadErrorReference } })}</small> : null}<button className="button button-secondary" type="button" onClick={() => void loadWidgets()}>{t('panel.widgets.refresh')}</button></div> : null}
      {loadStatus === 'ready' && !widgets.length ? <div className="empty-state widget-empty-state"><span className="widget-empty-icon" aria-hidden="true">◌</span><strong>{t('panel.widget.empty.title')}</strong><small>{t('panel.widget.empty.hint')}</small><button className="button button-primary" type="button" onClick={() => openEditor()}>{t('panel.widget.create_first')}</button></div> : null}
      {loadStatus === 'ready' && widgets.length ? <div className="widgets-grid">{widgets.map((widget) => {
        const queue = queues.find((item) => item.id === widget.queueId);
        const stateKey = widget.deleted ? 'unavailable' : widget.capabilityActive ? 'active' : 'revoked';
        const preview = widget.sourceType === 'fixed_text' ? widget.fixedText : widget.fallbackText || t('panel.widget.preview_example');
        return <article className="widget-card" key={widget.id}>
          <div className="widget-card-heading"><h3>{t(WIDGET_SOURCE_KEYS[widget.sourceType] ?? 'panel.widget.source.fixed_text')}</h3><span className={`status-pill${widget.capabilityActive ? ' status-connected' : ''}`}>{t(`panel.widget.status.${stateKey}`)}</span></div>
          <p className="muted">{t('panel.widget.card_details', { values: { queue: queue ? `${queue.title} · ` : '', width: widget.style.width ?? t('panel.widget.auto'), height: widget.style.height ?? t('panel.widget.auto'), id: widget.id.slice(0, 8) } })}</p>
          <p className="widget-card-preview">{preview}</p>
          <div className="widget-card-actions"><button className="button button-secondary" type="button" onClick={() => openEditor(widget)}>{t('panel.widget.action.edit')}</button>
            {widget.capabilityActive ? <><button className="button button-secondary" type="button" onClick={() => setConfirmation({ widget, action: 'regenerate' })}>{t('panel.widget.action.regenerate')}</button><button className="button button-danger" type="button" onClick={() => setConfirmation({ widget, action: 'revoke' })}>{t('panel.widget.action.revoke')}</button></> : null}
            {!widget.capabilityActive && !widget.deleted ? <button className="button button-secondary" type="button" onClick={() => void runAction(widget, 'regenerate')}>{t('panel.widget.action.generate')}</button> : null}
            <button className="button button-danger" type="button" onClick={() => setConfirmation({ widget, action: 'delete' })}>{t('panel.widget.action.delete')}</button>
          </div>
        </article>;
      })}</div> : null}
    </section>

    {editor ? <div className="widget-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}>
      <section className="widget-editor" role="dialog" aria-modal="true" aria-labelledby="widget-editor-title">
        <div className="widget-editor-heading"><div><p className="eyebrow">{t('panel.widget.preview_eyebrow')}</p><h2 id="widget-editor-title">{t(editor.id ? 'panel.widget.editor.edit' : 'panel.widget.editor.create')}</h2></div><button className="icon-button" type="button" aria-label={t('panel.widget.close')} disabled={busy} onClick={() => setEditor(null)}>×</button></div>
        <div className="widget-editor-body"><form className="widget-editor-form" onSubmit={saveWidget}>
          <label><span>{t('panel.widget.source_label')}</span><select name="sourceType" value={values.sourceType} onChange={updateValue} aria-describedby="widget-source-help">{Object.entries(WIDGET_SOURCE_KEYS).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
          <small id="widget-source-help">{t('panel.widget.source.help')}</small>
          {QUEUE_WIDGET_SOURCES.has(values.sourceType) ? <>
            <label><span>{t('panel.widget.queue_label')}</span><select name="queueId" value={values.queueId} onChange={updateValue} required disabled={!activeQueues.length} aria-describedby="widget-queue-help"><option value="">{t('panel.widget.queue.select')}</option>{activeQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.title}</option>)}</select></label>
            <small id="widget-queue-help">{t('panel.widget.queue.help')}</small>
            {!activeQueues.length ? <p className="muted widget-queue-empty" role="status"><span>{t('panel.widget.queue.empty')}</span> <a href="/queues/" target="_blank" rel="noreferrer">{t('panel.widget.queue.create')}</a><small>{t('panel.widget.queue.create_hint')}</small></p> : null}
          </> : null}
          {values.sourceType === 'fixed_text' ? <label><span>{t('panel.widget.fixed_text_label')}</span><textarea name="fixedText" aria-label={t('panel.widget.fixed_text_label')} maxLength={960} value={values.fixedText} onChange={updateValue} aria-describedby="widget-fixed-count"/><small id="widget-fixed-count">{countOverlayTextCodePoints(values.fixedText)}/240</small></label> : null}
          <label><span>{t('panel.widget.fallback_label')}</span><input name="fallbackText" aria-label={t('panel.widget.fallback_label')} maxLength={960} value={values.fallbackText} onChange={updateValue} aria-describedby="widget-fallback-count"/><small id="widget-fallback-count">{countOverlayTextCodePoints(values.fallbackText)}/240</small></label>
          <fieldset><legend>{t('panel.widget.appearance')}</legend><div className="widget-style-grid">{WIDGET_STYLE_FIELDS.map((field) => <label key={field}>{t(STYLE_LABELS[field])}{renderStyleInput(field, values[field], updateValue)}</label>)}</div></fieldset>
          {notice ? <div className={`status-card${notice.tone === 'error' ? ' error-card' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}><p>{t(notice.key, notice.values ? { values: notice.values } : undefined)}</p>{notice.referenceId ? <small>{t('panel.widget.notice.reference', { values: { id: notice.referenceId } })}</small> : null}{notice.key === 'panel.widget.notice.conflict' && editor.id ? <><p>{t('panel.widget.conflict.refresh_hint')}</p><button className="button button-secondary" type="button" disabled={busy} onClick={() => void refreshConflictWidget()}>{t('panel.widget.conflict.refresh')}</button></> : null}{conflictLatest ? <div className="widget-conflict-latest"><h3>{t('panel.widget.conflict.latest_title')}</h3><p>{t(WIDGET_SOURCE_KEYS[conflictLatest.sourceType] ?? 'panel.widget.source.fixed_text')}</p><p>{conflictLatest.sourceType === 'fixed_text' ? conflictLatest.fixedText : conflictLatest.fallbackText || t('panel.widget.preview_example')}</p><p>{conflictLatest.fallbackText}</p><button className="button button-secondary" type="button" disabled={busy} onClick={replaceDraftWithLatest}>{t('panel.widget.conflict.replace_draft')}</button></div> : null}</div> : null}
          <div className="widget-editor-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditor(null)}>{t(conflictMissing ? 'panel.widget.close_without_saving' : 'panel.widget.cancel')}</button><button className="button button-primary" type="submit" disabled={busy || conflictMissing || (QUEUE_WIDGET_SOURCES.has(values.sourceType) && !activeQueues.length)}>{t(busy ? 'panel.widget.saving' : 'panel.widget.save')}</button></div>
        </form><div className="widget-preview-box"><p className="eyebrow">{t('panel.widget.preview_eyebrow')}</p><div className="widget-live-preview" style={previewStyle(values)}>{previewText}</div></div></div>
      </section>
    </div> : null}

    {secret ? <div className="widget-editor-backdrop widget-secret-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSecret(''); setSecretNotice(''); setSecretNoticeError(false); } }}><section className="widget-secret-dialog" role="dialog" aria-modal="true" aria-labelledby="widget-secret-title"><p className="eyebrow">{t('panel.widget.link_eyebrow')}</p><h2 id="widget-secret-title">{t('panel.widget.link.title')}</h2><p role={secretNoticeError ? 'alert' : 'status'}>{secretNotice}</p><label>{t('panel.widget.local_widget_url')}<input readOnly value={secret} onFocus={(event) => event.target.select()} /></label><p className="muted">{t('panel.widget.link.close_loses')}</p><div className="widget-editor-actions"><button className="button button-secondary" type="button" onClick={() => { setSecret(''); setSecretNotice(''); setSecretNoticeError(false); }}>{t('panel.widget.close')}</button><button className="button button-primary" type="button" onClick={() => void copySecret()}>{t('panel.widget.copy_link')}</button></div></section></div> : null}

    {confirmation ? <div className="widget-editor-backdrop widget-secret-backdrop"><section className="widget-secret-dialog" role="alertdialog" aria-modal="true" aria-labelledby="widget-confirm-title"><p className="eyebrow">{t('panel.dialog.confirm_action')}</p><h2 id="widget-confirm-title">{t(`panel.widget.confirm.${confirmation.action}`)}</h2><div className="widget-editor-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirmation(null)}>{t('panel.dialog.cancel')}</button><button className="button button-danger" type="button" disabled={busy} onClick={() => void runAction(confirmation.widget, confirmation.action)}>{t('panel.dialog.confirm')}</button></div></section></div> : null}
  </>;
}

function renderStyleInput(field, value, onChange) {
  const common = { name: field, value, onChange };
  if (['textColor', 'backgroundColor'].includes(field)) return <input {...common} type="color" />;
  if (['fontFamily', 'fontWeight', 'alignment', 'effect', 'overflow'].includes(field)) {
    const choices = {
      fontFamily: ['system-ui', 'Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Courier New, monospace'],
      fontWeight: ['300', '400', '500', '600', '700', '800', '900'], alignment: ['left', 'center', 'right'],
      effect: ['none', 'outline', 'shadow'], overflow: ['wrap', 'clip', 'ellipsis'],
    }[field];
    return <select {...common}>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>;
  }
  if (['width', 'height'].includes(field)) return <input {...common} type="text" inputMode="numeric" />;
  const limits = { backgroundOpacity: [0, 100], fontSize: [8, 128], fontWeight: [300, 900], outlineWidth: [1, 8], shadowBlur: [0, 32], shadowOffsetX: [-32, 32], shadowOffsetY: [-32, 32], marginTop: [0, 256], marginRight: [0, 256], marginBottom: [0, 256], marginLeft: [0, 256] };
  const [min, max] = limits[field] ?? [1, 3840];
  return <input {...common} type="number" min={min} max={max} step="1" />;
}

export default function WidgetsPageContent() {
  const { t, queueProjection } = usePanel();
  return <WidgetsPageView t={t} queues={queueProjection} />;
}
