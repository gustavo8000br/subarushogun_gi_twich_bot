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
  'panel.credentials.secret_empty': 'Secret is stored locally and never shown again.',
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
  'panel.error.twitch_credentials': 'Twitch rejected the app credentials.',
  'panel.credentials.validating': 'Validating credentials…',
  'panel.credentials.saved': 'App credentials validated and saved.',
  'panel.connection.saved_refresh_failed': 'Credentials were saved, but connection details could not be refreshed. Reload to verify the status.',
  'panel.connection.starting': 'Starting Twitch authorization…',
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
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true, broadcasterId: 'private-id', status: 'connected', chatStatus: 'connected', rewardStatus: 'available', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true } } });
    expect(screen.getByRole('heading', { name: 'Channel connected' })).toBeTruthy();
    expect(screen.getByText('Chat connected')).toBeTruthy();
    expect(screen.getByText('Rewards available')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-id');
    expect(screen.getByRole('button', { name: 'Reconnect to Twitch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconcile now' })).toBeTruthy();
  });

  it('uses the existing reconciliation API and reports its result', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'complete', imported: 2, issues: [] });
    renderView({ setup: { ...baseSetup, secretConfigured: true, connected: true }, request });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile now' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/reconciliation', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Reconciliation complete. Imported 2 redemptions.')).toBeTruthy();
  });
});
