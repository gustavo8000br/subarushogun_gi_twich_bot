'use client';

import { useEffect, useRef, useState } from 'react';
import { getQueueActionState, getQueueVisibilityAction } from '../../../shared/panel/queue-action-state.mjs';
import { getQueueDeletionView, getQueueLifecycleOutcome, isQueueLifecycleActionAvailable } from './queue-lifecycle.mjs';
import { getQueueConfirmationCopy } from '../../../shared/panel/queue-confirmation-copy.mjs';
import QueueRewardResolutionDialog from './queue-reward-resolution-dialog.jsx';

const PLURAL_CONFIRMATIONS = new Set(['panel.queue.confirm.delete', 'panel.queue.confirm.delete_local', 'panel.queue.confirm.delete_converted']);
const TITLE_ONLY_CONFIRMATIONS = new Set(['panel.queue.confirm.cancel_delete', 'panel.queue.confirm.archive_local_uncertain_final']);

/** R7: plural form of a count; 0 uses `other` as the rest of the panel does. */
function pluralCategory(locale, count) {
  return count === 0 ? 'other' : new Intl.PluralRules(locale).select(count);
}

function QueueLifecycleActions({ queue, locale, t, saving, rewardLinkRefreshRequired, onAction, onOutcome, onLoadRewardCandidates, onResolveReward }) {
  const dialog = useRef(null);
  const [pending, setPending] = useState(null);
  const [archiveChallenge, setArchiveChallenge] = useState(null);
  const [notice, setNotice] = useState(null);
  const state = getQueueActionState(queue);
  const visible = getQueueVisibilityAction(queue, state);
  const activeCount = queue.entries.filter((entry) => ['waiting', 'called', 'in_progress'].includes(entry.status)).length;
  const deleting = queue.lifecycleStatus === 'deleting';
  const deletion = getQueueDeletionView(queue);
  const manualRetry = ['unknown', 'failed'].includes(queue.modeTransitionStatus);

  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal?.();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);

  function ask(action) {
    setNotice(null);
    setPending(action);
  }

  async function accept() {
    if (!pending || saving) return;
    if (pending === 'archive-local-first') {
      const challenge = await onAction?.(queue.id, 'archive-local-challenge', { queue });
      if (challenge?.status === 'challenge_issued') {
        setArchiveChallenge(challenge);
        setPending('archive-local-final');
      } else {
        setNotice({ key: challenge?.key ?? 'panel.queue.archive_local.unavailable', error: true });
        setPending(null);
      }
      return;
    }
    const action = pending === 'manual-mode-retry' ? 'manual-mode'
      : pending === 'delete-retry' ? 'delete'
        : pending === 'archive-local-final' ? 'archive-local-confirm' : pending;
    const result = await onAction?.(queue.id, action, { challenge: archiveChallenge });
    if (action === 'delete' || action === 'cancel-delete') {
      // FT-23: the result of a delete or a cancel-deletion goes to the persistent region of the page, not to this card.
      const invokerId = action === 'delete' ? `queue-delete-${queue.id}` : `queue-cancel-delete-${queue.id}`;
      const descriptor = !result
        ? { action, queue, invokerId, error: { code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' } }
        : result.status === 'error' ? { action, queue, invokerId, feedback: result } : { action, queue, invokerId, result };
      if (onOutcome) onOutcome(descriptor);
      else {
        const outcome = getQueueLifecycleOutcome(descriptor);
        if (outcome && !Number.isFinite(outcome.count)) setNotice({ key: outcome.key, error: outcome.element === 'alert', referenceId: outcome.referenceId });
      }
      setPending(null);
      return;
    }
    if (!result) {
      setNotice({ key: 'panel.queue.action_result.failed', error: true });
      setPending(null);
      return;
    }
    if (result.status === 'error') setNotice({ key: result.key ?? 'panel.queue.archive_local.unavailable', error: true, referenceId: result.referenceId });
    else if (action === 'archive-local-confirm') setNotice({ key: 'panel.queue.archive_local.done' });
    else if (action === 'manual-mode') setNotice({ key: result.status === 'pending' ? 'panel.queue.mode_transition.pending' : 'panel.queue.mode_transition.done', warning: result.status === 'pending' });
    else setNotice({ key: 'panel.queue.unarchive.done' });
    setPending(null);
    if (action === 'archive-local-confirm') setArchiveChallenge(null);
  }

  const confirmationKey = pending === 'archive-local-first' ? getQueueConfirmationCopy(queue, 'archive-local-first')
    : pending === 'archive-local-final' ? getQueueConfirmationCopy(queue, 'archive-local-final')
      : pending === 'manual-mode-retry' ? 'panel.queue.confirm.manual_mode_retry'
        : pending === 'manual-mode' ? 'panel.queue.confirm.manual_mode'
          : pending === 'cancel-delete' ? getQueueConfirmationCopy(queue, 'cancel-delete')
            : pending === 'unarchive' ? getQueueConfirmationCopy(queue, 'unarchive')
              : getQueueConfirmationCopy(queue, 'delete');
  const specificDialog = pending === 'delete' || pending === 'cancel-delete';
  const confirmationText = (key) => t(PLURAL_CONFIRMATIONS.has(key) ? `${key}.${pluralCategory(locale, activeCount)}` : key,
    PLURAL_CONFIRMATIONS.has(key) ? { values: { title: queue.title, count: activeCount } }
      : TITLE_ONLY_CONFIRMATIONS.has(key) ? { values: { title: queue.title } } : undefined);
  const confirmationParagraphs = pending === 'cancel-delete'
    ? [confirmationText(confirmationKey), confirmationText('panel.queue.confirm.cancel_delete_if_ok'), confirmationText('panel.queue.confirm.cancel_delete_not_restored')]
    : [confirmationText(confirmationKey)];
  const dialogTitle = pending === 'cancel-delete' ? t('panel.queue.dialog.title.cancel_delete', { values: { title: queue.title } })
    : pending === 'delete' ? t('panel.queue.dialog.title.delete', { values: { title: queue.title } })
      : t('panel.confirmation.title');
  const copyIds = confirmationParagraphs.map((_, index) => `lifecycle-copy-${queue.id}-${index}`);
  const blockedText = deletion.blocked
    ? (deletion.blockedCount > 0
      ? t(`panel.queue.deletion.blocked.${pluralCategory(locale, deletion.blockedCount)}`, { values: { count: new Intl.NumberFormat(locale).format(deletion.blockedCount) } })
      : t('panel.queue.deletion.blocked.generic'))
    : null;

  return <>
    <div className="queue-lifecycle-secondary-actions">
      {!deleting ? <button type="button" id={`queue-delete-${queue.id}`} className="button button-secondary" disabled={!isQueueLifecycleActionAvailable(queue, 'delete') || saving} onClick={() => ask('delete')}>{t('panel.queue.action.delete')}</button> : null}
      {!deleting && !queue.isArchived ? <>
        {isQueueLifecycleActionAvailable(queue, 'manual-mode')
          ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('manual-mode')}>{t('panel.queue.action.manual_mode')}</button> : null}
        {queue.queueMode !== 'manual_only' && queue.rewardId && manualRetry
          ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('manual-mode-retry')}>{t('panel.queue.action.manual_mode_retry')}</button> : null}
      </> : null}
      {deleting ? <>
        {deletion.canCancel ? <button type="button" id={`queue-cancel-delete-${queue.id}`} className="button button-secondary" disabled={saving} onClick={() => ask('cancel-delete')}>{t('panel.queue.action.cancel_delete')}</button> : null}
        {state.canRetryLocalDeletion ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('delete-retry')}>{t('panel.queue.action.retry_local_delete')}</button> : null}
      </> : null}
      {state.canDeleteFromPanelAnyway ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('archive-local-first')}>{t(getQueueConfirmationCopy(queue, 'archive-local-first-accept'))}</button> : null}
      {visible ? <button type="button" className="button button-secondary" disabled={visible.disabled || saving} onClick={() => ask('unarchive')}>{t(visible.key)}</button> : null}
      {state.resolveReward ? <QueueRewardResolutionDialog queue={queue} locale={locale} t={t} saving={saving} disabled={rewardLinkRefreshRequired} onLoadCandidates={onLoadRewardCandidates} onResolve={onResolveReward} /> : null}
    </div>
    {deletion.cancelling ? <p className="queue-deletion-line is-cancelling">{t('panel.queue.deletion.cancelling')}</p> : null}
    {blockedText ? <p className="queue-deletion-line is-blocked">{blockedText} <a href="/operations/">{t('panel.queue.deletion.blocked_link')}</a></p> : null}
    {notice ? <p className={`queue-action-feedback${notice.error ? ' is-error' : notice.warning ? ' is-warning' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {t(notice.key)}
      {typeof notice.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(notice.referenceId)
        ? <> <small>{t('panel.error.reference', { values: { id: notice.referenceId } })}</small></>
        : null}
    </p> : null}
    <dialog ref={dialog} className="operation-confirmation" aria-modal="true" aria-labelledby={`lifecycle-title-${queue.id}`} aria-describedby={copyIds.join(' ')} onClose={() => { setPending(null); setArchiveChallenge(null); }}>
      <h2 id={`lifecycle-title-${queue.id}`}>{dialogTitle}</h2>
      {confirmationParagraphs.map((paragraph, index) => <p key={copyIds[index]} id={copyIds[index]}>{paragraph}</p>)}
      <div className="operation-confirmation-actions">
        {specificDialog ? <>
          <button type="button" className="button button-secondary" disabled={saving} onClick={() => setPending(null)}>{t('panel.queue.dialog.back')}</button>
          <button type="button" className={`button ${pending === 'delete' ? 'button-danger' : 'button-primary'}`} disabled={saving || !pending} onClick={() => void accept()}>
            {saving ? t('panel.queue.action_result.saving') : t(pending === 'delete' ? 'panel.queue.action.delete' : 'panel.queue.action.cancel_delete')}
          </button>
        </> : <>
          <button type="button" className="button button-secondary" disabled={saving} onClick={() => setPending(null)}>{t('panel.dialog.cancel')}</button>
          <button type="button" className="button button-primary" disabled={saving || !pending} onClick={() => void accept()}>{t('panel.dialog.confirm')}</button>
        </>}
      </div>
    </dialog>
  </>;
}

export default QueueLifecycleActions;
