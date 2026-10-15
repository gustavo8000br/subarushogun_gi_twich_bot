'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { usePanel } from '../panel-shell/panel-provider.jsx';
import { followerAuthorizationRequest, groupCommandPolicies, mergeCommandPolicyState, projectCommandCatalog } from '../../../web/command-catalog-view.mjs';

const ROLE_KEYS = Object.freeze({ everyone: 'panel.command.role.everyone', follower: 'panel.command.role.follower', subscriber: 'panel.command.role.subscriber', vip: 'panel.command.role.vip', moderator: 'panel.command.role.moderator', streamer: 'panel.command.role.streamer' });
const GROUP_KEYS = Object.freeze({ configurable: 'panel.commands.group.configurable', moderator: 'panel.commands.group.moderator', streamer: 'panel.commands.group.streamer', fixed: 'panel.commands.group.fixed' });
const OAUTH_ORIGIN = 'https://id.twitch.tv';

function commandCopy(t, command, type) {
  const key = command.key.replaceAll(':', '_');
  return t(`panel.command.${type}.${key}`);
}

function allowedRoleSummary(t, roles) {
  if (roles.length === 1 || roles[0] === 'everyone') return t(ROLE_KEYS[roles[0]] ?? ROLE_KEYS.everyone);
  const labels = roles.map((role) => t(ROLE_KEYS[role] ?? ROLE_KEYS.everyone));
  if (labels.length < 2) return labels[0] ?? '';
  return labels.slice(0, -1).join(` ${t('panel.command.role_join')} `) + ` ${t('panel.command.role_join')} ${labels.at(-1)}`;
}

function CommandCard({ command, t, draft, disabled, onChange }) {
  const syntax = commandCopy(t, command, 'syntax');
  const headingId = `command-${command.key.replaceAll(':', '-')}`;
  const locked = command.access?.kind !== 'configurable';
  const roles = locked ? command.inheritedRoles : command.minimumRoles;
  return <article className={`command-policy-card${locked ? ' is-fixed-access' : ''}`} aria-labelledby={headingId}>
    <div className="command-policy-description">
      <h3 id={headingId}>{commandCopy(t, command, 'description')}</h3>
      <code className="command-policy-syntax">{syntax}</code>
    </div>
    <div className="command-policy-controls">
      {locked ? <p className="command-fixed-access"><span>{t('panel.command.access_fixed')}</span><strong>{allowedRoleSummary(t, roles)}</strong></p> : <>
        <label htmlFor={`threshold-${command.key.replaceAll(':', '-')}`}>{t('panel.command.threshold_label')} · {syntax}
          <select id={`threshold-${command.key.replaceAll(':', '-')}`} value={draft[command.key] ?? command.minimumRole}
            disabled={disabled} onChange={(event) => onChange(command.key, event.target.value)}>
            {command.minimumRoles.map((role) => <option value={role} key={role}>{t(ROLE_KEYS[role] ?? ROLE_KEYS.everyone)}</option>)}
          </select>
        </label>
      </>}
    </div>
  </article>;
}

