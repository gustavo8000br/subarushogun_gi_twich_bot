/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetsPageView } from '../../apps/frontend/features/widgets/widgets-page-content.jsx';
import { translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';

afterEach(cleanup);

const COPY = {
  'panel.widgets.eyebrow': 'STREAM SOURCES',
  'panel.widgets.title': 'OBS widgets',
  'panel.widgets.description': 'Each widget shows one data point in OBS through a local HTTPS connection.',
  'panel.widgets.create': 'Create widget',
  'panel.widgets.list_title': 'Independent sources',
  'panel.widgets.loading': 'Loading widgets…',
  'panel.widgets.load_failed': 'Could not load widgets.',
  'panel.widgets.refresh': 'Try again',
  'panel.widgets.link_help': 'The link is shown once when created or regenerated.',
  'panel.widget.empty.title': 'No widgets created',
  'panel.widget.empty.hint': 'Create a source with one piece of stream data to add it to OBS.',
  'panel.widget.create_first': 'Create your first widget',
  'panel.widget.source.account': 'Current account',
  'panel.widget.source.queue_name': 'Queue name',
  'panel.widget.source.queue_state': 'Whether a queue is open or closed',
  'panel.widget.source.queue_count': 'Number waiting in a queue',
  'panel.widget.source.called_name': 'Called person',
  'panel.widget.source.called_position': 'Called person’s original position',
  'panel.widget.source.service_name': 'Person in service',
  'panel.widget.source.fixed_text': 'Fixed text',
  'panel.widget.preview.account': 'Sample account',
  'panel.widget.preview.queue': 'Sample queue',
  'panel.widget.status.active': 'Link active',
  'panel.widget.status.revoked': 'Revoked',
  'panel.widget.status.unavailable': 'Widget unavailable',
  'panel.widget.card_details': '{queue}{width} × {height} · Widget {id}',
  'panel.widget.auto': 'auto',
  'panel.widget.action.edit': 'Edit',
  'panel.widget.action.regenerate': 'Regenerate link',
  'panel.widget.action.revoke': 'Revoke',
  'panel.widget.action.generate': 'Generate link',
  'panel.widget.action.delete': 'Delete',
  'panel.widget.confirm.regenerate': 'The current link will stop working. Generate a new link now?',
  'panel.widget.confirm.revoke': 'The OBS source will stop receiving data. Revoke this link?',
  'panel.widget.confirm.delete': 'Delete this widget? Its current URL will be invalidated and cannot be recovered.',
  'panel.widget.editor.create': 'Create widget',
  'panel.widget.editor.edit': 'Edit widget',
  'panel.widget.source_label': 'What to display',
  'panel.widget.queue_label': 'Queue',
  'panel.widget.fixed_text_label': 'Fixed text',
  'panel.widget.fallback_label': 'Fallback text when no value is available',
  'panel.widget.appearance': 'Appearance',
  'panel.widget.save': 'Save widget',
  'panel.widget.cancel': 'Cancel',
  'panel.widget.preview_eyebrow': 'SIMULATED PREVIEW',
  'panel.widget.preview_example': 'Widget example',
  'panel.widget.link_eyebrow': 'ONE-TIME LINK',
  'panel.widget.link.copied_once': 'Copy it now. The link will not be shown again.',
  'panel.widget.link.copied': 'Link copied.',
  'panel.widget.link.copy_fallback': 'Select and copy the link. It will not be shown again after closing.',
  'panel.widget.copy_link': 'Copy link',
  'panel.widget.link.close_loses': 'Closing will clear this link. If you lose it, generate another one.',
  'panel.widget.close': 'Close',
  'panel.widget.obs_help': 'In OBS: add a Browser source, paste the URL, and set Page Permissions to None.',
  'panel.widget.notice.saved': 'Widget saved.',
  'panel.widget.notice.created': 'Widget created.',
  'panel.widget.notice.revoked': 'Widget link revoked.',
  'panel.widget.notice.deleted': 'Widget deleted.',
  'panel.widget.notice.conflict': 'This widget changed. Review your draft and reload before saving.',
  'panel.widget.notice.error': 'Could not complete. Try again.',
  'panel.dialog.confirm': 'Confirm',
  'panel.dialog.cancel': 'Cancel',
  'panel.error.generic': 'Could not complete. Try again.',
};

const t = (key, options = {}) => translatePanel({ 'pt-BR': COPY }, 'pt-BR', key, options);
const style = {
  textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui', fontSize: 32,
  fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0,
  shadowOffsetY: 0, width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
};
const widget = (overrides = {}) => ({
  id: '12345678-1234-4234-8234-123456789abc', sourceType: 'account_label', queueId: null, fixedText: null,
  fallbackText: 'Offline', style, version: 3, capabilityVersion: 1, capabilityActive: true, deleted: false, ...overrides,
});
const queues = [{ id: 'queue-1', title: 'Test queue', slug: 'test', isOpen: true, isDeleted: false }];

function renderPage({ request = vi.fn(async (path) => path === '/api/overlay-widgets' ? [] : {}), suppliedQueues = queues } = {}) {
  render(<WidgetsPageView t={t} request={request} queues={suppliedQueues} />);
  return { request };
}

describe('Next OBS widget management page', () => {
  it('shows the empty state and opens an editor with local OBS guidance', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'OBS widgets' })).toBeTruthy();
    expect(screen.getByText('No widgets created')).toBeTruthy();
    expect(document.querySelector('.widget-empty-state')).toBeTruthy();
    expect(screen.getByText(/Page Permissions to None/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    expect(screen.getByRole('heading', { name: 'Create widget' })).toBeTruthy();
    expect(screen.getByLabelText('What to display')).toBeTruthy();
    expect(screen.getByText('Sample account')).toBeTruthy();
  });

  it('creates with the existing payload contract and exposes the capability only in the one-time dialog', async () => {
    const secretUrl = 'https://localhost:3000/overlay.html?ref=widget-ref#one-time-secret';
    const request = vi.fn(async (path, options) => path === '/api/overlay-widgets' && options?.method === 'POST'
      ? { widget: widget({ fixedText: 'Ready' }), capabilityUrl: secretUrl }
      : path === '/api/overlay-widgets' ? [] : {});
    renderPage({ request });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.change(screen.getByLabelText('What to display'), { target: { value: 'fixed_text' } });
    fireEvent.change(screen.getByLabelText('Fixed text'), { target: { value: 'Ready' } });
    fireEvent.change(screen.getByLabelText('Fallback text when no value is available'), { target: { value: 'Offline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/overlay-widgets', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(request.mock.calls.find(([path, options]) => path === '/api/overlay-widgets' && options?.method === 'POST')[1].body);
    expect(body).toMatchObject({ sourceType: 'fixed_text', queueId: null, fixedText: 'Ready', fallbackText: 'Offline', style });
    expect(await screen.findByDisplayValue(secretUrl)).toBeTruthy();
    expect(screen.getByText(/link will not be shown again/i)).toBeTruthy();
    expect(screen.queryByText(secretUrl)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByDisplayValue(secretUrl)).toBeNull());
    expect(document.body.textContent).not.toContain('one-time-secret');
  });

  it('keeps a queue-scoped source tied to the selected queue', async () => {
    const request = vi.fn(async (path, options) => path === '/api/overlay-widgets' && options?.method === 'POST'
      ? { widget: widget({ sourceType: 'queue_name', queueId: 'queue-1' }), capabilityUrl: 'https://localhost/overlay.html#secret' }
      : []);
    renderPage({ request });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.change(screen.getByLabelText('What to display'), { target: { value: 'queue_name' } });
    expect(screen.getByLabelText('Queue')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Queue'), { target: { value: 'queue-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/overlay-widgets', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(request.mock.calls.find(([path, options]) => path === '/api/overlay-widgets' && options?.method === 'POST')[1].body)).toMatchObject({ sourceType: 'queue_name', queueId: 'queue-1', fixedText: null });
  });

  it('edits an existing widget with its expected version without rotating the one-time link', async () => {
    const existing = widget({ sourceType: 'fixed_text', fixedText: 'Ready' });
    const request = vi.fn(async (path, options) => {
      if (path === '/api/overlay-widgets' && options?.method === 'PATCH') return existing;
      if (path === '/api/overlay-widgets') return [existing];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Fixed text'), { target: { value: 'Ready now' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/overlay-widgets/${existing.id}`, expect.objectContaining({ method: 'PATCH' })));
    const [path, options] = request.mock.calls.find(([candidate, opts]) => candidate.endsWith(existing.id) && opts?.method === 'PATCH');
    expect(JSON.parse(options.body)).toMatchObject({ expectedVersion: 3, changes: { sourceType: 'fixed_text', fixedText: 'Ready now' } });
    expect(screen.queryByRole('dialog', { name: /ONE-TIME LINK/i })).toBeNull();
  });

  it('requires confirmation before regenerating an active capability and clears it when closed', async () => {
    const active = widget();
    const secretUrl = 'https://localhost/overlay.html#replacement-secret';
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/regenerate') && options?.method === 'POST') return { widget: { ...active, version: 4 }, capabilityUrl: secretUrl };
      if (path === '/api/overlay-widgets') return [active];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Regenerate link' }));
    expect(await screen.findByText(/current link will stop working/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/overlay-widgets/${active.id}/regenerate`, expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(request.mock.calls.find(([path, options]) => path.endsWith('/regenerate'))[1].body)).toEqual({ expectedVersion: 3 });
    expect(await screen.findByDisplayValue(secretUrl)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByDisplayValue(secretUrl)).toBeNull());
  });

  it('retains the edit draft and reports a safe conflict when the widget revision changes', async () => {
    const existing = widget({ sourceType: 'fixed_text', fixedText: 'Before' });
    const request = vi.fn(async (path, options) => {
      if (path.startsWith('/api/overlay-widgets/') && options?.method === 'PATCH') throw Object.assign(new Error('raw database detail'), { status: 409 });
      if (path === '/api/overlay-widgets') return [existing];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const fixedText = screen.getByLabelText('Fixed text');
    fireEvent.change(fixedText, { target: { value: 'Draft survives' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    expect(await screen.findByText(/widget changed/i)).toBeTruthy();
    expect(screen.getByLabelText('Fixed text').value).toBe('Draft survives');
    expect(screen.queryByText('raw database detail')).toBeNull();
  });
});
