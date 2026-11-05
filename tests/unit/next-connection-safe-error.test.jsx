/** @vitest-environment jsdom */
// TS-10 (AC-TS10-5): safe credential-validation error ported from the removed vanilla panel (web-application-setup.test.js).
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPageView } from '../../apps/frontend/features/connection/connection-page-content.jsx';

afterEach(cleanup);

const COPY = {
  'panel.credentials.client_id': 'Client ID', 'panel.credentials.client_secret': 'Client Secret',
  'panel.credentials.validate_save': 'Validate and save app', 'panel.credentials.saved': 'App credentials validated and saved.',
  'panel.credentials.validating': 'Validating credentials…',
  'panel.error.generic': 'Could not complete. Try again.', 'panel.error.twitch_credentials': 'Twitch rejected the app credentials.',
  'panel.connection.callback_url': 'Callback URL',
};
const t = (key) => COPY[key] ?? key;
const setup = { callbackUrl: 'https://localhost:3000/callback', clientId: 'client-123', secretConfigured: false, connected: false, status: 'not_configured', chatStatus: 'not_configured', rewardStatus: 'unknown', eligibility: null };

async function submitWith(request) {
  render(<ConnectionPageView setup={setup} locale="en" t={t} request={request} onNavigate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'temporary-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Validate and save app' }));
}

describe('AC-TS10-5: credential validation shows only localized safe text', () => {
  it('a backend failure whose message holds a secret-like string renders the generic localized alert, never the raw message', async () => {
    await submitWith(vi.fn().mockRejectedValue(Object.assign(new Error('provider body contains token=secret'), { code: 'PRODUCT_LOCALE_VERSION_CONFLICT' })));
    const alert = await screen.findByText(COPY['panel.error.generic']);
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toContain('token=secret');
    expect(document.body.innerHTML).not.toContain('PRODUCT_LOCALE_VERSION_CONFLICT');
  });

  it('a credential rejection (400) renders the localized credentials text, not the provider message', async () => {
    await submitWith(vi.fn().mockRejectedValue(Object.assign(new Error('invalid client token=secret'), { status: 400 })));
    expect(await screen.findByText(COPY['panel.error.twitch_credentials'])).toBeTruthy();
    expect(document.body.innerHTML).not.toContain('token=secret');
  });

  it('clears the secret field after the async validation resolves, once the request outlives the submit event', async () => {
    let resolveRequest;
    const request = vi.fn((path) => (path === '/api/setup/application'
      ? new Promise((resolve) => { resolveRequest = resolve; })
      : Promise.resolve({ ...setup, secretConfigured: true })));
    await submitWith(request);
    expect(screen.getByLabelText('Client Secret').value).toBe('temporary-secret');
    resolveRequest({ status: 'validated', clientId: 'client-123', secretConfigured: true });
    await waitFor(() => expect(screen.getByLabelText('Client Secret').value).toBe(''));
    expect(request).toHaveBeenCalledWith('/api/setup/application', { method: 'POST', body: JSON.stringify({ clientId: 'client-123', clientSecret: 'temporary-secret' }) });
    expect(await screen.findByText(COPY['panel.credentials.saved'])).toBeTruthy();
  });
});
