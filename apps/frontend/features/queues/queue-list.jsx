import { getQueueActionState } from '../../../web/queue-action-state.mjs';
import { queueSyncTranslationKey } from '../../../web/queue-sync-status.mjs';
import QueueSettingsForm from './queue-settings-form.jsx';

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

function ManualEntryForm({ queue, saving, t, onSubmit }) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const priority = values.get('priority') === 'on';
    const added = await onSubmit?.(queue.id, {
      login: String(values.get('login') ?? '').trim().replace(/^@/, ''),
      uid: String(values.get('uid') ?? '').trim() || undefined,
      priority,
      ...(priority ? { priorityReason: String(values.get('priorityReason') ?? '') } : {}),
    });
    if (added) form.reset();
  }

  return (
    <details className="queue-manual-entry">
      <summary>{t('panel.queue.action.add')}</summary>
      <form className="form-stack" onSubmit={submit}>
        <label>{t('panel.entry.twitch_login')}<input name="login" required maxLength={25} pattern="@?[A-Za-z0-9_]{1,25}" placeholder={t('panel.entry.login_placeholder')} autoComplete="off" /></label>
        <label>{t('panel.entry.uid_optional')}<input name="uid" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder={t('panel.entry.uid_placeholder')} /></label>
        <label className="check-label"><input type="checkbox" name="priority" />{t('panel.entry.priority_toggle')}</label>
        <label>{t('panel.entry.benefit')}<select name="priorityReason" defaultValue="external_payment">
          <option value="external_payment">{t('panel.entry.reason_external')}</option>
          <option value="bits">{t('panel.entry.reason_bits')}</option>
          <option value="subscription">{t('panel.entry.reason_sub')}</option>
          <option value="operator_override">{t('panel.entry.reason_other')}</option>
        </select></label>
        <p className="form-hint">{t('panel.entry.priority_audit_hint')}</p>
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? t('panel.queue.action_result.saving') : t('panel.entry.add')}</button>
      </form>
    </details>
  );
}

/** @param {{queues: Array<any>, locale: string, t: (key:string, options?:object)=>string}} props */
export default function QueueList({ queues, locale, t, onToggleQueue, onEntryAction, onManualEntry, onSaveSettings, saving = false, queueAction = null, queueSettingsAction = null }) {
  const format = (value) => new Intl.NumberFormat(locale).format(value);
  if (queues.length === 0) {
    return (
      <section className="queue-list-empty" aria-labelledby="queue-empty-title">
        <h2 id="queue-empty-title">{t('panel.queue.empty.title')}</h2>
        <p>{t('panel.queue.empty.hint')}</p>
        <a className="next-step-link" href="/new-queue/">{t('panel.queue.empty.create')} <span aria-hidden="true">→</span></a>
      </section>
    );
  }

  return (
    <section className="queue-list" aria-label={t('panel.queues.title')}>
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
              <button type="button" className="button button-secondary" disabled={!actionState.canToggleIntake || saving} onClick={() => onToggleQueue?.(queue.id, !queue.isOpen)}>
                {isSavingQueue ? t('panel.queue.action_result.saving') : t(actionKey)}
              </button>
              {canManageEntries ? <button type="button" className="button button-secondary" disabled={!actionState.canCallEntries || waitingCount === 0 || saving} onClick={() => onEntryAction?.(queue.id, null, 'call-next')}>{t('panel.queue.action.next')}</button> : null}
              {!actionState.canToggleIntake && actionState.blockedReason ? <p className="queue-action-help">{t(`panel.queue.action_blocked.${actionState.blockedReason}`)}</p> : null}
              {queueAction?.queueId === queue.id && queueAction.status !== 'saving' ? <p className={`queue-action-feedback ${queueAction.status === 'error' ? 'is-error' : queueAction.status === 'warning' ? 'is-warning' : ''}`} role={queueAction.status === 'error' ? 'alert' : 'status'}>{t(queueAction.key)}</p> : null}
            </div>
            {canManageEntries && actionState.canAddManualEntry ? <ManualEntryForm queue={queue} saving={saving} t={t} onSubmit={onManualEntry} /> : null}
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
                          return (
                        <li key={entry.id} className="queue-entry-row">
                          <span>{user}{entry.priorityClass === 'priority' ? <small className="priority-badge">{t('panel.entry.priority_badge')} ({t(PRIORITY_REASON_KEYS[entry.priorityReason] ?? 'panel.entry.reason_other')})</small> : null}</span>
                          {canManageEntries ? <span className="queue-entry-actions">
                              {entry.status === 'waiting' ? <button type="button" className="small-action" aria-label={t('panel.entry.action.call_aria', { values: { user } })} disabled={!actionState.canCallEntries || saving} onClick={() => onEntryAction?.(queue.id, entry.id, 'call')}>{t('panel.entry.action.call')}</button> : null}
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
          </article>
        );
      })}
    </section>
  );
}
