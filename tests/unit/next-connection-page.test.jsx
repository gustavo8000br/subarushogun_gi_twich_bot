/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPageView } from '../../apps/frontend/features/connection/connection-page-content.jsx';

afterEach(cleanup);

const COPY = {
  'panel.connection.eyebrow': 'TWITCH',
  'panel.connection.title': 'Channel connection',
  'panel.connection.description': 'Connect or review your Twitch channel.',
  'panel.connection.setup_eyebrow': 'GETTING STARTED',
  'panel.connection.confidential_app_help': 'Create a confidential app. Callback URL:',
  'panel.connection.open_console': 'Open developer console',
  'panel.credentials.title': 'Twitch credentials',
  'panel.credentials.client_id': 'Client ID',
  'panel.credentials.client_secret': 'Client Secret',
  'panel.credentials.client_id_placeholder': 'Your Client ID',
  'panel.credentials.secret_configured': 'Secret is configured and is never shown.',
  'panel.credentials.secret_empty': 'No application secret has been saved yet.',
  'panel.credentials.validate_save': 'Validate and save app',
  'panel.connection.connect': 'Connect to Twitch',
  'panel.connection.reconnect': 'Reconnect to Twitch',
  'panel.connection.credentials_required': 'Validate app credentials before connecting.',
  'panel.connection.authorized_eyebrow': 'AUTHORIZED CHANNEL',
  'panel.connection.connected_fallback': 'Channel connected',
  'panel.connection.connected': 'Twitch is connected to this local panel.',
  'panel.connection.reconcile': 'Reconcile now',
  'panel.connection.channel_not_connected': 'Twitch is not connected yet',
  'panel.health.chat.connected': 'Chat connected',
  'panel.health.chat.not_configured': 'Chat not configured',
  'panel.health.rewards.available': 'Rewards available',
  'panel.health.rewards.unknown': 'Reward status unknown',
  'panel.health.twitch.connected': 'Connected',
  'panel.health.twitch.not_configured': 'Not configured',
  'panel.error.generic': 'Could not complete. Try again.',
  'panel.operations.reconcile_failed': 'Could not reconcile with Twitch.',
  'panel.error.twitch_credentials': 'Twitch rejected the app credentials.',
  'panel.credentials.validating': 'Validating credentials…',
  'panel.credentials.saved': 'App credentials validated and saved.',
  'panel.connection.saved_refresh_failed': 'Credentials were saved, but connection details could not be refreshed. Reload to verify the status.',
  'panel.connection.starting': 'Starting Twitch authorization…',
  'panel.connection.oauth_success': 'Twitch connected successfully.',
  'panel.connection.oauth_declined': 'Twitch authorization was declined. You are still in the panel.',
  'panel.connection.oauth_error': 'Twitch could not be connected. You are still in the panel.',
  'panel.reconciliation.running': 'Reconciliation in progress…',
  'panel.reconciliation.complete.one': 'Reconciliation complete. Imported {count} redemption.',
  'panel.reconciliation.complete.other': 'Reconciliation complete. Imported {count} redemptions.',
  'panel.reconciliation.issues.one': 'Reconciliation completed with {count} issue.',
  'panel.reconciliation.issues.other': 'Reconciliation completed with {count} issues.',
};
const t = (key, options = {}) => (COPY[key] ?? key).replace(/\{([a-z]+)\}/g, (_, name) => String(options.values?.[name] ?? `{${name}}`));
const baseSetup = {
  callbackUrl: 'https://localhost:3000/callback', clientId: 'client-123', secretConfigured: false,
  connected: false, status: 'not_configured', chatStatus: 'not_configured', rewardStatus: 'unknown', eligibility: null,
};
function renderView({ setup = baseSetup, request = vi.fn(), onNavigate = vi.fn() } = {}) {
  render(<ConnectionPageView setup={setup} locale="en" t={t} request={request} onNavigate={onNavigate} />);
  return { request, onNavigate };
}

