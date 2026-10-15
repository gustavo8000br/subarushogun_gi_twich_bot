'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { usePanel } from '../panel-shell/panel-provider.jsx';
import { twitchEligibilityMessage, twitchStatusLabel, twitchStatusState } from '../../../web/setup-messages.mjs';

const OAUTH_ORIGIN = 'https://id.twitch.tv';
const OAUTH_PATH = '/oauth2/authorize';

/** @param {{setup: object, locale: string, t: (key: string, options?: object) => string, request: (path: string, options?: object) => Promise<any>, onNavigate?: (url: string) => void}} props */
export function ConnectionPageView({ setup = {}, locale = 'pt-BR', t, request, onNavigate = (url) => window.location.assign(url) }) {
  const [clientId, setClientId] = useState(setup.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [localSetup, setLocalSetup] = useState(setup);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [notice, setNotice] = useState(null);

  const currentSetup = localSetup ?? {};
  const status = twitchStatusState(currentSetup);
  const healthRows = [
    ['panel.health.chat', 'panel.health.twitch_chat', currentSetup.chatStatus ?? 'unknown'],
    ['panel.health.rewards', 'panel.health.twitch_rewards', currentSetup.rewardStatus ?? 'unknown'],
  ];

  const submitCredentials = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice({ key: 'panel.credentials.validating', tone: 'pending' });
    try {
      const accepted = await request('/api/setup/application', {
        method: 'POST',
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setClientSecret('');
      setLocalSetup({ ...currentSetup, clientId: accepted?.clientId ?? clientId, secretConfigured: true });
      try {
        const refreshed = await request('/api/setup');
        setLocalSetup(refreshed);
        setClientId(refreshed.clientId ?? clientId);
        setNotice({ key: 'panel.credentials.saved', tone: 'success' });
      } catch {
        setNotice({ key: 'panel.connection.saved_refresh_failed', tone: 'warning' });
      }
    } catch (error) {
      setNotice({
        key: error?.status === 400 ? 'panel.error.twitch_credentials' : 'panel.error.generic',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const beginAuthorization = async () => {
    if (connecting || !currentSetup.secretConfigured) return;
    setConnecting(true);
    setNotice({ key: 'panel.connection.starting', tone: 'pending' });
    try {
      const result = await request('/api/setup/connect', { method: 'POST', body: '{}' });
      const authorization = new URL(result?.authorizationUrl);
      if (authorization.origin !== OAUTH_ORIGIN || authorization.pathname !== OAUTH_PATH) throw new Error('Invalid authorization destination.');
      onNavigate(authorization.href);
    } catch {
      setConnecting(false);
      setNotice({ key: 'panel.error.generic', tone: 'error' });
    }
  };

  const reconcile = async () => {
    if (reconciling) return;
    setReconciling(true);
    setNotice({ key: 'panel.reconciliation.running', tone: 'pending' });
    try {
      const result = await request('/api/reconciliation', { method: 'POST', body: '{}' });
      if (result?.status === 'complete') {
        setNotice({ key: 'panel.reconciliation.complete', count: result.imported ?? 0, tone: 'success' });
      } else {
        setNotice({ key: 'panel.reconciliation.issues', count: result?.issues?.length ?? 0, tone: 'warning' });
      }
    } catch {
      setNotice({ key: 'panel.operations.reconcile_failed', tone: 'error' });
    } finally {
      setReconciling(false);
    }
  };

  const noticeText = notice?.count !== undefined
    ? t(`${notice.key}.${new Intl.PluralRules(locale).select(notice.count)}`, { values: { count: notice.count } })
    : notice ? t(notice.key) : '';

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">{t('panel.connection.eyebrow')}</p><h1>{t('panel.connection.title')}</h1><p className="page-description">{t('panel.connection.description')}</p></div>
      </div>

      <section className="connection-health" aria-labelledby="connection-status-title">
        <div className="connection-health-heading">
          <div><p className="eyebrow">{t('panel.connection.authorized_eyebrow')}</p><h2 id="connection-status-title">{currentSetup.connected ? t('panel.connection.connected_fallback') : t('panel.connection.channel_not_connected')}</h2></div>
          <span className={`connection-state is-${status}`}>{twitchStatusLabel(currentSetup, locale)}</span>
        </div>
        <p className="connection-health-copy">{twitchEligibilityMessage(currentSetup, locale)}</p>
        <div className="connection-health-grid">
          {healthRows.map(([prefix, label, value]) => (
            <div className="connection-health-item" key={prefix}>
              <span>{t(label)}</span><strong>{t(`${prefix}.${value}`)}</strong>
            </div>
          ))}
        </div>
        {currentSetup.connected ? <div className="connection-actions">
          <button className="button button-secondary" type="button" disabled={!currentSetup.secretConfigured || connecting} onClick={beginAuthorization}>{t('panel.connection.reconnect')}</button>
          <button className="button button-primary" type="button" disabled={reconciling} onClick={reconcile}>{reconciling ? t('panel.reconciliation.running') : t('panel.connection.reconcile')}</button>
        </div> : null}
      </section>

      <section className="connection-setup-grid" aria-label={t('panel.connection.setup_eyebrow')}>
        <article className="panel credentials-panel">
          <p className="eyebrow">{t('panel.credentials.eyebrow')}</p><h2>{t('panel.credentials.title')}</h2>
          <form className="connection-credentials-form" onSubmit={submitCredentials}>
            <label>{t('panel.credentials.client_id')}<input autoComplete="off" required maxLength={128} value={clientId} placeholder={t('panel.credentials.client_id_placeholder')} onChange={(event) => setClientId(event.target.value)} /></label>
            <label>{t('panel.credentials.client_secret')}<input type="password" autoComplete="new-password" required maxLength={256} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} /></label>
            <p className="form-hint">{t(currentSetup.secretConfigured ? 'panel.credentials.secret_configured' : 'panel.credentials.secret_empty')}</p>
            <button className="button button-secondary" type="submit" disabled={saving || !clientId.trim() || !clientSecret}>{saving ? t('panel.credentials.validating') : t('panel.credentials.validate_save')}</button>
          </form>
        </article>

        {!currentSetup.connected ? <article className="panel connection-wizard">
          <p className="eyebrow">{t('panel.connection.setup_eyebrow')}</p><h2>{t('panel.connection.connect_channel')}</h2>
          <p>{t('panel.connection.confidential_app_help')}</p>
          <code className="connection-callback-url">{currentSetup.callbackUrl ?? ''}</code>
          <a className="connection-console-link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">{t('panel.connection.open_console')}</a>
          <button className="button button-primary" type="button" disabled={!currentSetup.secretConfigured || connecting} onClick={beginAuthorization}>{connecting ? t('panel.connection.starting') : currentSetup.connected ? t('panel.connection.reconnect') : t('panel.connection.connect')}</button>
          {!currentSetup.secretConfigured ? <p className="form-hint">{t('panel.connection.credentials_required')}</p> : null}
        </article> : null}
      </section>

      {notice ? <p className={`connection-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{noticeText}</p> : null}
    </>
  );
}

export default function ConnectionPageContent() {
  const { status, setupState, localeState, t } = usePanel();
  if (status !== 'ready') return null;
  return <ConnectionPageView setup={setupState ?? {}} locale={localeState.locale} t={t} request={apiClient.request} />;
}
