'use client';

import { useEffect, useRef, useState } from 'react';

const MISMATCH_LABELS = Object.freeze({
  title_mismatch: 'title', cost_mismatch: 'cost', prompt_mismatch: 'prompt', uid_input_mismatch: 'uid',
  max_redemptions_per_stream_mismatch: 'stream_limit',
  max_redemptions_per_user_per_stream_mismatch: 'viewer_limit',
  global_cooldown_mismatch: 'cooldown', auto_fulfill_enabled: 'auto_fulfill',
  skip_request_queue_enabled: 'skip_queue', reward_disabled: 'disabled', reward_not_paused: 'not_paused',
});

export default function QueueRewardResolutionDialog({ queue, locale, t, saving, disabled = false, onLoadCandidates, onResolve }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');
  const [candidates, setCandidates] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal?.();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  async function load() {
    setState('loading');
    setCandidates([]);
    setDiagnostics(null);
    setSelectedId('');
    setError(null);
    try {
      const result = await onLoadCandidates?.(queue.id);
      setCandidates(result?.candidates ?? []);
      setDiagnostics(result?.diagnostics ?? null);
      setSelectedId(result?.candidates?.[0]?.id ?? '');
      setState('ready');
    } catch (requestError) {
      setError(requestError);
      setState('error');
    }
  }

  async function openDialog() {
    setOpen(true);
    await load();
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedId || saving || disabled || state !== 'ready') return;
    try {
      const result = await onResolve?.(queue.id, selectedId);
      if (result?.status === 'error') {
        setError(result);
        setState('resolve-error');
        return;
      }
      if (result?.status !== 'resolved' || result.remoteConfirmed !== false) {
        setError(null);
        setState('resolve-error');
        return;
      }
      setOpen(false);
      setState('idle');
      setError(null);
    } catch (requestError) {
      setError(requestError);
      setState('resolve-error');
    }
  }

  const mismatchLabels = Object.entries(diagnostics?.mismatchCounts ?? {})
    .filter(([key, count]) => Number.isSafeInteger(count) && count > 0 && MISMATCH_LABELS[key])
    .map(([key, count]) => t(`panel.reward.mismatch.${MISMATCH_LABELS[key]}`, { values: { count } }));
  const queueSummary = `${queue.title} · ${new Intl.NumberFormat(locale).format(queue.cost ?? 0)} ${t('panel.queue.points')}`;
  const reference = typeof error?.referenceId === 'string'
    ? t('panel.error.reference', { values: { id: error.referenceId } }) : null;

  return <>
    <button type="button" className="button button-secondary" disabled={saving || disabled} onClick={() => void openDialog()}>{t('panel.queue.action.resolve_reward')}</button>
    <dialog ref={dialog} className="operation-confirmation reward-resolution-dialog" aria-modal="true" aria-labelledby={`reward-resolution-title-${queue.id}`} aria-describedby={`reward-resolution-copy-${queue.id}`} onClose={() => { setOpen(false); setState('idle'); setError(null); }}>
      <div className="panel-heading"><div><p className="eyebrow">{t('panel.reward.dialog_eyebrow')}</p><h2 id={`reward-resolution-title-${queue.id}`}>{t('panel.reward.dialog_title')}</h2></div>
        <button type="button" className="icon-button" aria-label={t('panel.dialog.close')} onClick={() => setOpen(false)}>×</button></div>
      <p id={`reward-resolution-copy-${queue.id}`}>{t('panel.reward.manual_association_hint')}</p>
      <p className="reward-queue-summary">{queueSummary}</p>
      <form className="form-stack" onSubmit={submit}>
        {state === 'loading' ? <p role="status">{t('panel.reward.loading_candidates')}</p> : null}
        {state === 'error' || state === 'resolve-error' ? <div className="connection-notice is-error" role="alert">
          <strong>{t(state === 'error' ? 'panel.reward.lookup_error_title' : 'panel.reward.link_error_title')}</strong>
          <span>{t('panel.error.generic')}</span>{reference ? <span>{reference}</span> : null}
        </div> : null}
        {state === 'ready' && candidates.length > 0 ? <>
          <label>{t('panel.reward.compatible_rewards')}<select value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)} required>
            {candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.title} · {new Intl.NumberFormat(locale).format(candidate.cost)} {t('panel.queue.points')}</option>)}
          </select></label>
          <p role="status">{t('panel.reward.candidates_found_title')} · {t('panel.reward.candidate_counts', { values: { compatible: candidates.length, total: diagnostics?.managedRewardCount ?? candidates.length } })}</p>
        </> : null}
        {state === 'ready' && candidates.length === 0 ? <div className="connection-notice is-warning" role="status">
          <strong>{t('panel.reward.no_candidates_title')}</strong><span>{t('panel.reward.no_candidates')}</span>
          {diagnostics ? <>
            <span>{t('panel.reward.candidate_counts', { values: { compatible: 0, total: diagnostics.managedRewardCount } })}</span>
            {mismatchLabels.length ? <span>{t('panel.reward.mismatch_summary', { values: { reasons: mismatchLabels.join(' · ') } })}</span> : null}
            {mismatchLabels.length ? <small>{t('panel.reward.mismatch_overlap')}</small> : null}
          </> : null}
          <ol className="reward-next-steps">{['title', 'settings', 'paused'].map((step) => <li key={step}>{t(`panel.reward.step.${step}`)}</li>)}</ol>
        </div> : null}
        <div className="operation-confirmation-actions">
          <button type="button" className="button button-secondary" disabled={saving || state === 'loading'} onClick={() => void load()}>{t('panel.reward.refresh_candidates')}</button>
          <button type="button" className="button button-secondary" disabled={saving} onClick={() => setOpen(false)}>{t('panel.dialog.cancel')}</button>
          <button type="submit" className="button button-primary" disabled={saving || disabled || state !== 'ready' || !selectedId}>{saving ? t('panel.queue.action_result.saving') : t('panel.reward.link_selected')}</button>
        </div>
      </form>
    </dialog>
  </>;
}