/** @param {{t:(key:string, options?:object)=>string, request:(path:string, options?:object)=>Promise<any>, onNavigate:(url:string)=>void}} props */
export function CommandPermissionsPageView({ t, request, onNavigate = (url) => window.location.assign(url) }) {
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [conflicted, setConflicted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const result = await request('/api/command-catalog');
      if (!result || !Number.isInteger(result.version) || !Array.isArray(result.commands)) throw new Error('Invalid catalog');
      setCatalog(result);
      setDraft({});
      setConflicted(false);
    } catch {
      setNotice({ key: 'panel.commands.unavailable', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const commands = projectCommandCatalog(catalog);
  const groups = groupCommandPolicies(commands);
  const changedPolicies = Object.fromEntries(commands
    .filter((command) => command.access?.kind === 'configurable' && draft[command.key] && draft[command.key] !== command.minimumRole)
    .map((command) => [command.key, { minimumRole: draft[command.key] }]));
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    if (!catalog || saving || !dirty) {
      if (!dirty) setNotice({ key: 'panel.command.no_changes', tone: 'info' });
      return;
    }
    if (!Object.keys(changedPolicies).length) {
      setDraft({});
      setNotice({ key: 'panel.command.no_changes', tone: 'info' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (!catalog.followerScopeReady && Object.values(changedPolicies).some(({ minimumRole }) => minimumRole === 'follower')) {
        const payload = { expectedVersion: catalog.version, policies: changedPolicies };
        const result = await request('/api/command-policies/follower-authorization', { method: 'POST', body: JSON.stringify(payload) });
        const authorization = new URL(result?.authorizationUrl);
        if (authorization.origin !== OAUTH_ORIGIN || authorization.pathname !== '/oauth2/authorize') throw new Error('Invalid OAuth destination');
        onNavigate(authorization.href);
        return;
      }
      const result = await request('/api/command-policies', {
        method: 'PATCH', body: JSON.stringify({ expectedVersion: catalog.version, policies: changedPolicies }),
      });
      setCatalog((current) => mergeCommandPolicyState(current, result));
      setDraft({});
      setNotice({ key: 'panel.commands.saved', tone: 'success' });
    } catch (error) {
      if (error?.status === 409) {
        setConflicted(true);
        setNotice({ key: 'panel.command.conflict', tone: 'error' });
      } else setNotice({ key: 'panel.error.generic', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{t('panel.commands.eyebrow')}</p><h1>{t('panel.commands.title')}</h1><p className="page-description">{t('panel.commands.description')}</p></div>
      {catalog ? <span className="version-chip"><span className="version-dot" />{t('panel.commands.revision', { values: { version: catalog.version } })}</span> : null}
    </div>
    <section className="panel command-permissions-guide" aria-labelledby="commands-guide-title">
      <h2 id="commands-guide-title">{t('panel.commands.policy_title')}</h2><p>{t('panel.commands.policy_help')}</p>
    </section>
    {loading ? <p className="status-card" role="status">{t('panel.commands.loading')}</p> : null}
    {!loading && catalog && catalog.commands.length > 0 ? <form className="command-permissions-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {!catalog.followerScopeReady ? <div className="command-scope-summary">
        {catalog.commands.some((command) => command.access?.kind === 'configurable' && command.policy?.minimumRole === 'follower') && !followerAuthorizationRequest(catalog)
          ? <p className="command-scope-note" role="status">{t('panel.command.follower_scope_lost')}</p> : null}
        {followerAuthorizationRequest(catalog) ? <div className="command-scope-authorization">
          <p className="command-scope-note">{t('panel.command.follower_consent_only')}</p>
          <FollowerReauthorization catalog={catalog} request={request} onNavigate={onNavigate} t={t} onError={() => setNotice({ key: 'panel.error.generic', tone: 'error' })} />
        </div> : null}
      </div> : null}
      {groups.map((group) => <section className="command-policy-group" data-command-group={group.key} key={group.key} aria-labelledby={`command-group-${group.key}`}>
        <h2 className="command-policy-group-heading" id={`command-group-${group.key}`}>{t(GROUP_KEYS[group.key] ?? GROUP_KEYS.fixed)}</h2>
        <div className="command-policy-grid">{group.commands.map((command) => <CommandCard key={command.key} command={command} draft={draft} t={t} disabled={saving} onChange={(key, value) => { setDraft((current) => ({ ...current, [key]: value })); setNotice(null); }} />)}</div>
      </section>)}
      {notice ? <p className={`command-permissions-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{t(notice.key)}</p> : null}
      {conflicted ? <button className="button button-secondary" type="button" disabled={saving} onClick={() => void load()}>{t('panel.command.reload')}</button> : null}
      <div className="command-permissions-actions"><p className="form-hint" role="status">{dirty ? t('panel.settings.unsaved') : t('panel.settings.no_changes')}</p>{dirty ? <button className="button button-secondary" type="button" disabled={saving} onClick={() => { setDraft({}); setNotice(null); }}>{t('panel.commands.cancel')}</button> : null}<button className="button button-primary" type="submit" disabled={saving || !dirty}>{saving ? t('panel.settings.saving') : t('panel.commands.save')}</button></div>
    </form> : null}
    {!loading && catalog && catalog.commands.length === 0 ? <p className="status-card" role="status">{t('panel.commands.empty')}</p> : null}
    {!loading && !catalog && notice ? <p className="status-card error-card" role="alert">{t(notice.key)} <button className="button button-secondary" type="button" onClick={() => void load()}>{t('panel.command.reload')}</button></p> : null}
  </>;
}

function FollowerReauthorization({ catalog, request, onNavigate, onError, t }) {
  const [busy, setBusy] = useState(false);
  const reauthorize = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await request('/api/command-policies/follower-authorization', { method: 'POST', body: JSON.stringify(followerAuthorizationRequest(catalog)) });
      const authorization = new URL(result?.authorizationUrl);
      if (authorization.origin !== OAUTH_ORIGIN || authorization.pathname !== '/oauth2/authorize') throw new Error('Invalid OAuth destination');
      onNavigate(authorization.href);
    } catch { onError(); setBusy(false); }
  };
  return <button className="button button-secondary" type="button" disabled={busy} onClick={() => void reauthorize()}>{t('panel.command.follower_authorize')}</button>;
}

export default function CommandPermissionsPageContent() {
  const { status, t } = usePanel();
  if (status !== 'ready') return null;
  return <CommandPermissionsPageView t={t} request={apiClient.request} />;
}
