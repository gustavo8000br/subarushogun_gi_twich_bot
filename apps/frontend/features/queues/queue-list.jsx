import { useEffect, useRef, useState } from 'react';
import { getQueueActionState } from '../../../shared/panel/queue-action-state.mjs';
import { queueSyncTranslationKey } from '../../../shared/panel/queue-sync-status.mjs';
import CallDeadline from './call-deadline.jsx';
import QueueSettingsForm from './queue-settings-form.jsx';
import QueueLifecycleActions from './queue-lifecycle-actions.jsx';
import QueueRewardSettingsDialog from './queue-reward-settings-dialog.jsx';
import { getQueueClearFailureFeedback } from './queue-clear.mjs';

const ENTRY_GROUPS = Object.freeze([
  { id: 'waiting', label: 'panel.queue.group.waiting', statuses: ['waiting'] },
  { id: 'called', label: 'panel.queue.group.called', statuses: ['called'] },
  { id: 'in_service', label: 'panel.queue.group.in_service', statuses: ['in_progress'] },
]);

const PRIORITY_REASON_KEYS = Object.freeze({
  external_payment: 'panel.entry.reason_external',
  bits: 'panel.entry.reason_bits',
  subscription: 'panel.entry.reason_sub',
  operator_override: 'panel.entry.reason_other',
});

function queueStatusKey(queue) {
  if (queue.lifecycleStatus === 'deleting') return 'panel.queue.status.pending_delete';
  if (queue.isOpen) return 'panel.queue.status.open';
  return 'panel.queue.status.closed';
}

function QueueCallRecoveryNotice({ recovery, t, saving, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const statusRef = useRef(null);
  const buttonRef = useRef(null);
  useEffect(() => {
    if (recovery?.key === 'panel.queue.call_next.refreshed') statusRef.current?.focus();
    if (recovery?.key === 'panel.queue.call_next.refresh_failed' && !refreshing) buttonRef.current?.focus();
  }, [recovery?.key, refreshing]);
  async function refresh() {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } catch { /* Provider retains the recovery state and keeps calls blocked. */ }
    finally { setRefreshing(false); }
  }
  const refreshed = recovery?.key === 'panel.queue.call_next.refreshed';
  return <div ref={refreshed ? statusRef : null} tabIndex={refreshed ? -1 : undefined}
    className={`queue-action-feedback ${refreshed ? 'is-warning' : 'is-error'}`}
    role={refreshed ? 'status' : 'alert'} aria-busy={refreshing || undefined}>
    <span>{t(recovery.key)}</span>
    {typeof recovery.referenceId === 'string' ? <small>{t('panel.queue.call_next.reference', { values: { id: recovery.referenceId } })}</small> : null}
    {recovery.required && onRefresh ? <button ref={buttonRef} type="button" className="small-action" disabled={refreshing || saving} aria-busy={refreshing} onClick={() => void refresh()}>
      {t(refreshing ? 'panel.queue.call_next.refreshing' : 'panel.queue.call_next.refresh')}
    </button> : null}
  </div>;
}

