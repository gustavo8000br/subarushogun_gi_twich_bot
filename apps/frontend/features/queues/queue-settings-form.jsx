'use client';

import { useEffect, useState } from 'react';
import { getDefaultQueueCallMessage } from '../../../shared/panel/queue-call-message.mjs';
import { QUEUE_SETTING_KEYS, queueSettingsMatch, reconcileQueueSettingsDraft } from './queue-settings.mjs';

function queueSettings(queue, t) {
  return {
    callTimeoutMin: queue.callTimeoutMin ?? '',
    callMessage: queue.callMessage ?? getDefaultQueueCallMessage(t, queue.slug),
    showUidInList: queue.showUidInList === true,
    showUidInOverlay: queue.showUidInOverlay === true,
    showUidOnCall: queue.showUidOnCall === true,
    refundIfRemovedWhileCalled: queue.refundIfRemovedWhileCalled === true,
    refundOnNoShow: queue.refundOnNoShow === true,
    refundIfViewerLeavesCalled: queue.refundIfViewerLeavesCalled === true,
  };
}

const BOOLEAN_SETTINGS = Object.freeze(QUEUE_SETTING_KEYS.filter((key) => !['callTimeoutMin', 'callMessage'].includes(key)));
const CHECKBOX_LABELS = Object.freeze({
  showUidInList: 'panel.queue_settings.show_uid_list',
  showUidInOverlay: 'panel.queue_settings.show_uid_overlay',
  showUidOnCall: 'panel.queue_settings.show_uid_call',
  refundIfRemovedWhileCalled: 'panel.queue_settings.refund_removed',
  refundOnNoShow: 'panel.queue_settings.refund_no_show',
  refundIfViewerLeavesCalled: 'panel.queue_settings.refund_viewer_leave',
});

/** @param {{queue:Record<string,any>, t:(key:string, options?:object)=>string, saving:boolean, feedback:any, onSave:(queueId:string, values:Record<string,unknown>, baseline:Record<string,unknown>)=>Promise<boolean>}} props */
const REWARD_NOTICE_KEYS = { diverged: 'panel.queue.onboarding.reward_diverged', create_failed: 'panel.queue.onboarding.reward_failed' };

export default function QueueSettingsForm({ queue, t, saving, feedback, onSave }) {
  const [settings, setSettings] = useState(() => queueSettings(queue, t));
  const [draftBase, setDraftBase] = useState(() => ({ queueId: queue.id, version: queue.version, settings: queueSettings(queue, t) }));
  const [open, setOpen] = useState(false);
  const baseline = draftBase.settings;
  const dirty = !queueSettingsMatch(settings, baseline);

  useEffect(() => {
    const nextSettings = queueSettings(queue, t);
    const nextBase = reconcileQueueSettingsDraft({
      current: settings, draftBase, queueId: queue.id, queueVersion: queue.version, projectedSettings: nextSettings,
    });
    if (nextBase) {
      setSettings(nextBase.settings);
      setDraftBase(nextBase);
    }
  }, [queue.id, queue.version, t, draftBase, settings]);

  function update(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const values = { ...settings, expectedVersion: draftBase.version };
    const saved = await onSave(queue.id, values, baseline);
    if (saved) setDraftBase({ queueId: queue.id, version: draftBase.version + 1, settings: { ...settings } });
  }

  return (
    <details className="queue-settings-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span>{t('panel.queue.action.configure')}</span>{dirty ? <span className="settings-dirty-indicator">{t('panel.queue_settings.unsaved')}</span> : null}</summary>
      <form className="queue-settings-form" onSubmit={submit} aria-label={`${t('panel.queue_settings.title')}: ${queue.title}`}>
        {queue.queueMode === 'channel_points' && !['synced', 'synced_manual'].includes(queue.remoteSyncStatus)
          ? <p className="form-hint queue-settings-notice">{t(REWARD_NOTICE_KEYS[queue.remoteSyncStatus] ?? 'panel.queue.onboarding.reward_pending')}</p> : null}
        <fieldset className="settings-section">
          <legend>{t('panel.queue_settings.section_attendance')}</legend>
          <label>{t('panel.queue_settings.call_deadline')}<input type="number" name="callTimeoutMin" min="1" max="120" value={settings.callTimeoutMin} onChange={(event) => update('callTimeoutMin', event.target.value)} disabled={saving} /></label>
          <label>{t('panel.queue_settings.call_message')}<textarea name="callMessage" rows={2} maxLength={350} value={settings.callMessage} onChange={(event) => update('callMessage', event.target.value)} disabled={saving} /><small className="form-hint">{t('panel.queue_settings.call_placeholders', { values: { user: '{user}', queue: '{queue}', position: '{position}', uid: '{uid}', account: '{account}' } })}</small></label>
        </fieldset>
        <fieldset className="settings-section">
          <legend>{t('panel.queue_settings.section_privacy')}</legend>
          {BOOLEAN_SETTINGS.slice(0, 3).map((name) => <label className="check-label" key={name}><input type="checkbox" name={name} checked={settings[name]} onChange={(event) => update(name, event.target.checked)} disabled={saving} />{t(CHECKBOX_LABELS[name])}</label>)}
          <p className="form-hint">{t('panel.queue_settings.uid_policy_hint')}</p>
        </fieldset>
        <fieldset className="settings-section">
          <legend>{t('panel.queue_settings.section_points')}</legend>
          {BOOLEAN_SETTINGS.slice(3).map((name) => <label className="check-label" key={name}><input type="checkbox" name={name} checked={settings[name]} onChange={(event) => update(name, event.target.checked)} disabled={saving} />{t(CHECKBOX_LABELS[name])}</label>)}
        </fieldset>
        <div className="settings-action-bar">
          <p className="form-hint" role="status">{dirty ? t('panel.queue_settings.unsaved') : t('panel.queue_settings.no_changes')}</p>
          <button type="button" className="button button-secondary" disabled={!dirty || saving} onClick={() => setSettings(baseline)}>{t('panel.form.cancel')}</button>
          <button type="submit" className="button button-primary" disabled={!dirty || saving}>{saving ? t('panel.queue.action_result.saving') : t('panel.queue_settings.save')}</button>
        </div>
        {feedback?.queueId === queue.id && feedback.status !== 'saving' ? <p className={`queue-settings-feedback${feedback.status === 'error' ? ' is-error' : feedback.status === 'warning' ? ' is-warning' : ''}`} role={feedback.status === 'error' ? 'alert' : 'status'}>{t(feedback.key, feedback.referenceId ? { values: { id: feedback.referenceId } } : undefined)}</p> : null}
      </form>
    </details>
  );
}
