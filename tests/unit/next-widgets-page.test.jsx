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
  'panel.widget.source.fixed_text': 'Fixed text',
  'panel.widget.fixed_text_label': 'Widget text field',
  'panel.widget.link.title': 'One-time URL',
  'panel.widget.local_widget_url': 'Widget URL',
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
  'panel.widget.source.help': 'For queue data, choose the specific queue below. Its linked Channel Points reward is included when applicable.',
  'panel.widget.queue_label': 'Queue / linked reward',
  'panel.widget.queue.help': 'This widget reads data from the selected queue.',
  'panel.widget.queue.empty': 'No active queues are available to select.',
  'panel.widget.queue.create': 'Create a queue',
  'panel.widget.queue.create_hint': 'Opens in a new tab so this widget draft stays open.',
  'panel.widget.fallback_label': 'Fallback text when no value is available',
  'panel.widget.appearance': 'Appearance',
  'panel.widget.save': 'Save widget',
  'panel.widget.cancel': 'Cancel',
  'panel.widget.preview_eyebrow': 'SIMULATED PREVIEW',
  'panel.widget.preview_example': 'Widget example',
  'panel.widget.link_eyebrow': 'ONE-TIME LINK',
  'panel.widget.link.copied_once': 'Copy this one-time link now. It will not be shown again after you close this dialog.',
  'panel.widget.link.title': 'One-time widget link',
  'panel.widget.local_widget_url': 'Widget URL',
  'panel.widget.link.copied': 'Link copied.',
  'panel.widget.link.copy_fallback': 'Select and copy the link. It will not be shown again after closing.',
  'panel.widget.copy_link': 'Copy link',
  'panel.widget.link.close_loses': 'Closing clears the URL. If you lose it, generate another one.',
  'panel.widget.close': 'Close',
  'panel.widget.obs_help': 'In OBS: add a Browser source, paste the URL, and set Page Permissions to None.',
  'panel.widget.notice.saved': 'Widget saved.',
  'panel.widget.notice.created': 'Widget created.',
  'panel.widget.notice.revoked': 'Widget link revoked.',
  'panel.widget.notice.deleted': 'Widget deleted.',
  'panel.widget.notice.conflict': 'This widget changed. Review your draft and reload before saving.',
  'panel.widget.notice.error': 'Could not complete. Try again.',
  'panel.widget.notice.reference': 'Reference: {id}',
  'panel.error.reference': 'Reference: {id}',
  'panel.widget.notice.refresh_failed': '{action} was accepted, but the widget list could not refresh. Refresh before repeating this action.',
  'panel.widget.notice.action_created': 'Widget creation',
  'panel.widget.notice.action_saved': 'Widget update',
  'panel.widget.notice.action_revoked': 'Link revocation',
  'panel.widget.notice.action_deleted': 'Widget deletion',
  'panel.widget.notice.conflict_refreshed': 'Latest widget list loaded. Your draft is unchanged; review the current widget before trying again.',
  'panel.widget.notice.conflict_missing': 'This widget is no longer in the list. Your draft is unchanged; close it without saving.',
  'panel.widget.notice.conflict_replaced': 'Latest widget values loaded into the form. Review them, make your changes, then save.',
  'panel.widget.conflict.latest_title': 'Current version on the server',
  'panel.widget.conflict.replace_draft': 'Replace my draft with this version',
  'panel.widget.close_without_saving': 'Close without saving',
  'panel.widget.conflict.refresh': 'Refresh widget list',
  'panel.widget.conflict.refresh_hint': 'Your draft will stay open. Review the latest widget before saving again.',
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
  const fullCatalogs = { 'pt-BR': { 'translation.unavailable': 'Texto indisponível.', ...COPY } };
  render(<WidgetsPageView t={(key, options) => translatePanel(fullCatalogs, 'pt-BR', key, options)} request={request} queues={suppliedQueues} />);
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
    expect([...screen.getByLabelText('What to display').options].some((option) => option.value === 'in_service_viewer_display_name')).toBe(false);
    expect([...screen.getByLabelText('What to display').options].some((option) => option.value === 'in_service_viewer_display_name')).toBe(false);
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
    fireEvent.change(screen.getByLabelText('Widget text field', { selector: 'textarea' }), { target: { value: 'Ready' } });
    fireEvent.change(screen.getByLabelText('Fallback text when no value is available'), { target: { value: 'Offline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/overlay-widgets', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(request.mock.calls.find(([path, options]) => path === '/api/overlay-widgets' && options?.method === 'POST')[1].body);
    expect(body).toMatchObject({ sourceType: 'fixed_text', queueId: null, fixedText: 'Ready', fallbackText: 'Offline', style });
    expect(await screen.findByDisplayValue(secretUrl)).toBeTruthy();
    expect(screen.getByText(/not be shown again after you close/i)).toBeTruthy();
    expect(screen.queryByText(secretUrl)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByDisplayValue(secretUrl)).toBeNull());
    expect(document.body.textContent).not.toContain('one-time-secret');
  });

  it.each(['queue_name', 'queue_state', 'queue_waiting_count'])('keeps %s tied to the selected queue and linked reward', async (sourceType) => {
    const request = vi.fn(async (path, options) => path === '/api/overlay-widgets' && options?.method === 'POST'
      ? { widget: widget({ sourceType: 'queue_name', queueId: 'queue-1' }), capabilityUrl: 'https://localhost/overlay.html#secret' }
      : []);
    renderPage({ request });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.change(screen.getByLabelText('What to display'), { target: { value: sourceType } });
    expect(screen.getByText(/For queue data, choose the specific queue below/)).toBeTruthy();
    expect(screen.getByText('This widget reads data from the selected queue.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Queue / linked reward'), { target: { value: 'queue-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/overlay-widgets', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(request.mock.calls.find(([path, options]) => path === '/api/overlay-widgets' && options?.method === 'POST')[1].body)).toMatchObject({ sourceType, queueId: 'queue-1', fixedText: null });
  });

  it('explains how to get a queue when no active queue or linked reward can be selected', async () => {
    const request = vi.fn(async (path) => path === '/api/overlay-widgets' ? [] : {});
    renderPage({ request, suppliedQueues: [] });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.change(screen.getByLabelText('What to display'), { target: { value: 'queue_name' } });

    expect(screen.getByLabelText('Queue / linked reward').disabled).toBe(true);
    expect(screen.getByText('No active queues are available to select.')).toBeTruthy();
    const createQueueLink = screen.getByRole('link', { name: 'Create a queue' });
    expect(createQueueLink.getAttribute('href')).toBe('/queues/');
    expect(createQueueLink.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('button', { name: 'Save widget' }).disabled).toBe(true);

    fireEvent.submit(document.querySelector('.widget-editor-form'));
    expect(request.mock.calls.some(([path, options]) => path === '/api/overlay-widgets' && options?.method === 'POST')).toBe(false);
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
    fireEvent.change(screen.getByLabelText('Widget text field'), { target: { value: 'Ready now' } });
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

  it('clears the one-time capability when the user clicks outside its dialog', async () => {
    const secretUrl = 'https://localhost/overlay.html#backdrop-secret';
    const active = widget();
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/regenerate') && options?.method === 'POST') return { widget: { ...active, version: 4 }, capabilityUrl: secretUrl };
      if (path === '/api/overlay-widgets') return [active];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByDisplayValue(secretUrl)).toBeTruthy();
    fireEvent.mouseDown(document.querySelector('.widget-secret-backdrop'));
    await waitFor(() => expect(screen.queryByDisplayValue(secretUrl)).toBeNull());
    expect(document.body.textContent).not.toContain('backdrop-secret');
  });

  it('retains the edit draft, shows a diagnostic reference, and offers list refresh on conflict', async () => {
    const existing = widget({ sourceType: 'fixed_text', fixedText: 'Before' });
    const request = vi.fn(async (path, options) => {
      if (path.startsWith('/api/overlay-widgets/') && options?.method === 'PATCH') throw Object.assign(new Error('raw database detail'), { status: 409, referenceId: 'safe-ref-9' });
      if (path === '/api/overlay-widgets') return [existing];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const fixedText = screen.getByLabelText('Widget text field');
    fireEvent.change(fixedText, { target: { value: 'Draft survives' } });
    let listReads = 0;
    request.mockImplementation(async (path, options) => {
      if (path.startsWith('/api/overlay-widgets/') && options?.method === 'PATCH') throw Object.assign(new Error('raw database detail'), { status: 409, referenceId: 'safe-ref-9' });
      if (path === '/api/overlay-widgets') {
        listReads += 1;
        return listReads > 0 ? [widget({ ...existing, version: 4, fixedText: 'External' })] : [existing];
      }
      return {};
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    expect(await screen.findByText(/widget changed/i)).toBeTruthy();
    expect(screen.getByLabelText('Widget text field').value).toBe('Draft survives');
    expect(await screen.findByText('Reference: safe-ref-9')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh widget list' }));
    expect(await screen.findByText(/Latest widget list loaded/)).toBeTruthy();
    expect(screen.getByLabelText('Widget text field').value).toBe('Draft survives');
    expect(screen.getAllByText('External')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Replace my draft with this version' }));
    expect(screen.getByLabelText('Widget text field').value).toBe('External');
    expect(screen.getByText(/Latest widget values loaded/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Widget text field'), { target: { value: 'Reviewed update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/overlay-widgets/${existing.id}`, expect.objectContaining({ method: 'PATCH' })));
    const patchCalls = request.mock.calls.filter(([candidate, options]) => candidate.endsWith(existing.id) && options?.method === 'PATCH');
    expect(JSON.parse(patchCalls.at(-1)[1].body)).toMatchObject({ expectedVersion: 4, changes: { fixedText: 'Reviewed update' } });
    expect(screen.queryByText('raw database detail')).toBeNull();
  });

  it('keeps accepted create feedback distinct when the widget projection refresh fails', async () => {
    let widgetListReads = 0;
    const request = vi.fn(async (path, options) => {
      if (path === '/api/overlay-widgets' && options?.method === 'POST') return { widget: widget({ fixedText: 'Ready' }), capabilityUrl: 'https://localhost/overlay.html#one-time' };
      if (path === '/api/overlay-widgets' && ++widgetListReads > 1) throw Object.assign(new Error('read failed'), { referenceId: 'refresh-ref-1' });
      return [];
    });
    renderPage({ request });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.submit(document.querySelector('.widget-editor-form'));
    expect(await screen.findByDisplayValue('https://localhost/overlay.html#one-time')).toBeTruthy();
    expect(await screen.findByText(/Widget creation was accepted, but the widget list could not refresh/)).toBeTruthy();
    expect(await screen.findByText('Reference: refresh-ref-1')).toBeTruthy();
  });

  it('blocks saving an edit after refresh confirms the widget was removed', async () => {
    const existing = widget({ sourceType: 'fixed_text', fixedText: 'Before' });
    let listReads = 0;
    const request = vi.fn(async (path, options) => {
      if (path.startsWith('/api/overlay-widgets/') && options?.method === 'PATCH') throw Object.assign(new Error('conflict'), { status: 409, referenceId: 'removed-ref-2' });
      if (path === '/api/overlay-widgets') return listReads++ === 0 ? [existing] : [];
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Widget text field'), { target: { value: 'Local draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
    expect(await screen.findByText(/widget changed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh widget list' }));
    expect(await screen.findByText(/no longer in the list/i)).toBeTruthy();
    expect(screen.getByLabelText('Widget text field').value).toBe('Local draft');
    expect(screen.getByRole('button', { name: 'Save widget' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Close without saving' })).toBeTruthy();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  });

  it('shows safe diagnostic reference for list load failure', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('raw storage detail'), { referenceId: 'widget-ref-1' }); });
    renderPage({ request });
    expect(await screen.findByText('Reference: widget-ref-1')).toBeTruthy();
    expect(screen.queryByText('raw storage detail')).toBeNull();
  });
});
