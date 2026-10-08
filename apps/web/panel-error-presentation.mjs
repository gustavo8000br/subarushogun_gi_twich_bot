const ERROR_KEYS = Object.freeze({
  INTERNAL_ERROR: 'panel.error.generic',
  PRODUCT_LOCALE_VERSION_CONFLICT: 'panel.error.locale_conflict',
  INVALID_PRODUCT_LOCALE: 'panel.error.locale_unavailable',
  LOCALE_UNAVAILABLE: 'panel.error.locale_unavailable',
  PRODUCT_LOCALE_UNAVAILABLE: 'panel.error.locale_unavailable',
  LOCALIZATION_CATALOGS_UNAVAILABLE: 'panel.error.catalogs_unavailable',
  CHANNEL_BINDING_LOCKED: 'panel.error.channel_locked',
  TWITCH_APP_NOT_CONFIGURED: 'panel.error.twitch_credentials',
  INVALID_TWITCH_CLIENT_CREDENTIALS: 'panel.error.twitch_credentials',
  TWITCH_AUTHORIZATION_FAILED: 'panel.error.twitch_authorization',
  TWITCH_AUTHORIZATION_MISMATCH: 'panel.error.oauth_return',
  INVALID_OAUTH_CALLBACK: 'panel.error.oauth_return',
  INVALID_OAUTH_SESSION: 'panel.error.oauth_return',
  OVERLAY_LINK_ALREADY_ISSUED: 'panel.error.widget_link',
  INVALID_ENTRY_TRANSITION: 'panel.error.invalid_action',
  INVALID_QUEUE_SETTINGS: 'panel.error.invalid_queue_settings',
  INVALID_CALL_MESSAGE_TEMPLATE: 'panel.error.invalid_call_template',
  INVALID_REWARD_SETTINGS: 'panel.error.invalid_reward_settings',
  INVALID_LOCAL_QUEUE_SETTING: 'panel.error.invalid_local_queue_setting',
  STALE_QUEUE_VERSION: 'panel.error.stale_queue_settings',
  QUEUE_NOT_FOUND: 'panel.error.queue_not_found',
  QUEUE_NOT_AVAILABLE: 'panel.error.queue_not_available',
  QUEUE_REWARD_UPDATE_PENDING: 'panel.error.reward_update_pending',
  QUEUE_MODE_TRANSITION_PENDING: 'panel.error.queue_mode_transition_pending',
  QUEUE_MODE_TRANSITION_UNAVAILABLE: 'panel.error.queue_mode_transition_unavailable',
  QUEUE_REWARD_NOT_READY: 'panel.error.reward_not_ready',
  QUEUE_DELETE_UNAVAILABLE: 'panel.error.queue_delete_unavailable',
  PANEL_OPERATION_ALREADY_IN_PROGRESS: 'panel.error.operation_in_progress',
  INVALID_OVERLAY_WIDGET_CONFIGURATION: 'panel.error.invalid_action',
});

const DEFAULT_MESSAGE = 'Não foi possível concluir. Tente novamente.';

/**
 * Render only catalog-owned presentation text for an API or browser failure.
 * Never use a backend-provided error string as user-facing copy.
 * @param {{code?:unknown}|Error|null|undefined} error
 * @param {string} locale
 * @param {Record<string,Record<string,string>>|null|undefined} catalogs
 */
export function presentPanelError(error, locale = 'pt-BR', catalogs = null) {
  const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const key = typeof errorCode === 'string' ? ERROR_KEYS[errorCode] : null;
  const messages = catalogs?.[locale];
  const fallbackMessages = catalogs?.['pt-BR'];
  const message = key && typeof messages?.[key] === 'string' && messages[key].length > 0 ? messages[key]
    : key && typeof fallbackMessages?.[key] === 'string' && fallbackMessages[key].length > 0 ? fallbackMessages[key]
      : typeof messages?.['panel.error.generic'] === 'string' && messages['panel.error.generic'].length > 0 ? messages['panel.error.generic']
        : typeof fallbackMessages?.['panel.error.generic'] === 'string' && fallbackMessages['panel.error.generic'].length > 0 ? fallbackMessages['panel.error.generic']
          : DEFAULT_MESSAGE;
  const referenceId = error && typeof error === 'object' && 'referenceId' in error ? error.referenceId : null;
  if (typeof referenceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referenceId)) return message;
  const referenceTemplate = messages?.['panel.error.reference'] ?? fallbackMessages?.['panel.error.reference'] ?? 'Reference: {id}';
  return `${message} (${referenceTemplate.replace('{id}', referenceId)})`;
}
