/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsPageView } from '../../apps/frontend/features/settings/account-settings-page-content.jsx';

afterEach(cleanup);

const COPY = {
  'panel.settings.eyebrow': 'PREFERENCES',
  'panel.settings.title': 'Settings',
  'panel.settings.description': 'Edit account labels used during service.',
  'panel.settings.account_eyebrow': 'CURRENT ACCOUNT',
  'panel.settings.current_section_title': 'During service',
  'panel.settings.current_label': 'Current account label',
  'panel.settings.account_help': 'This label may be associated with a called person.',
  'panel.settings.default_section_title': 'After reset',
  'panel.settings.default_account': 'Default account',
  'panel.settings.default_help': 'Used when automatic account switching is off or reset.',
  'panel.settings.default_account': 'Default account label',
  'panel.settings.save': 'Save',
  'panel.form.cancel': 'Cancel',
  'panel.settings.unsaved': 'Unsaved changes',
  'panel.settings.no_changes': 'All settings are saved.',
  'panel.settings.saved': 'Account label saved.',
  'panel.settings.saved_refresh_failed': 'Saved, but the panel could not refresh. Reload to verify.',
  'panel.settings.invalid': 'Enter a non-empty label of up to 60 characters.',
  'panel.error.generic': 'Could not complete. Try again.',
};
const t = (key) => COPY[key] ?? key;
const account = { label: 'Streamer', defaultLabel: 'Streamer', source: 'default' };

function renderPage({ request = vi.fn(), refresh = vi.fn(async () => true), current = account } = {}) {
  render(<AccountSettingsPageView account={current} t={t} request={request} refresh={refresh} />);
  return { request, refresh };
}

describe('Next account settings page', () => {
  it('shows separate current and default label forms with their usage hints', () => {
    renderPage({ current: { label: 'Asia 2', defaultLabel: 'Streamer', source: 'manual' } });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'During service' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'After reset' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Current account label' }).value).toBe('Asia 2');
    expect(screen.getByRole('textbox', { name: 'Default account label' }).value).toBe('Streamer');
    expect(screen.getByText('This label may be associated with a called person.')).toBeTruthy();
    expect(screen.getByText('Used when automatic account switching is off or reset.')).toBeTruthy();
  });

  it('keeps Save disabled until a label changes and Cancel restores its API-confirmed value', () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Current account label' });
    const save = screen.getAllByRole('button', { name: 'Save' })[0];
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'New account' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(input.value).toBe('Streamer');
    expect(save.disabled).toBe(true);
  });

  it('saves the current account through the existing API and refreshes the shared projection', async () => {
    const next = { label: 'Asia 2', defaultLabel: 'Streamer', source: 'manual' };
    const request = vi.fn().mockResolvedValue(next);
    const refresh = vi.fn(async () => true);
    renderPage({ request, refresh });
    fireEvent.change(screen.getByRole('textbox', { name: 'Current account label' }), { target: { value: ' Asia 2 ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/account', {
      method: 'POST', body: JSON.stringify({ label: 'Asia 2' }),
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(await screen.findByText('Account label saved.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Current account label' }).value).toBe('Asia 2');
  });

  it('saves the default label through its dedicated API and reports an accepted save if refresh fails', async () => {
    const request = vi.fn().mockResolvedValue({ label: 'Streamer', defaultLabel: 'Asia 3', source: 'default' });
    renderPage({ request, refresh: vi.fn(async () => false) });
    fireEvent.change(screen.getByRole('textbox', { name: 'Default account label' }), { target: { value: 'Asia 3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/account/default', {
      method: 'POST', body: JSON.stringify({ label: 'Asia 3' }),
    }));
    expect(await screen.findByText('Saved, but the panel could not refresh. Reload to verify.')).toBeTruthy();
  });

  it('updates the current label when the API confirms the changed default is now active', async () => {
    const request = vi.fn().mockResolvedValue({ label: 'Asia 3', defaultLabel: 'Asia 3', source: 'default' });
    renderPage({ request });
    fireEvent.change(screen.getByRole('textbox', { name: 'Default account label' }), { target: { value: 'Asia 3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: 'Current account label' }).value).toBe('Asia 3');
    expect(screen.getAllByText('All settings are saved.')).toHaveLength(2);
  });

  it('shows localized safe validation feedback without exposing the API exception', async () => {
    const request = vi.fn().mockRejectedValue(Object.assign(new Error('sensitive internal details'), { status: 400 }));
    renderPage({ request });
    fireEvent.change(screen.getByRole('textbox', { name: 'Default account label' }), { target: { value: 'A'.repeat(61) } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a non-empty label of up to 60 characters.');
    expect(screen.queryByText('sensitive internal details')).toBeNull();
  });
});
