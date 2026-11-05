'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { usePanel } from '../panel-shell/panel-provider.jsx';

function AccountLabelForm({ field, sectionTitle, label, value, help, dirty, saving, busy, notice, t, onChange, onCancel, onSubmit }) {
  return (
    <section className="panel account-settings-card" aria-labelledby={`${field}-title`}>
      <div className="section-heading">
        <div><p className="eyebrow">{field === 'current' ? t('panel.settings.account_eyebrow') : t('panel.settings.default_eyebrow')}</p><h2 id={`${field}-title`}>{sectionTitle}</h2></div>
      </div>
      <form className="account-settings-form" onSubmit={onSubmit}>
        <label htmlFor={`${field}-account-label`}>{label}
          <input id={`${field}-account-label`} name="label" value={value} maxLength={60} autoComplete="off" required disabled={busy} onChange={(event) => onChange(event.target.value)} />
        </label>
        <p className="form-hint">{help}</p>
        <div className="account-settings-actions">
          <p className="form-hint" role="status">{dirty ? t('panel.settings.unsaved') : t('panel.settings.no_changes')}</p>
          <button type="button" className="button button-secondary" disabled={!dirty || busy} onClick={onCancel}>{t('panel.form.cancel')}</button>
          <button type="submit" className="button button-primary" disabled={!dirty || busy}>{saving ? t('panel.settings.saving') : t('panel.settings.save')}</button>
        </div>
        {notice ? <p className={`account-settings-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{t(notice.key)}</p> : null}
      </form>
    </section>
  );
}

/** @param {{account:Record<string,any>, t:(key:string)=>string, request:(path:string, options?:object)=>Promise<any>, refresh:()=>Promise<boolean>}} props */
export function AccountSettingsPageView({ account = {}, t, request, refresh }) {
  const initial = {
    current: typeof account.label === 'string' ? account.label : t('panel.settings.account_fallback'),
    default: typeof account.defaultLabel === 'string' ? account.defaultLabel : t('panel.settings.account_fallback'),
  };
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [savingField, setSavingField] = useState(null);
  const [notices, setNotices] = useState({});
  const tField = (field) => field === 'current' ? 'panel.settings.current_label' : 'panel.settings.default_account';
  const tSection = (field) => field === 'current' ? 'panel.settings.current_section_title' : 'panel.settings.default_section_title';
  const isDirty = (field) => draft[field].trim() !== saved[field];

  const save = async (field, event) => {
    event.preventDefault();
    if (savingField || !isDirty(field)) return;
    const label = draft[field].trim();
    if (!label || label.length > 60) {
      setNotices((current) => ({ ...current, [field]: { tone: 'error', key: 'panel.settings.invalid' } }));
      return;
    }
    setSavingField(field);
    setNotices((current) => ({ ...current, [field]: null }));
    try {
      const result = await request(field === 'current' ? '/api/account' : '/api/account/default', {
        method: 'POST', body: JSON.stringify({ label }),
      });
      const accepted = {
        current: typeof result?.label === 'string' ? result.label : field === 'current' ? label : saved.current,
        default: typeof result?.defaultLabel === 'string' ? result.defaultLabel : field === 'default' ? label : saved.default,
      };
      setSaved(accepted);
      setDraft((current) => ({
        current: field === 'current' || current.current === saved.current ? accepted.current : current.current,
        default: field === 'default' || current.default === saved.default ? accepted.default : current.default,
      }));
      const refreshed = await refresh();
      setNotices((current) => ({
        ...current,
        [field]: { tone: refreshed ? 'success' : 'warning', key: refreshed ? 'panel.settings.saved' : 'panel.settings.saved_refresh_failed' },
      }));
    } catch (error) {
      setNotices((current) => ({
        ...current,
        [field]: { tone: 'error', key: error?.status === 400 ? 'panel.settings.invalid' : 'panel.error.generic' },
      }));
    } finally {
      setSavingField(null);
    }
  };

  const update = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotices((current) => ({ ...current, [field]: null }));
  };
  const cancel = (field) => {
    setDraft((current) => ({ ...current, [field]: saved[field] }));
    setNotices((current) => ({ ...current, [field]: null }));
  };

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{t('panel.settings.eyebrow')}</p><h1>{t('panel.settings.title')}</h1><p className="page-description">{t('panel.settings.description')}</p></div>
    </div>
    <div className="account-settings-grid">
      <AccountLabelForm field="current" sectionTitle={t(tSection('current'))} label={t(tField('current'))} value={draft.current}
        help={t('panel.settings.account_help')} dirty={isDirty('current')} saving={savingField === 'current'} busy={savingField !== null}
        notice={notices.current} t={t} onChange={(value) => update('current', value)}
        onCancel={() => cancel('current')} onSubmit={(event) => void save('current', event)} />
      <AccountLabelForm field="default" sectionTitle={t(tSection('default'))} label={t(tField('default'))} value={draft.default}
        help={t('panel.settings.default_help')} dirty={isDirty('default')} saving={savingField === 'default'} busy={savingField !== null}
        notice={notices.default} t={t} onChange={(value) => update('default', value)}
        onCancel={() => cancel('default')} onSubmit={(event) => void save('default', event)} />
    </div>
  </>;
}

export default function AccountSettingsPageContent() {
  const { status, runtimeState, refreshOverview, t } = usePanel();
  if (status !== 'ready') return null;
  return <AccountSettingsPageView account={runtimeState?.account ?? {}} t={t} request={apiClient.request} refresh={refreshOverview} />;
}