function ManualEntryForm({ queue, saving, t, onSubmit, loginError = null }) {
  const loginInput = useRef(null);
  const [loginErrorDismissed, setLoginErrorDismissed] = useState(false);
  const [priority, setPriority] = useState(false);
  const [priorityReason, setPriorityReason] = useState('');
  const [priorityError, setPriorityError] = useState(false);
  useEffect(() => {
    if (!loginError) return;
    setLoginErrorDismissed(false);
    loginInput.current?.focus();
    loginInput.current?.select();
  }, [loginError]);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const isPriority = values.get('priority') === 'on';
    const reason = String(values.get('priorityReason') ?? '');
    if (isPriority && !['subscription', 'bits', 'external_payment', 'operator_override'].includes(reason)) {
      setPriorityError(true);
      form.elements.priorityReason?.focus();
      return;
    }
    setPriorityError(false);
    const added = await onSubmit?.(queue.id, {
      login: String(values.get('login') ?? '').trim().replace(/^@/, ''),
      uid: String(values.get('uid') ?? '').trim() || undefined,
      ...(isPriority ? { priority: true, priorityReason: reason } : {}),
    });
    if (added) {
      form.reset();
      setPriority(false);
      setPriorityReason('');
      loginInput.current?.focus();
    }
  }

  return (
    <details className="queue-manual-entry">
      <summary>{t('panel.queue.action.add')}</summary>
      <form className="form-stack" onSubmit={submit}>
        <label>{t('panel.entry.twitch_login')}<input ref={loginInput} name="login" required maxLength={25} pattern="@?[A-Za-z0-9_]{1,25}" placeholder={t('panel.entry.login_placeholder')} autoComplete="off" aria-invalid={loginError && !loginErrorDismissed ? true : undefined} aria-describedby={loginError && !loginErrorDismissed ? `login-error-${queue.id}` : undefined} onChange={() => setLoginErrorDismissed(true)} />{loginError && !loginErrorDismissed ? <small id={`login-error-${queue.id}`} className="form-error">{t(loginError.key, { values: loginError.values })}</small> : null}</label>
        <label>{t('panel.entry.uid_optional')}<input name="uid" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder={t('panel.entry.uid_placeholder')} /></label>
        <label className="check-label"><input type="checkbox" name="priority" checked={priority} disabled={saving} onChange={(event) => { setPriority(event.currentTarget.checked); setPriorityReason(''); setPriorityError(false); }} />{t('panel.entry.priority_toggle')}</label>
        <div aria-live="polite">{priority ? <label>{t('panel.entry.benefit')}<select name="priorityReason" value={priorityReason} disabled={saving} aria-invalid={priorityError || undefined} aria-describedby={priorityError ? 'priority-reason-error' : 'priority-reason-hint'} onChange={(event) => { setPriorityReason(event.currentTarget.value); setPriorityError(false); }}>
          <option value="">{t('panel.entry.reason_select')}</option>
          <option value="external_payment">{t('panel.entry.reason_external')}</option>
          <option value="bits">{t('panel.entry.reason_bits')}</option>
          <option value="subscription">{t('panel.entry.reason_sub')}</option>
          <option value="operator_override">{t('panel.entry.reason_other')}</option>
        </select>{priorityError ? <small id="priority-reason-error" className="form-error" role="alert">{t('panel.entry.reason_required')}</small> : null}<small id="priority-reason-hint" className="form-hint">{t('panel.entry.priority_audit_hint')}</small></label> : null}</div>
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? t('panel.queue.action_result.saving') : t('panel.entry.add')}</button>
      </form>
    </details>
  );
}

function QueueHistory({ queue, locale, t, onLoad }) {
  const [state, setState] = useState('idle');
  const [entries, setEntries] = useState([]);
  async function load() {
    setState('loading');
    try {
      setEntries(await onLoad?.(queue.id) ?? []);
      setState('ready');
    } catch {
      setState('error');
    }
  }
  return (
    <details className="queue-history" onToggle={(event) => {
      if (event.currentTarget.open && state === 'idle') void load();
    }}>
      <summary>{t('panel.queue.history.title')}</summary>
      <div className="history-content" aria-live="polite">
        {state === 'loading' ? <p role="status">{t('panel.queue.history.loading')}</p> : null}
        {state === 'error' ? <p role="alert">{t('panel.queue.history.failed')} <button type="button" className="small-action" onClick={load}>{t('panel.queue.history.retry')}</button></p> : null}
        {state === 'ready' && entries.length === 0 ? <p>{t('panel.queue.history.empty')}</p> : null}
        {state === 'ready' ? entries.map((entry) => {
          const date = entry.finishedAt
            ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.finishedAt))
            : t('panel.queue.history.date_unavailable');
          return <p className="history-entry" key={entry.id}>{entry.displayName || `@${entry.userLogin}`} · {t(`panel.entry.status.${entry.status}`)} · {date}</p>;
        }) : null}
      </div>
    </details>
  );
}

