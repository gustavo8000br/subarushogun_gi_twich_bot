/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPermissionsPageView } from '../../apps/frontend/features/commands/command-permissions-page-content.jsx';

afterEach(cleanup);

const COPY = {
  'panel.commands.eyebrow': 'LIVE CHAT',
  'panel.commands.title': 'Available commands',
  'panel.commands.description': 'Review roles for each chat command.',
  'panel.commands.policy_title': 'How permissions work',
  'panel.commands.policy_help': 'Higher roles inherit access.',
  'panel.commands.group.configurable': 'Audience access',
  'panel.commands.group.moderator': 'Streamer and moderators only',
  'panel.commands.group.streamer': 'Streamer only',
  'panel.commands.group.fixed': 'Fixed access',
  'panel.commands.loading': 'Loading command catalog…',
  'panel.commands.save': 'Save permissions',
  'panel.commands.saved': 'Command permissions updated.',
  'panel.commands.empty': 'No chat commands are registered.',
  'panel.commands.cancel': 'Discard changes',
  'panel.commands.unavailable': 'The command catalog is not available yet.',
  'panel.command.roles_for': 'Roles allowed to use',
  'panel.command.threshold_label': 'Minimum audience',
  'panel.command.threshold.help': 'The selected audience and higher roles inherit access.',
  'panel.command.threshold.select': 'Choose a minimum audience',
  'panel.command.role.everyone': 'Everyone',
  'panel.command.role.follower': 'Followers',
  'panel.command.role.subscriber': 'Subscribers',
  'panel.command.role.vip': 'VIPs',
  'panel.command.role.moderator': 'Moderators',
  'panel.command.role.streamer': 'Streamer',
  'panel.command.role_join': 'and',
  'panel.command.access_fixed': 'Fixed access:',
  'panel.command.follower_scope_lost': 'Follower access is configured, but Twitch follower permission is unavailable.',
  'panel.command.follower_scope_required': 'Requires Twitch follower permission.',
  'panel.command.follower_consent_only': 'This authorizes Twitch follower lookups only. It will not change saved command permissions.',
  'panel.command.follower_authorize': 'Authorize follower access',
  'panel.command.no_changes': 'No permission changes to save.',
  'panel.command.reload': 'Reload permissions',
  'panel.command.conflict': 'Permissions changed. Reload before saving.',
  'panel.error.generic': 'Could not complete. Try again.',
};
const t = (key, options = {}) => (COPY[key] ?? key).replace(/\{([a-z]+)\}/g, (_, name) => String(options.values?.[name] ?? `{${name}}`));
const catalog = ({ followerScopeReady = true, configuredRole = 'follower', hasPolicyOverride = false } = {}) => ({
  schemaVersion: 3, version: 4, followerScopeReady,
  configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
  commands: [
    { key: 'queue:lista', scope: 'queue', syntax: '!<fila> lista', description: 'Lista', access: { kind: 'configurable', minimumRole: 'follower' }, policy: { kind: 'configurable', minimumRole: configuredRole }, policyOverridden: hasPolicyOverride, configurable: true },
    { key: 'queue:presente', scope: 'queue', syntax: '!<fila> presente', description: 'Presença', access: { kind: 'fixed', minimumRole: 'everyone' }, policy: { kind: 'fixed', minimumRole: 'everyone' }, configurable: false },
    { key: 'queue:atender', scope: 'queue', syntax: '!<fila> atender', description: 'Atender', access: { kind: 'fixed', minimumRole: 'moderator' }, policy: { kind: 'fixed', minimumRole: 'moderator' }, configurable: false },
    { key: 'global:conta:reset', scope: 'global', syntax: '!fila conta reset', description: 'Reset', access: { kind: 'fixed', minimumRole: 'streamer' }, policy: { kind: 'fixed', minimumRole: 'streamer' }, configurable: false },
  ],
});

function renderPage({ request = vi.fn(async (path) => path === '/api/command-catalog' ? catalog() : {}), onNavigate = vi.fn() } = {}) {
  render(<CommandPermissionsPageView t={t} request={request} onNavigate={onNavigate} />);
  return { request, onNavigate };
}

