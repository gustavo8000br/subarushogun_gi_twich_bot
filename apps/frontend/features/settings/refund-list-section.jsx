'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// OPS-31 P5 (FT-74, AC 10; UX plan 2.6 and 7.5): the own refund list of the channel. The panel shows the label and the date
// added, never the Twitch account number; the typed login is resolved once by the API when adding.

const LOGIN_PATTERN = /^[a-zA-Z0-9_]{1,25}$/;
const LABEL_MAX = 40;

/** Maps an API failure to the catalog key of its text (closed list; nothing from the server body is shown). */
export function refundListErrorKey(error) {
  switch (error?.code) {
    case 'REFUND_LIST_DUPLICATE': return 'panel.refund_list.error.duplicate';
    case 'REFUND_LIST_FULL': return 'panel.refund_list.error.limit';
    case 'TWITCH_USER_NOT_FOUND': return 'panel.entry.error.twitch_user_not_found';
    case 'REFUND_LIST_INVALID': return 'panel.refund_list.error.invalid';
    default: return 'panel.error.generic';
  }
}

/** Plural form of the clear confirmation: native ECMA-402 rules, same mechanism as `panel.operation.attempts`. */
export function refundListClearConfirmKey(count, locale) {
  let category;
  try { category = new Intl.PluralRules(locale).select(count); } catch { category = 'other'; }
  return `panel.refund_list.clear_confirm.${category}`;
}

function formatDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date); } catch { return date.toISOString().slice(0, 10); }
}

/**
 * @param {{t:(key:string, options?:object)=>string, request:(path:string, options?:object)=>Promise<any>, locale?:string}} props
 */