function QueueClearAction({ queue, t, saving, onPreview, onConfirm, onRefreshQueue, clearRefreshRequired }) {
  const dialog = useRef(null);
  const previewRequest = useRef(0);
  const previewingRef = useRef(false);
  const confirmingRef = useRef(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changed, setChanged] = useState(false);
  const [notice, setNotice] = useState(null);
  const [refreshingQueue, setRefreshingQueue] = useState(false);
  const requiresFreshProjection = clearRefreshRequired;
  useEffect(() => {
    if (clearRefreshRequired) {
      setPreview(null);
      if (notice?.key !== 'panel.queue.clear.refresh_required' && notice?.key !== 'panel.queue.clear.refresh_failed') {
        setNotice({ key: 'panel.queue.clear.refresh_required', referenceId: notice?.referenceId });
      }
    } else if (['panel.queue.clear.refresh_required', 'panel.queue.clear.refresh_failed'].includes(notice?.key)) {
      setNotice({ key: 'panel.queue.clear.refreshed', referenceId: notice.referenceId });
    }
  }, [clearRefreshRequired, notice]);
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal?.();
    if (!preview && dialog.current?.open) dialog.current.close();
  }, [preview]);

  async function start() {
    if (previewingRef.current || confirmingRef.current || saving || requiresFreshProjection) return;
    previewingRef.current = true;
    const requestId = ++previewRequest.current;
    setPreviewing(true);
    setNotice(null);
    setChanged(false);
    try {
      const result = await onPreview?.(queue.id);
      if (requestId !== previewRequest.current) return;
      if (result?.status === 'empty') setNotice({ key: 'panel.queue.clear.empty' });
      else if (result?.status === 'confirmation_required') setPreview(result);
      else setNotice({ key: 'panel.queue.clear.failed' });
    } catch (error) {
      if (requestId === previewRequest.current) {
        setPreview(null);
        setNotice(getQueueClearFailureFeedback(error, { phase: 'preview' }));
      }
    } finally {
      if (requestId === previewRequest.current) {
        previewingRef.current = false;
        setPreviewing(false);
      }
    }
  }

  async function accept() {
    if (!preview || saving || clearRefreshRequired || confirmingRef.current || previewingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    setNotice(null);
    try {
      const result = await onConfirm?.(queue.id);
      if (result?.status === 'cleared' && result.refreshRequired === true) {
        setNotice({ key: 'panel.queue.clear.refresh_required', referenceId: result.referenceId });
        setPreview(null);
      } else if (result?.status === 'cleared') {
        setNotice({ key: 'panel.queue.clear.done', values: { count: result.count, refunds: result.refundsRequested } });
        setPreview(null);
      } else if (result?.status === 'confirmation_required') {
        setPreview(result);
        setChanged(true);
      } else if (result?.status === 'empty' || result?.status === 'uncertain') {
        const refreshFailed = result.status === 'uncertain' && result.refreshRequired === true;
        setNotice({
          key: refreshFailed ? 'panel.queue.clear.refresh_required' : 'panel.queue.clear.uncertain',
          referenceId: result.referenceId,
        });
        setPreview(null);
      } else if (result?.status === 'refresh_required') {
        setNotice({ key: 'panel.queue.clear.refresh_required' });
        setPreview(null);
      } else {
        setNotice({ key: 'panel.queue.clear.failed', referenceId: result?.referenceId });
      }
    } catch (error) {
      const feedback = getQueueClearFailureFeedback(error, { phase: 'confirm' });
      setNotice(feedback);
      if (feedback.key === 'panel.queue.clear.uncertain') setPreview(null);
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  async function refreshQueue() {
    if (refreshingQueue || !onRefreshQueue) return;
    setRefreshingQueue(true);
    let refreshed;
    try {
      refreshed = await onRefreshQueue();
    } catch {
      refreshed = false;
    } finally {
      setRefreshingQueue(false);
    }
    if (refreshed) {
      setNotice({ key: 'panel.queue.clear.refreshed' });
    } else {
      setNotice({ key: 'panel.queue.clear.refresh_failed' });
    }
  }

  function renderNotice() {
    if (!notice) return null;
    const reference = typeof notice.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(notice.referenceId)
      ? notice.referenceId
      : null;
    const isError = ['panel.queue.clear.failed', 'panel.queue.clear.uncertain', 'panel.queue.clear.refresh_required', 'panel.queue.clear.refresh_failed'].includes(notice.key);
    return <div className={isError ? 'queue-action-feedback is-error' : 'queue-action-feedback'} role={isError ? 'alert' : 'status'} aria-busy={refreshingQueue || undefined}>
      <span>{t(notice.key, { values: notice.values })}</span>
      {reference ? <small>{t('panel.error.reference', { values: { id: reference } })}</small> : null}
      {clearRefreshRequired ? <button type="button" className="small-action" disabled={refreshingQueue || saving} aria-busy={refreshingQueue} onClick={() => void refreshQueue()}>
        {t(refreshingQueue ? 'panel.queue.clear.refreshing' : 'panel.queue.clear.refresh')}
      </button> : null}
    </div>;
  }

  return <>
    <button type="button" className="button button-secondary" disabled={saving || previewing || confirming || requiresFreshProjection} onClick={() => void start()}>{previewing ? t('panel.queue.clear.loading') : t('panel.queue.action.clear')}</button>
    {renderNotice()}
    <dialog ref={dialog} className="operation-confirmation" aria-labelledby={`clear-title-${queue.id}`} aria-describedby={`clear-copy-${queue.id}`} onClose={() => { previewRequest.current += 1; setPreview(null); }}>
      <h2 id={`clear-title-${queue.id}`}>{t('panel.confirmation.title')}</h2>
      {changed ? <p role="alert">{t('panel.queue.clear.changed', { values: { count: preview?.count ?? 0 } })}</p> : null}
      <p id={`clear-copy-${queue.id}`} aria-live="polite">{preview ? t('panel.queue.clear.confirm', { values: { title: queue.title, count: preview.count, refunds: preview.refundsRequested } }) : ''}</p>
      {previewing ? <p role="status">{t('panel.queue.clear.loading')}</p> : null}
      {confirming ? <p role="status">{t('panel.queue.clear.clearing')}</p> : null}
      {notice?.key === 'panel.queue.clear.failed' ? renderNotice() : null}
      <div className="operation-confirmation-actions">
        <button type="button" className="button button-secondary" disabled={saving || confirming || previewing} onClick={() => setPreview(null)}>{t('panel.dialog.cancel')}</button>
        <button type="button" className="button button-primary" disabled={saving || confirming || previewing || clearRefreshRequired || !preview} onClick={() => void accept()}>{confirming ? t('panel.queue.clear.clearing') : t('panel.dialog.confirm')}</button>
      </div>
    </dialog>
  </>;
}

/** @param {{queues: Array<any>, locale: string, t: (key:string, options?:object)=>string}} props */
export default function QueueList({ queues, locale, t, lifecycleNotice = null, onToggleQueue, onEntryAction, onManualEntry, onSaveSettings, onLoadHistory, onPreviewClear, onConfirmClear, onRefreshQueue, onRefreshCallQueue, onRefreshProjection, clearRefreshRequired = false, queueCallRefreshRequired = false, queueCallRecovery = null, onLifecycleAction, onLoadRewardCandidates, onResolveReward, onSaveRewardSettings, saving = false, queueAction = null, queueSettingsAction = null }) {
  const [expiryAnnouncement, setExpiryAnnouncement] = useState('');
  function announceExpiry(entry) {
    setExpiryAnnouncement(t('panel.entry.call.expired_announcement', { values: { user: entry.displayName || entry.userLogin || '' } }));
  }
  useEffect(() => {
    // After a save that makes activation possible, move focus to the (enabled) activate action. Never activates by itself.
    if (!queueSettingsAction?.focusActivate || !queueSettingsAction.queueId) return;
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById(`queue-toggle-${queueSettingsAction.queueId}`));
    if (!button || button.disabled) return;
    button.focus();
    button.scrollIntoView?.({ block: 'nearest' });
  }, [queueSettingsAction]);
  const format = (value) => new Intl.NumberFormat(locale).format(value);
  const [priorityReasonEntry, setPriorityReasonEntry] = useState(null);
  const priorityReasonDialog = useRef(null);
  const expiryRegion = <p className="call-deadline-announcement" role="status">{expiryAnnouncement}</p>;
  const lifecycleFeedback = lifecycleNotice?.key
    ? <p className="queue-action-feedback" role="status">{t(lifecycleNotice.key)}</p>
    : null;
  useEffect(() => {
    if (priorityReasonEntry && !priorityReasonDialog.current?.open) priorityReasonDialog.current?.showModal?.();
    if (!priorityReasonEntry && priorityReasonDialog.current?.open) priorityReasonDialog.current.close();
  }, [priorityReasonEntry]);
  if (queues.length === 0) {
    return (
      <>
        {lifecycleFeedback}
        {queueCallRecovery ? <QueueCallRecoveryNotice recovery={queueCallRecovery} t={t} saving={saving} onRefresh={onRefreshCallQueue} /> : null}
        <section className="queue-list-empty" aria-labelledby="queue-empty-title">
          <h2 id="queue-empty-title">{t('panel.queue.empty.title')}</h2>
          <p>{t('panel.queue.empty.hint')}</p>
          <a className="next-step-link" href="/new-queue/">{t('panel.queue.empty.create')} <span aria-hidden="true">→</span></a>
        </section>
      </>
    );
  }

  return (
    <section className="queue-list" aria-label={t('panel.queues.title')}>
      {lifecycleFeedback}
      {expiryRegion}
      {queueCallRecovery ? <QueueCallRecoveryNotice recovery={queueCallRecovery} t={t} saving={saving} onRefresh={onRefreshCallQueue} /> : null}
      {queues.map((queue) => {
        const syncLabel = queueSyncTranslationKey(queue.remoteSyncStatus);
        const actionState = getQueueActionState(queue);
        const isSavingQueue = saving && queueAction?.queueId === queue.id;
        const canManageEntries = queue.lifecycleStatus !== 'deleting' && queue.lifecycleStatus !== 'deleted' && !queue.isArchived;
        const actionKey = queue.isOpen ? 'panel.queue.action.pause' : 'panel.queue.action.activate';
        const waitingCount = queue.entries.filter((entry) => entry.status === 'waiting').length;
        return (
          <article className="queue-list-card" key={queue.id} aria-labelledby={`queue-title-${queue.id}`}>
            <header className="queue-list-heading">
              <div>
                <h2 id={`queue-title-${queue.id}`}>{queue.title}</h2>
                <p>!{queue.slug}</p>
              </div>
              <span className={`queue-state ${queue.lifecycleStatus === 'deleting' ? 'is-pending' : queue.isOpen ? 'is-open' : 'is-closed'}`}>
                {t(queueStatusKey(queue))}
              </span>
            </header>
            {syncLabel ? <p className="queue-sync-state">{t(syncLabel)}</p> : null}
            <div className="queue-lifecycle-actions">
              {!queue.isArchived && queue.lifecycleStatus !== 'deleting' ? <button type="button" id={`queue-toggle-${queue.id}`} className="button button-secondary" disabled={!actionState.canToggleIntake || saving} onClick={() => onToggleQueue?.(queue.id, !queue.isOpen)}>
                {isSavingQueue ? t('panel.queue.action_result.saving') : t(actionKey)}
              </button> : null}
              {canManageEntries ? <button type="button" className="button button-secondary" disabled={!actionState.canCallEntries || waitingCount === 0 || saving || queueCallRefreshRequired} onClick={() => onEntryAction?.(queue.id, null, 'call-next')}>{t('panel.queue.action.next')}</button> : null}
              {canManageEntries ? <QueueClearAction queue={queue} t={t} saving={saving} onPreview={onPreviewClear} onConfirm={onConfirmClear} onRefreshQueue={onRefreshQueue} clearRefreshRequired={clearRefreshRequired} /> : null}
              <QueueLifecycleActions queue={queue} locale={locale} t={t} saving={saving} rewardLinkRefreshRequired={queueAction?.queueId === queue.id && queueAction.key === 'panel.reward.link_refresh_failed'} onAction={onLifecycleAction} onLoadRewardCandidates={onLoadRewardCandidates} onResolveReward={onResolveReward} />
              {queue.queueMode !== 'manual_only' && queue.rewardId
                && ['synced', 'synced_manual'].includes(queue.remoteSyncStatus)
                && queue.lifecycleStatus === 'active' && !queue.isArchived
                ? <QueueRewardSettingsDialog queue={queue} t={t} saving={saving} onSave={onSaveRewardSettings} /> : null}
              {!queue.isArchived && queue.lifecycleStatus !== 'deleting' && !actionState.canDelete && actionState.deleteBlockedReason
                ? <p className="queue-action-help">{t(`panel.queue.delete_blocked.${actionState.deleteBlockedReason}`)}</p> : null}
              {!actionState.canToggleIntake && actionState.blockedReason ? <p className="queue-action-help">{t(`panel.queue.action_blocked.${actionState.blockedReason}`)}</p> : null}
              {queueAction?.queueId === queue.id && queueAction.status !== 'saving' && queueAction.key !== 'panel.entry.error.twitch_user_not_found' ? <div className={`queue-action-feedback ${queueAction.status === 'error' ? 'is-error' : ['pending', 'warning'].includes(queueAction.status) ? 'is-warning' : ''}`} role={queueAction.status === 'error' ? 'alert' : 'status'}>
                <span>{t(queueAction.key, { values: queueAction.values })}</span>
                {typeof queueAction.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(queueAction.referenceId) ? <small>{t('panel.error.reference', { values: { id: queueAction.referenceId } })}</small> : null}
                {queueAction.key === 'panel.reward.link_refresh_failed' ? <button type="button" className="small-action" disabled={saving} aria-busy={saving} onClick={() => void onRefreshProjection?.()}>{t(saving ? 'panel.reward.refreshing_queue' : 'panel.reward.refresh_queue')}</button> : null}
                {queueAction.key === 'panel.reward.settings_refresh_failed' ? <button type="button" className="small-action" disabled={saving} aria-busy={saving} onClick={() => void onRefreshProjection?.({ purpose: 'reward-settings' })}>{t(saving ? 'panel.reward.refreshing_queue' : 'panel.reward.refresh_queue')}</button> : null}
                {queueAction.key === 'panel.entry.add.refresh_failed' ? <button type="button" className="small-action" disabled={saving} aria-busy={saving} onClick={() => void onRefreshProjection?.({ purpose: 'manual-entry' })}>{t(saving ? 'panel.reward.refreshing_queue' : 'panel.reward.refresh_queue')}</button> : null}
              </div> : null}
            </div>
            {canManageEntries && actionState.canAddManualEntry ? <ManualEntryForm queue={queue} saving={saving} t={t} onSubmit={onManualEntry} loginError={queueAction?.queueId === queue.id && queueAction.key === 'panel.entry.error.twitch_user_not_found' ? queueAction : null} /> : null}
            {canManageEntries ? <QueueSettingsForm queue={queue} t={t} saving={saving} feedback={queueSettingsAction} onSave={onSaveSettings} /> : null}
            <div className="queue-entry-groups">
              {ENTRY_GROUPS.map((group) => {
                const entries = queue.entries.filter((entry) => group.statuses.includes(entry.status));
                return (
                  <section className="queue-entry-group" key={group.id} aria-label={t(group.label)}>
                    <h3>{t(group.label)} <span>{format(entries.length)}</span></h3>
                    {entries.length ? (
                      <ol>
                        {entries.map((entry) => {
                          const user = entry.displayName || entry.userLogin;
                          const waitingLane = group.id === 'waiting'
                            ? queue.entries.filter((candidate) => candidate.status === 'waiting' && (candidate.priorityClass ?? 'standard') === (entry.priorityClass ?? 'standard'))
                            : [];
                          const lanePosition = waitingLane.findIndex((candidate) => candidate.id === entry.id) + 1;
                          async function togglePriority() {
                            const priority = entry.priorityClass !== 'priority';
                            if (priority) {
                              setPriorityReasonEntry({ queueId: queue.id, entryId: entry.id });
                              return;
                            }
                            await onEntryAction?.(queue.id, entry.id, 'toggle-priority', { priority, reason: entry.priorityReason });
                          }
                          return (
                        <li key={entry.id} className="queue-entry-row">
                          <span>{user}{entry.priorityClass === 'priority' ? <small className="priority-badge">{t('panel.entry.priority_badge')} ({t(PRIORITY_REASON_KEYS[entry.priorityReason] ?? 'panel.entry.reason_other')})</small> : null}</span>
                          {entry.status === 'called' ? <CallDeadline entry={entry} t={t} onExpire={announceExpiry} /> : null}
                          {canManageEntries ? <span className="queue-entry-actions">
                              {entry.status === 'waiting' ? <>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.call_aria', { values: { user } })} disabled={!actionState.canCallEntries || saving || queueCallRefreshRequired} onClick={() => onEntryAction?.(queue.id, entry.id, 'call')}>{t('panel.entry.action.call')}</button>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.move_up')} disabled={saving || lanePosition <= 1} onClick={() => onEntryAction?.(queue.id, entry.id, 'move-up', { position: lanePosition - 1 })}>{t('panel.entry.action.move_up')}</button>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.move_down')} disabled={saving || lanePosition >= waitingLane.length} onClick={() => onEntryAction?.(queue.id, entry.id, 'move-down', { position: lanePosition + 1 })}>{t('panel.entry.action.move_down')}</button>
                                <button type="button" className="small-action" aria-label={t(entry.priorityClass === 'priority' ? 'panel.entry.action.remove_priority' : 'panel.entry.action.mark_priority')} disabled={saving} onClick={togglePriority}>{t(entry.priorityClass === 'priority' ? 'panel.entry.action.remove_priority' : 'panel.entry.action.mark_priority')}</button>
                              </> : null}
                              {entry.status === 'called' ? <>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.attend_aria', { values: { user } })} disabled={saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'attend')}>{t('panel.entry.action.attend')}</button>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.complete_aria', { values: { user } })} disabled={saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'complete')}>{t('panel.entry.action.complete')}</button>
                                <button type="button" className="small-action" aria-label={t('panel.entry.action.resend_aria', { values: { user } })} disabled={saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'resend-call')}>{t('panel.entry.action.resend')}</button>
                              </> : null}
                              {entry.status === 'in_progress' ? <button type="button" className="small-action" aria-label={t('panel.entry.action.complete_aria', { values: { user } })} disabled={saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'complete')}>{t('panel.entry.action.complete')}</button> : null}
                              <button type="button" className="small-action" aria-label={t('panel.entry.action.remove_aria', { values: { user } })} disabled={saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'remove')}>{t('panel.entry.action.remove')}</button>
                            </span> : null}
                        </li>
                          );
                        })}
                      </ol>
                    ) : <p>{t('panel.queue.empty_group')}</p>}
                  </section>
                );
              })}
            </div>
            <QueueHistory queue={queue} locale={locale} t={t} onLoad={onLoadHistory} />
          </article>
        );
      })}
      {priorityReasonEntry ? <PriorityReasonDialog
        t={t}
        saving={saving}
        dialogRef={priorityReasonDialog}
        onClose={() => setPriorityReasonEntry(null)}
        onConfirm={async (reason) => {
          const action = priorityReasonEntry;
          await onEntryAction?.(action.queueId, action.entryId, 'toggle-priority', { priority: true, reason });
          setPriorityReasonEntry(null);
        }}
      /> : null}
    </section>
  );
}

