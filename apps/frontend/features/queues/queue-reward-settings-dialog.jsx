'use client';

import { useEffect, useRef, useState } from 'react';

function optionalLimit(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : Number.NaN;
}

export default function QueueRewardSettingsDialog({ queue, t, saving, onSave }) {
  const dialog = useRef(null);
  const form = useRef(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [uidMode, setUidMode] = useState(queue.uidMode === 'visible' ? 'visible' : 'hidden');
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal?.();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  useEffect(() => {
    if (!open || !snapshot || !form.current) return;
    for (const [name, value] of Object.entries(snapshot.settings)) {
      const field = form.current.elements.namedItem(name);
      if (field) field.value = value === null ? '' : String(value);
    }
    setUidMode(snapshot.settings.uidMode);
  }, [open, snapshot]);

  function start() {
    setError(null);
    const settings = {
      title: queue.title,
      cost: queue.cost,
      rewardPrompt: queue.rewardPrompt ?? '',
      uidMode: queue.uidMode === 'visible' ? 'visible' : 'hidden',
      maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null,
      maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
      globalCooldownSeconds: queue.globalCooldownSeconds ?? null,
    };
    setSnapshot({ version: queue.version, settings });
    setUidMode(settings.uidMode);
    setOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.current || saving) return;
    const values = new FormData(form.current);
    const result = await onSave?.(queue.id, {
      expectedVersion: snapshot?.version,
      title: String(values.get('title')).trim(),
      cost: Number(values.get('cost')),
      rewardPrompt: String(values.get('rewardPrompt')).trim(),
      uidMode: String(values.get('uidMode')),
      maxRedemptionsPerStream: optionalLimit(String(values.get('maxRedemptionsPerStream'))),
      maxRedemptionsPerUserPerStream: optionalLimit(String(values.get('maxRedemptionsPerUserPerStream'))),
      globalCooldownSeconds: optionalLimit(String(values.get('globalCooldownSeconds'))),
    });
    if (result?.status === 'pending') {
      setOpen(false);
      return;
    }
    const failure = t(result?.key ?? 'panel.error.generic');
    const reference = typeof result?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(result.referenceId)
      ? t('panel.error.reference', { values: { id: result.referenceId } })
      : '';
    setError(reference ? `${failure} ${reference}` : failure);
  }

  return <>
    <button type="button" className="button button-secondary" disabled={saving} onClick={start}>{t('panel.queue.action.edit_reward')}</button>
    <dialog ref={dialog} className="operation-confirmation reward-resolution-dialog reward-settings-dialog" aria-modal="true" aria-labelledby={`reward-settings-title-${queue.id}`} onClose={() => { setOpen(false); setError(null); }}>
      <div className="panel-heading">
        <div><p className="eyebrow">{t('panel.reward_settings.eyebrow')}</p><h2 id={`reward-settings-title-${queue.id}`}>{t('panel.reward_settings.title')}</h2></div>
        <button type="button" className="icon-button" aria-label={t('panel.dialog.close')} disabled={saving} onClick={() => setOpen(false)}>×</button>
      </div>
      <form ref={form} className="form-stack" onSubmit={(event) => void submit(event)}>
        <fieldset className="reward-settings-group" disabled={saving}><legend>{t('panel.reward_settings.group.reward')}</legend><div className="reward-settings-grid reward-settings-grid-two">
          <label>{t('panel.reward_settings.reward_name')}<input name="title" defaultValue={queue.title} required maxLength={45} /></label>
          <label>{t('panel.reward_settings.cost')}<input name="cost" type="number" defaultValue={queue.cost} min={1} max={2147483647} step={1} required /></label>
        </div></fieldset>
        <fieldset className="reward-settings-group" disabled={saving}><legend>{t('panel.reward_settings.group.viewer')}</legend><div className="reward-settings-grid">
          <label>{t('panel.reward_settings.description')}<textarea name="rewardPrompt" defaultValue={queue.rewardPrompt ?? ''} maxLength={200} rows={3} /></label>
          <label>{t('panel.reward_settings.uid_field')}<select name="uidMode" value={uidMode} onChange={(event) => setUidMode(event.currentTarget.value)}>
            <option value="hidden">{t('panel.reward_settings.no_uid')}</option><option value="visible">{t('panel.form.uid_visible')}</option>
          </select></label>
        </div>{snapshot?.settings.uidMode === 'visible' && uidMode === 'hidden' ? <p className="reward-uid-warning" role="status">{t('panel.reward_settings.uid_removal_warning')}</p> : null}</fieldset>
        <fieldset className="reward-settings-group" disabled={saving}><legend>{t('panel.reward_settings.group.limits')}</legend><div className="reward-settings-grid reward-settings-grid-three">
          <label>{t('panel.reward_settings.stream_limit')}<input name="maxRedemptionsPerStream" type="number" defaultValue={queue.maxRedemptionsPerStream ?? ''} min={1} max={2147483647} step={1} /></label>
          <label>{t('panel.reward_settings.viewer_limit')}<input name="maxRedemptionsPerUserPerStream" type="number" defaultValue={queue.maxRedemptionsPerUserPerStream ?? ''} min={1} max={2147483647} step={1} /></label>
          <label>{t('panel.reward_settings.cooldown')}<input name="globalCooldownSeconds" type="number" defaultValue={queue.globalCooldownSeconds ?? ''} min={1} max={2147483647} step={1} /></label>
        </div></fieldset>
        <p className="hint">{t('panel.reward_settings.twitch_limits_hint')}</p>
        {error ? <p className="connection-notice is-error" role="alert">{error}</p> : null}
        <div className="operation-confirmation-actions">
          <button type="button" className="button button-secondary" disabled={saving} onClick={() => setOpen(false)}>{t('panel.dialog.cancel')}</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? t('panel.queue.action_result.saving') : t('panel.reward_settings.submit')}</button>
        </div>
      </form>
    </dialog>
  </>;
}