export function RefundListSection({ t, request, locale }) {
  const [list, setList] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [login, setLogin] = useState('');
  const [label, setLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const heading = useRef(null);
  const dialog = useRef(null);
  const rows = useRef(new Map());
  const pendingFocus = useRef(null);
  // The form error is tied to the login field (`aria-invalid` + `aria-describedby`) only while that error is the visible notice.
  const invalidLogin = notice?.tone === 'error' && notice.key === 'panel.refund_list.error.invalid';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await request('/api/refund-list');
        if (!active) return;
        if (Array.isArray(result?.items)) setList({ items: result.items, count: result.count ?? result.items.length, max: result.max ?? 500 });
        else setLoadFailed(true);
      } catch { if (active) setLoadFailed(true); }
    })();
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    if (confirming && dialog.current && !dialog.current.open) dialog.current.showModal?.();
    if (!confirming && dialog.current?.open) dialog.current.close();
  }, [confirming]);

  useEffect(() => {
    if (pendingFocus.current === 'heading') heading.current?.focus();
    else if (pendingFocus.current) rows.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [list]);

  const onLogin = (value) => {
    setLogin(value);
    // The label follows the typed login until the streamer edits it (UX 2.6), so the list stays readable.
    if (!labelTouched) setLabel(value.replace(/^@/, '').slice(0, LABEL_MAX));
    setNotice(null);
  };

  const add = useCallback(async (event) => {
    event.preventDefault();
    if (busy) return;
    const typed = login.trim().replace(/^@/, '');
    if (!LOGIN_PATTERN.test(typed)) { setNotice({ tone: 'error', key: 'panel.refund_list.error.invalid' }); return; }
    setBusy(true);
    setNotice(null);
    try {
      const body = { login: typed, ...(label.trim() ? { label: label.trim() } : {}) };
      const result = await request('/api/refund-list', { method: 'POST', body: JSON.stringify(body) });
      setList((current) => ({ items: [...(current?.items ?? []), result.member], count: result.count, max: result.max ?? current?.max ?? 500 }));
      setLogin(''); setLabel(''); setLabelTouched(false);
    } catch (error) {
      const key = refundListErrorKey(error);
      setNotice({ tone: 'error', key, values: key === 'panel.entry.error.twitch_user_not_found' ? { user: typed } : key === 'panel.refund_list.error.limit' ? { max: list?.max ?? 500 } : undefined });
    } finally { setBusy(false); }
  }, [busy, label, list, login, request]);

  const remove = useCallback(async (item) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const name = item.label || t('panel.refund_list.unnamed');
    try {
      const result = await request(`/api/refund-list/${item.id}/remove`, { method: 'POST' });
      const index = list.items.findIndex((candidate) => candidate.id === item.id);
      const remaining = list.items.filter((candidate) => candidate.id !== item.id);
      const next = remaining[index] ?? remaining[index - 1] ?? null;
      pendingFocus.current = next ? next.id : 'heading';
      setList({ items: remaining, count: result?.count ?? remaining.length, max: result?.max ?? list.max });
      setNotice({ tone: 'success', key: 'panel.refund_list.removed', values: { label: name } });
    } catch (error) {
      if (error?.code === 'REFUND_LIST_MEMBER_NOT_FOUND') {
        // Already gone (another tab): show the truth without an error.
        setList((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id), count: Math.max(0, current.count - 1) }));
      } else setNotice({ tone: 'error', key: 'panel.error.generic' });
    } finally { setBusy(false); }
  }, [busy, list, request, t]);

  const clearAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await request('/api/refund-list/clear', { method: 'POST' });
      pendingFocus.current = 'heading';
      setList((current) => ({ ...current, items: [], count: 0 }));
      setNotice({ tone: 'success', key: 'panel.refund_list.clear_done' });
    } catch { setNotice({ tone: 'error', key: 'panel.error.generic' }); }
    finally { setBusy(false); setConfirming(false); }
  }, [busy, request]);

  return (
    <section className="panel account-settings-card refund-list" aria-labelledby="refund-list-title">
      <div className="section-heading">
        <div><h2 id="refund-list-title" ref={heading} tabIndex={-1}>{t('panel.refund_list.title')}</h2></div>
      </div>
      <p className="form-hint" id="refund-list-description">{t('panel.refund_list.description')}</p>
      {loadFailed ? <p className="account-settings-notice is-error" role="alert">{t('panel.error.generic')}</p> : null}
      {list ? <>
        <form className="account-settings-form refund-list-form" onSubmit={(event) => void add(event)} aria-describedby="refund-list-description">
          <label htmlFor="refund-list-login">{t('panel.entry.twitch_login')}
            <input id="refund-list-login" name="login" value={login} maxLength={26} autoComplete="off" autoCapitalize="none" spellCheck={false}
              aria-invalid={invalidLogin ? 'true' : undefined} aria-describedby={invalidLogin ? 'refund-list-notice' : undefined}
              placeholder={t('panel.entry.login_placeholder')} disabled={busy} onChange={(event) => onLogin(event.target.value)} />
          </label>
          <label htmlFor="refund-list-label">{t('panel.refund_list.label')}
            <input id="refund-list-label" name="label" value={label} maxLength={LABEL_MAX} autoComplete="off" disabled={busy}
              onChange={(event) => { setLabel(event.target.value); setLabelTouched(true); }} />
          </label>
          <div className="account-settings-actions">
            <button type="submit" className="button button-primary" disabled={busy || !login.trim() || list.count >= list.max}>{t('panel.refund_list.add')}</button>
          </div>
        </form>
        <p className="form-hint refund-list-count">{t('panel.refund_list.count', { values: { count: list.count, max: list.max } })}</p>
        {notice ? <p id="refund-list-notice" className={`account-settings-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{t(notice.key, notice.values ? { values: notice.values } : undefined)}</p> : null}
        {list.items.length === 0
          ? <p className="form-hint refund-list-empty">{t('panel.refund_list.empty')}</p>
          : <ul className="refund-list-items">
            {list.items.map((item) => {
              const name = item.label || t('panel.refund_list.unnamed');
              return <li key={item.id}>
                <span className="refund-list-name">{name}</span>
                <span className="form-hint">{t('panel.refund_list.added_on', { values: { date: formatDate(item.createdAt, locale) } })}</span>
                <button type="button" className="button button-secondary" disabled={busy} ref={(node) => { if (node) rows.current.set(item.id, node); else rows.current.delete(item.id); }}
                  aria-label={t('panel.refund_list.remove_aria', { values: { label: name } })} onClick={() => void remove(item)}>{t('panel.refund_list.remove')}</button>
              </li>;
            })}
          </ul>}
        <div className="account-settings-actions">
          <button type="button" className="button button-secondary" disabled={busy || list.count === 0} onClick={() => setConfirming(true)}>{t('panel.refund_list.clear')}</button>
        </div>
        <dialog ref={dialog} className="operation-confirmation" aria-modal="true" aria-labelledby="refund-list-clear-title" aria-describedby="refund-list-clear-description" onClose={() => setConfirming(false)}>
          <h2 id="refund-list-clear-title">{t('panel.refund_list.clear')}</h2>
          <p id="refund-list-clear-description">{t(refundListClearConfirmKey(list.count, locale), { values: { count: new Intl.NumberFormat(locale).format(list.count) } })}</p>
          <div className="operation-confirmation-actions">
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirming(false)}>{t('panel.queue.dialog.back')}</button>
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void clearAll()}>{t('panel.refund_list.clear')}</button>
          </div>
        </dialog>
      </> : null}
    </section>
  );
}

export default RefundListSection;