function PriorityReasonDialog({ t, saving, dialogRef, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!['subscription', 'bits', 'external_payment', 'operator_override'].includes(reason)) {
      setError(true);
      return;
    }
    await onConfirm(reason);
  }
  return <dialog ref={dialogRef} className="operation-confirmation" aria-labelledby="priority-reason-title" onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <h2 id="priority-reason-title">{t('panel.priority.dialog_title')}</h2>
      <label>{t('panel.entry.benefit')}<select autoFocus required value={reason} disabled={saving} aria-invalid={error || undefined} aria-describedby={error ? 'priority-dialog-error' : 'priority-dialog-hint'} onChange={(event) => { setReason(event.currentTarget.value); setError(false); }}>
        <option value="">{t('panel.entry.reason_select')}</option>
        <option value="external_payment">{t('panel.entry.reason_external')}</option>
        <option value="bits">{t('panel.entry.reason_bits')}</option>
        <option value="subscription">{t('panel.entry.reason_sub')}</option>
        <option value="operator_override">{t('panel.entry.reason_other')}</option>
      </select></label>
      {error ? <small id="priority-dialog-error" className="form-error" role="alert">{t('panel.entry.reason_required')}</small> : <small id="priority-dialog-hint" className="form-hint">{t('panel.entry.priority_audit_hint')}</small>}
      {saving ? <p role="status">{t('panel.queue.action_result.saving')}</p> : null}
      <div className="operation-confirmation-actions">
        <button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>{t('panel.dialog.cancel')}</button>
        <button type="submit" className="button button-primary" disabled={saving}>{t('panel.entry.action.mark_priority')}</button>
      </div>
    </form>
  </dialog>;
}
