/** @param {{request: (url: string, options: object) => Promise<any>, refresh: () => Promise<void>, entryId: string}} dependencies */
export async function resendCallNotification({ request, refresh, entryId }) {
  const result = await request(`/api/entries/${encodeURIComponent(entryId)}/call-notification/resend`, { method: 'POST', body: '{}' });
  await refresh();
  return result;
}