describe('Next Twitch connection page', () => {
  it('shows the callback and blocks authorization until credentials are saved', () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Channel connection' })).toBeTruthy();
    expect(screen.getByText('https://localhost:3000/callback')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect to Twitch' }).disabled).toBe(true);
    expect(screen.getByText('Twitch is not connected yet')).toBeTruthy();
  });

  it('renders callback outcomes inside the connection page and removes the status from browser history', async () => {
    window.history.replaceState(null, '', '/connection/?oauth=success&code=must-not-remain');
    renderView();
    expect((await screen.findByRole('status')).textContent).toContain('Twitch connected successfully.');
    expect(window.location.pathname).toBe('/connection/');
    expect(window.location.search).toBe('');
  });

  it('renders declined and unexpected callback failures as localized panel alerts', async () => {
    window.history.replaceState(null, '', '/connection/?oauth=declined');
    renderView();
    expect((await screen.findByRole('alert')).textContent).toContain('Twitch authorization was declined. You are still in the panel.');
    cleanup();
    window.history.replaceState(null, '', '/connection/?oauth=error');
    renderView();
    expect((await screen.findByRole('alert')).textContent).toContain('Twitch could not be connected. You are still in the panel.');
  });

  it('validates and saves credentials, clears the secret, and refreshes setup state', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 'validated', clientId: 'client-123', secretConfigured: true })
      .mockResolvedValueOnce({ ...baseSetup, secretConfigured: true });
    renderView({ request });
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'top-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and save app' }));
    await waitFor(() => expect(request).toHaveBeenNthCalledWith(1, '/api/setup/application', {
      method: 'POST', body: JSON.stringify({ clientId: 'client-123', clientSecret: 'top-secret' }),
    }));
    expect(await screen.findByText('App credentials validated and saved.')).toBeTruthy();
    expect(request).toHaveBeenNthCalledWith(2, '/api/setup');
    expect(screen.getByLabelText('Client Secret').value).toBe('');
    expect(document.body.textContent).not.toContain('top-secret');
    expect(screen.getByRole('button', { name: 'Connect to Twitch' }).disabled).toBe(false);
  });

  it('reports a refresh failure without implying that the accepted credentials were rejected', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 'validated', clientId: 'client-123', secretConfigured: true })
      .mockRejectedValueOnce(new Error('temporary unavailable'));
    renderView({ request });
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'top-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and save app' }));
    expect(await screen.findByText(COPY['panel.connection.saved_refresh_failed'])).toBeTruthy();
    expect(screen.getByLabelText('Client Secret').value).toBe('');
    expect(screen.getByRole('button', { name: 'Connect to Twitch' }).disabled).toBe(false);
  });

  it('starts authorization only after credentials exist and navigates to the Twitch authorize endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ authorizationUrl: 'https://id.twitch.tv/oauth2/authorize?client_id=abc' });
    const setup = { ...baseSetup, secretConfigured: true };
    const { onNavigate } = renderView({ setup, request });
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Twitch' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/setup/connect', { method: 'POST', body: '{}' }));
    expect(onNavigate).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/authorize?client_id=abc');
  });

  it('rejects an authorization URL outside the fixed Twitch OAuth origin', async () => {
    const request = vi.fn().mockResolvedValue({ authorizationUrl: 'https://attacker.example/steal' });
    const { onNavigate } = renderView({ setup: { ...baseSetup, secretConfigured: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Twitch' }));
    expect(await screen.findByText('Could not complete. Try again.')).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows the authorized channel health and keeps reconnect available', () => {
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true, broadcasterId: 'private-id', status: 'connected', chatStatus: 'connected', rewardStatus: 'available', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, channelIdentity: { displayName: 'Channel Display', login: 'channel_login' } } } });
    expect(screen.getByRole('heading', { name: 'Channel Display' })).toBeTruthy();
    expect(screen.getByText('Chat connected')).toBeTruthy();
    expect(screen.getByText('Rewards available')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-id');
    expect(screen.getByRole('button', { name: 'Reconnect to Twitch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconcile now' })).toBeTruthy();
  });

  it('clarifies that no client secret exists before one is saved', () => {
    renderView();
    expect(screen.getByText('No application secret has been saved yet.')).toBeTruthy();
  });

  it('uses the existing reconciliation API and reports its result', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'complete', imported: 2, issues: [] });
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile now' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/reconciliation', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Reconciliation complete. Imported 2 redemptions.')).toBeTruthy();
  });

  it('reports failed reconciliation issues instead of claiming a successful zero-import result', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'failed', issues: [{ code: 'reconciliation_failed' }] });
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile now' }));
    expect(await screen.findByText('Reconciliation completed with 1 issue.')).toBeTruthy();
  });

  it('reports valid partial reconciliation results with their issue count', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'partial', imported: 1, issues: [{ code: 'reward_verification_failed' }] });
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile now' }));
    expect(await screen.findByText('Reconciliation completed with 1 issue.')).toBeTruthy();
  });

  it.each([
    ['missing issues', { status: 'complete', imported: 0 }],
    ['unknown status', { status: 'unexpected', imported: 2, issues: [] }],
    ['failed without issue details', { status: 'failed', imported: 0, issues: [] }],
    ['invalid imported count', { status: 'complete', imported: -1, issues: [] }],
  ])('uses safe reconciliation failure feedback for malformed response (%s)', async (_name, response) => {
    const request = vi.fn().mockResolvedValue(response);
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile now' }));
    expect(await screen.findByText('Could not reconcile with Twitch.')).toBeTruthy();
    expect(screen.queryByText(/Reconciliation complete/)).toBeNull();
  });
});
