'use client';

import { useEffect, useRef, useState } from 'react';

const MASK = '••••••••••••';

// One-time OBS capability link. The URL lives only in React state: it is never rendered while
// masked, never placed in a live region/attribute, never logged or persisted.
// Close requests are layered (closedby="none", Escape keydown, cancel preventDefault, reopen on an
// unexpected close) because `cancel` is not cancelable without user activation (WHATWG close watchers).
export function WidgetLinkDialog({ t, url, onClosed }) {
  const dialogRef = useRef(null);
  const copyRef = useRef(null);
  const backRef = useRef(null);
  const closingByCode = useRef(false);
  const [view, setView] = useState('link');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyState, setCopyState] = useState('idle');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    copyRef.current?.focus();
    return () => {
      closingByCode.current = true;
      if (dialogRef.current?.open) dialogRef.current.close();
    };
  }, []);

  useEffect(() => {
    (view === 'confirm-close' ? backRef : copyRef).current?.focus();
  }, [view]);

  useEffect(() => {
    if (copied) return undefined;
    const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
    globalThis.addEventListener('beforeunload', guard);
    return () => globalThis.removeEventListener('beforeunload', guard);
  }, [copied]);

  function finish(wasCopied) {
    closingByCode.current = true;
    if (dialogRef.current?.open) dialogRef.current.close();
    onClosed({ copied: wasCopied });
  }

  function requestClose() {
    if (copied) finish(true);
    else setView('confirm-close');
  }

  function copy() {
    const clipboard = globalThis.navigator?.clipboard;
    const fail = () => { setCopyState('failed'); };
    if (typeof clipboard?.writeText !== 'function') { fail(); return; }
    // Called synchronously inside the click handler to keep transient user activation.
    let pending;
    try { pending = clipboard.writeText(url); } catch { fail(); return; }
    Promise.resolve(pending).then(() => { setCopied(true); setCopyState('copied'); }, fail);
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  }

  function onCancel(event) {
    event.preventDefault();
    requestClose();
  }

  function onClose() {
    if (closingByCode.current) return;
    if (copied) { finish(true); return; }
    // The browser closed us (non-cancelable close request): reopen and ask explicitly.
    dialogRef.current?.showModal?.();
    backRef.current?.focus();
    setView('confirm-close');
  }

  const confirming = view === 'confirm-close';
  return <dialog ref={dialogRef} className="operation-confirmation widget-link-dialog" closedby="none" aria-modal="true"
    aria-labelledby={confirming ? 'widget-link-confirm-title' : 'widget-link-title'}
    aria-describedby={confirming ? 'widget-link-confirm-body' : 'widget-link-help'}
    onKeyDown={onKeyDown} onCancel={onCancel} onClose={onClose}>
    {confirming ? <>
      <h2 id="widget-link-confirm-title">{t('panel.widget.link.confirm_close.title')}</h2>
      <p id="widget-link-confirm-body">{t('panel.widget.link.confirm_close.body')}</p>
      <div className="widget-link-actions">
        <button ref={backRef} className="button button-secondary" type="button" onClick={() => setView('link')}>{t('panel.widget.link.confirm_close.back')}</button>
        <button className="button button-danger" type="button" onClick={() => finish(false)}>{t('panel.widget.link.confirm_close.confirm')}</button>
      </div>
    </> : <>
      <p className="eyebrow">{t('panel.widget.link_eyebrow')}</p>
      <h2 id="widget-link-title">{t('panel.widget.link.title')}</h2>
      <p id="widget-link-help">{t('panel.widget.link_lifetime_help')}</p>
      <div className="widget-link-field">
        <span id="widget-link-label" className="widget-link-label">{t('panel.widget.local_widget_url')}</span>
        <div className="widget-link-row">
          {revealed
            ? <input className="widget-link-value" type="text" readOnly value={url} aria-labelledby="widget-link-label" autoComplete="off" spellCheck={false} dir="ltr" />
            : <span className="widget-link-value widget-link-masked"><span aria-hidden="true">{MASK}</span><span className="widget-link-visually-hidden">{t('panel.widget.link.hidden_label')}</span></span>}
          <button className="button button-secondary" type="button" onClick={() => setRevealed((value) => !value)}>{t(revealed ? 'panel.widget.link.hide' : 'panel.widget.link.show')}</button>
        </div>
      </div>
      <p className="widget-link-feedback" role="status">{copyState === 'copied' ? t('panel.widget.link.copied') : ''}</p>
      <p className="widget-link-feedback widget-link-error" role="alert">{copyState === 'failed' ? t('panel.widget.link.copy_fallback') : ''}</p>
      <div className="widget-link-actions">
        <button ref={copyRef} className="button button-primary" type="button" onClick={copy}>{t('panel.widget.copy_link')}</button>
        <button className="button button-secondary" type="button" onClick={() => (copied ? finish(true) : setView('confirm-close'))}>{t('panel.widget.link.done')}</button>
      </div>
    </>}
  </dialog>;
}
