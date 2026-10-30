'use client';

import { useEffect, useRef, useState } from 'react';
import { getQueueActionState, getQueueVisibilityAction } from '../../../shared/panel/queue-action-state.mjs';
import { isQueueLifecycleActionAvailable } from './queue-lifecycle.mjs';
import { getQueueConfirmationCopy } from '../../../shared/panel/queue-confirmation-copy.mjs';
import QueueRewardResolutionDialog from './queue-reward-resolution-dialog.jsx';

function QueueLifecycleActions({ queue, locale, t, saving, rewardLinkRefreshRequired, onAction, onLoadRewardCandidates, onResolveReward }) {
  const dialog = useRef(null);
  const [pending, setPending] = useState(null);
  const [archiveChallenge, setArchiveChallenge] = useState(null);
  const [notice, setNotice] = useState(null);
  const state = getQueueActionState(queue);
  const visible = getQueueVisibilityAction(queue, state);
  const activeCount = queue.entries.filter((entry) => ['waiting', 'called', 'in_progress'].includes(entry.status)).length;
  const deleting = queue.lifecycleStatus === 'deleting';
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
    if (!result) {
      setNotice({ key: 'panel.queue.action_result.failed', error: true });
      setPending(null);
      return;
    }
    if (result.status === 'error') setNotice({ key: result.key ?? 'panel.queue.archive_local.unavailable', error: true, referenceId: result.referenceId });
    else if (action === 'delete') setNotice({ key: result.status === 'pending' ? 'panel.queue.delete.pending' : 'panel.queue.delete.done', warning: result.status === 'pending' });
    else if (action === 'archive-local-confirm') setNotice({ key: 'panel.queue.archive_local.done' });
    else if (action === 'cancel-delete') {
      const key = result.status === 'cancelled' ? 'panel.queue.delete.cancelled'
        : result.status === 'already_deleted' ? 'panel.queue.delete.cancel.already_deleted'
          : result.reason === 'queue_delete_reward_absent' ? 'panel.queue.delete.cancel.reward_absent'
            : result.reason === 'queue_delete_reward_diverged' ? 'panel.queue.delete.cancel.reward_diverged'
              : 'panel.queue.delete.cancel.unverified';
      setNotice({ key, warning: result.status !== 'cancelled' });
    } else if (action === 'manual-mode') setNotice({ key: result.status === 'pending' ? 'panel.queue.mode_transition.pending' : 'panel.queue.mode_transition.done', warning: result.status === 'pending' });
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
  const confirmationValues = new Set([
    'panel.queue.confirm.delete', 'panel.queue.confirm.delete_local',
    'panel.queue.confirm.delete_converted', 'panel.queue.confirm.cancel_delete',
    'panel.queue.confirm.archive_local_uncertain_final',
  ]).has(confirmationKey) ? { title: queue.title, count: activeCount } : undefined;
  const confirmCopy = t(confirmationKey, { ...(confirmationValues ? { values: confirmationValues } : {}) });

  return <>
    <div className="queue-lifecycle-secondary-actions">
      {!deleting ? <button type="button" className="button button-secondary" disabled={!isQueueLifecycleActionAvailable(queue, 'delete') || saving} onClick={() => ask('delete')}>{t('panel.queue.action.delete')}</button> : null}
      {!deleting && !queue.isArchived ? <>
        {isQueueLifecycleActionAvailable(queue, 'manual-mode')
          ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('manual-mode')}>{t('panel.queue.action.manual_mode')}</button> : null}
        {queue.queueMode !== 'manual_only' && queue.rewardId && manualRetry
          ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('manual-mode-retry')}>{t('panel.queue.action.manual_mode_retry')}</button> : null}
      </> : null}
      {deleting ? <>
        {state.canCancelQueueDeletion ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('cancel-delete')}>{t('panel.queue.action.cancel_delete')}</button> : null}
        {state.canRetryLocalDeletion ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('delete-retry')}>{t('panel.queue.action.retry_local_delete')}</button> : null}
      </> : null}
      {state.canDeleteFromPanelAnyway ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => ask('archive-local-first')}>{t(getQueueConfirmationCopy(queue, 'archive-local-first-accept'))}</button> : null}
      {visible ? <button type="button" className="button button-secondary" disabled={visible.disabled || saving} onClick={() => ask('unarchive')}>{t(visible.key)}</button> : null}
      {state.resolveReward ? <QueueRewardResolutionDialog queue={queue} locale={locale} t={t} saving={saving} disabled={rewardLinkRefreshRequired} onLoadCandidates={onLoadRewardCandidates} onResolve={onResolveReward} /> : null}
    </div>
    {notice ? <p className={`queue-action-feedback${notice.error ? ' is-error' : notice.warning ? ' is-warning' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {t(notice.key)}
      {typeof notice.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(notice.referenceId)
        ? <> <small>{t('panel.error.reference', { values: { id: notice.referenceId } })}</small></>
        : null}
    </p> : null}
    <dialog ref={dialog} className="operation-confirmation" aria-modal="true" aria-labelledby={`lifecycle-title-${queue.id}`} aria-describedby={`lifecycle-copy-${queue.id}`} onClose={() => { setPending(null); setArchiveChallenge(null); }}>
      <h2 id={`lifecycle-title-${queue.id}`}>{t('panel.confirmation.title')}</h2>
      <p id={`lifecycle-copy-${queue.id}`}>{confirmCopy}</p>
      <div className="operation-confirmation-actions">
        <button type="button" className="button button-secondary" disabled={saving} onClick={() => setPending(null)}>{t('panel.dialog.cancel')}</button>
        <button type="button" className="button button-primary" disabled={saving || !pending} onClick={() => void accept()}>{t('panel.dialog.confirm')}</button>
      </div>
    </dialog>
  </>;
}

export default QueueLifecycleActions;