describe('Next command permissions page', () => {
  it('shows the configurable command at the follower default and exposes fixed roles read-only', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Available commands' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Minimum audience.*lista/i }).value).toBe('follower');
    expect(screen.getByRole('heading', { name: 'Fixed access' })).toBeTruthy();
    expect([...document.querySelectorAll('.command-policy-card.is-fixed-access .command-fixed-access strong')]
      .map((role) => role.textContent)).toEqual(['Moderators and Streamer', 'Streamer', 'Everyone']);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(document.querySelectorAll('.command-policy-card.is-fixed-access')).toHaveLength(3);
    expect(screen.queryByText('Requires Twitch follower permission.')).toBeNull();
  });

  it('saves only the changed configurable threshold with the catalog revision', async () => {
    const request = vi.fn(async (path) => path === '/api/command-catalog'
      ? catalog()
      : { schemaVersion: 3, version: 5, policies: { 'queue:lista': { minimumRole: 'subscriber' } } });
    renderPage({ request });
    const selector = await screen.findByRole('combobox', { name: /Minimum audience.*lista/i });
    fireEvent.change(selector, { target: { value: 'subscriber' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/command-policies', {
      method: 'PATCH', body: JSON.stringify({ expectedVersion: 4, policies: { 'queue:lista': { minimumRole: 'subscriber' } } }),
    }));
    expect(await screen.findByText('Command permissions updated.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Minimum audience.*lista/i }).value).toBe('subscriber');
  });

  it('authorizes the missing follower scope without saving implicit policy defaults', async () => {
    const request = vi.fn(async (path) => path === '/api/command-catalog'
      ? catalog({ followerScopeReady: false, configuredRole: 'follower', hasPolicyOverride: false })
      : { authorizationUrl: 'https://id.twitch.tv/oauth2/authorize?state=scope-only' });
    const onNavigate = vi.fn();
    renderPage({ request, onNavigate });
    await screen.findByRole('heading', { name: 'Available commands' });
    fireEvent.click(screen.getByRole('button', { name: 'Authorize follower access' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/command-policies/follower-authorization', {
      method: 'POST', body: JSON.stringify({ expectedVersion: 4, policies: {}, scopeOnly: true }),
    }));
    expect(onNavigate).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/authorize?state=scope-only');
    expect(request).not.toHaveBeenCalledWith('/api/command-policies', expect.anything());
  });

  it('requests Twitch follower authorization before saving a changed follower threshold when the scope is missing', async () => {
    const request = vi.fn(async (path, options) => path === '/api/command-catalog'
      ? catalog({ followerScopeReady: false, configuredRole: 'subscriber', hasPolicyOverride: true })
      : options?.method === 'POST' ? { authorizationUrl: 'https://id.twitch.tv/oauth2/authorize?state=local' } : {});
    const onNavigate = vi.fn();
    renderPage({ request, onNavigate });
    const selector = await screen.findByRole('combobox', { name: /Minimum audience.*lista/i });
    fireEvent.change(selector, { target: { value: 'follower' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/command-policies/follower-authorization', {
      method: 'POST', body: JSON.stringify({ expectedVersion: 4, policies: { 'queue:lista': { minimumRole: 'follower' } } }),
    }));
    expect(onNavigate).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/authorize?state=local');
    expect(request).not.toHaveBeenCalledWith('/api/command-policies', expect.anything());
  });

  it('keeps the draft visible and offers reload when the saved catalog revision conflicts', async () => {
    const request = vi.fn(async (path) => {
      if (path === '/api/command-catalog') return catalog();
      throw Object.assign(new Error('raw failure'), { status: 409 });
    });
    renderPage({ request });
    const selector = await screen.findByRole('combobox', { name: /Minimum audience.*lista/i });
    fireEvent.change(selector, { target: { value: 'subscriber' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    expect(await screen.findByText('Permissions changed. Reload before saving.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload permissions' })).toBeTruthy();
    expect(screen.queryByText('raw failure')).toBeNull();
  });

  it('does not call the API when a draft is returned to its saved value', async () => {
    const request = vi.fn(async (path) => path === '/api/command-catalog' ? catalog() : {});
    renderPage({ request });
    const selector = await screen.findByRole('combobox', { name: /Minimum audience.*lista/i });
    fireEvent.change(selector, { target: { value: 'subscriber' } });
    fireEvent.change(selector, { target: { value: 'follower' } });
    expect(screen.getByRole('button', { name: 'Save permissions' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    expect(await screen.findByText('No permission changes to save.')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('renders an explicit empty state when the catalog has no commands', async () => {
    const request = vi.fn(async () => ({ schemaVersion: 3, version: 4, commands: [] }));
    renderPage({ request });
    expect(await screen.findByText('No chat commands are registered.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save permissions' })).toBeNull();
  });

  it('offers scope-only OAuth consent for an implicit follower default', async () => {
    const request = vi.fn(async () => catalog({ followerScopeReady: false }));
    renderPage({ request });
    await screen.findByRole('heading', { name: 'Available commands' });
    expect(screen.getByRole('button', { name: 'Authorize follower access' })).toBeTruthy();
  });

  it('discards unsaved changes without an API request', async () => {
    const request = vi.fn(async (path) => path === '/api/command-catalog' ? catalog() : {});
    renderPage({ request });
    const selector = await screen.findByRole('combobox', { name: /Minimum audience.*lista/i });
    fireEvent.change(selector, { target: { value: 'subscriber' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('combobox', { name: /Minimum audience.*lista/i }).value).toBe('follower');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
