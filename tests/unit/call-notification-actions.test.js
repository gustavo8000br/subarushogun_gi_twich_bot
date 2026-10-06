import { describe, expect, it, vi } from 'vitest';
import { resendCallNotification } from '../../apps/web/call-notification-actions.mjs';

describe('call notification panel actions', () => {
  it('requests the existing call notification resend and refreshes the panel', async () => {
    const request = vi.fn(async () => ({ status: 'queued', entryId: 'entry-1' }));
    const refresh = vi.fn(async () => undefined);

    await expect(resendCallNotification({ request, refresh, entryId: 'entry-1' })).resolves.toEqual({ status: 'queued', entryId: 'entry-1' });

    expect(request).toHaveBeenCalledWith('/api/entries/entry-1/call-notification/resend', { method: 'POST', body: '{}' });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
