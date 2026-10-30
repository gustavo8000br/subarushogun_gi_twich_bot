'use client';

import { useRef, useState } from 'react';
import { getDefaultQueueCallMessage } from '../../../shared/panel/queue-call-message.mjs';
import { renderCallMessagePreview, validateCallMessageTemplate } from './queue-creation.mjs';

function suggestSlug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/g, '');
}

/** @param {{t: (key:string, options?:object)=>string, saving:boolean, feedback: any, onCreate:(values:Record<string, unknown>)=>Promise<boolean>}} props */
export default function NewQueueForm({ t, saving, feedback, twitchConnected = false, onCreate }) {
  const [queueMode, setQueueMode] = useState(twitchConnected ? 'channel_points' : 'manual_only');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [callMessageTouched, setCallMessageTouched] = useState(false);
  const callMessageInput = useRef(null);
  const defaultCallMessage = getDefaultQueueCallMessage(t, slug);
  const [callMessage, setCallMessage] = useState(null);
  const currentCallMessage = callMessage ?? defaultCallMessage;
  let callMessageIsInvalid = false;
  try { validateCallMessageTemplate(currentCallMessage); } catch { callMessageIsInvalid = true; }
  const callPreview = renderCallMessagePreview(currentCallMessage || defaultCallMessage, {
    user: t('panel.form.call_preview_user'), queue: t('panel.form.call_preview_queue'),
    position: '1', uid: '', account: t('panel.form.call_preview_account'),
  });

  async function submit(event) {
    event.preventDefault();
    if (callMessageIsInvalid) {
      setCallMessageTouched(true);
      callMessageInput.current?.focus();
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const created = await onCreate(values);
    if (created) {
      form.reset();
      setQueueMode(twitchConnected ? 'channel_points' : 'manual_only');
      setSlug('');
      setSlugEdited(false);
      setCallMessage(null);
      setCallMessageTouched(false);
    }
  }

  function updateTitle(event) {
    if (!slugEdited) setSlug(suggestSlug(event.currentTarget.value));
  }

  function updateSlug(event) {
    setSlugEdited(event.currentTarget.value.length > 0);
    setSlug(event.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24));
  }

  return (
    <>
      <form className="queue-create-form" onSubmit={submit}>
        <fieldset className="form-section">
          <legend>{t('panel.form.section_identity')}</legend>
          <div className="form-grid">
            <label>{t('panel.form.queue_name')}<input name="title" required maxLength={45} placeholder={t('panel.form.queue_name_placeholder')} onChange={updateTitle} /></label>
            <label>{t('panel.form.command')}<input name="slug" required minLength={2} maxLength={24} pattern="[a-z0-9-]+" placeholder={t('panel.form.command_placeholder')} autoComplete="off" value={slug} onChange={updateSlug} /><small className="form-hint">{t('panel.form.command_hint')}</small></label>
            <label className="form-field-wide">{t('panel.form.aliases')}<input name="aliases" placeholder={t('panel.form.aliases_placeholder')} autoComplete="off" /><small className="form-hint">{t('panel.form.aliases_hint')}</small></label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>{t('panel.form.section_entry')}</legend>
          <label className="form-field-mode">{t('panel.form.queue_mode')}<select name="queueMode" value={queueMode} onChange={(event) => setQueueMode(event.target.value)}>
            <option value="channel_points">{t('panel.form.mode_channel_points')}</option>
            <option value="manual_only">{t('panel.form.mode_manual')}</option>
          </select><small className="form-hint">{t(queueMode === 'channel_points' ? 'panel.form.mode_channel_points_hint' : 'panel.form.mode_manual_hint')}</small></label>
          {!twitchConnected ? <p className="form-hint form-field-wide queue-twitch-setup-hint" role="note">{t('panel.form.twitch_setup_required')} <a href="/connection/">{t('panel.form.twitch_setup_link')}</a></p> : null}
        </fieldset>

        <fieldset className="form-section queue-create-reward-fields" hidden={queueMode !== 'channel_points'} disabled={queueMode !== 'channel_points'}>
          <legend>{t('panel.form.section_reward')}</legend>
          <div className="form-grid">
            <label>{t('panel.form.cost')}<input name="cost" type="number" min="1" step="1" required defaultValue="1000" /></label>
            <label>{t('panel.form.reward_description')}<textarea name="rewardPrompt" rows={2} maxLength={180} placeholder={t('panel.form.reward_prompt_placeholder')} /></label>
            <p className="form-hint form-field-wide">{t('panel.form.twitch_limits_hint')}</p>
            <label>{t('panel.form.max_per_stream')}<input name="maxRedemptionsPerStream" type="number" min="1" step="1" placeholder={t('panel.form.no_limit')} /></label>
            <label>{t('panel.form.max_per_viewer')}<input name="maxRedemptionsPerUserPerStream" type="number" min="1" step="1" placeholder={t('panel.form.no_limit')} /></label>
            <label>{t('panel.form.cooldown')}<input name="globalCooldownSeconds" type="number" min="1" step="1" placeholder={t('panel.form.no_cooldown')} /></label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>{t('panel.form.section_handling')}</legend>
          <div className="form-grid">
            <label>{t('panel.form.uid_mode')}<select name="uidMode" defaultValue="hidden">
              <option value="hidden">{t('panel.form.uid_hidden')}</option>
              <option value="visible">{t('panel.form.uid_visible')}</option>
            </select></label>
            <label>{t('panel.form.call_timeout')}<input name="callTimeoutMin" type="number" min="1" max="120" defaultValue="10" /></label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>{t('panel.form.section_call_message')}</legend>
          <label>{t('panel.form.call_message')}<textarea ref={callMessageInput} name="callMessage" rows={2} maxLength={350} value={currentCallMessage} onChange={(event) => { setCallMessage(event.target.value); setCallMessageTouched(true); }} aria-invalid={callMessageTouched && callMessageIsInvalid || undefined} aria-describedby={[
            'new-queue-call-message-hint',
            currentCallMessage.includes('{uid}') ? 'new-queue-call-message-uid-note' : null,
            callMessageTouched && callMessageIsInvalid ? 'new-queue-call-message-error' : null,
          ].filter(Boolean).join(' ')} /><small id="new-queue-call-message-hint" className="form-hint">{t('panel.queue_settings.call_placeholders', { values: { user: '{user}', queue: '{queue}', position: '{position}', uid: '{uid}', account: '{account}' } })}</small>{callMessageTouched && callMessageIsInvalid ? <small id="new-queue-call-message-error" className="form-error" role="alert">{t('panel.form.call_message_invalid')}</small> : null}</label>
          <div className="call-message-preview" id="new-queue-call-message-preview" role="group" aria-labelledby="new-queue-call-message-preview-label"><strong id="new-queue-call-message-preview-label">{t('panel.form.call_preview_label')}</strong><output>{callPreview}</output></div>
          {currentCallMessage.includes('{uid}') ? <small id="new-queue-call-message-uid-note" className="form-hint">{t('panel.form.call_preview_uid_note')}</small> : null}
        </fieldset>

        <div className="form-action-bar">
          <a className="button button-secondary" href="/queues/">{t('panel.form.cancel')}</a>
          <button className="button button-primary" type="submit" disabled={saving || feedback?.status === 'uncertain'}>{saving ? t('panel.queue.action_result.saving') : t('panel.form.create_queue')}</button>
        </div>
        {feedback?.status ? <div className={`queue-creation-feedback${feedback.status === 'error' ? ' is-error' : feedback.status === 'warning' || feedback.status === 'pending' || feedback.status === 'uncertain' ? ' is-warning' : ''}`} role={feedback.status === 'error' ? 'alert' : 'status'}>
          <p>{t(feedback.key, feedback.key === 'panel.error.reference' && feedback.referenceId ? { values: { id: feedback.referenceId } } : undefined)}</p>
          {feedback.referenceId && feedback.key !== 'panel.error.reference' ? <small>{t('panel.error.reference', { values: { id: feedback.referenceId } })}</small> : null}
          {['confirmed', 'pending', 'warning', 'uncertain'].includes(feedback.status) ? <a href="/queues/">{t('panel.queue.creation_result.open_queues')}</a> : null}
        </div> : null}
      </form>
    </>
  );
}
