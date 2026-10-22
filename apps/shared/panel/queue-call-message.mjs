/** Build the localized default queue call copy with this queue's presence command. */
export function getDefaultQueueCallMessage(t, queueSlug = '') {
  const syntax = String(t('panel.command.syntax.queue_presente'));
  const command = queueSlug
    ? syntax.replace(/<[^>]+>/, String(queueSlug))
    : syntax;
  const localizedMessage = t('panel.queue_settings.call_message_default', {
    values: { user: '{user}', command },
  });
  return localizedMessage.replace(command, `“${command}”`);
}
