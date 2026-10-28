/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WidgetsPageView } from '../../apps/frontend/features/widgets/widgets-page-content.jsx';
import { translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';
import { installDialogStub } from './helpers/dialog-stub.mjs';

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(globalThis.navigator, 'clipboard'); });
beforeAll(installDialogStub);

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
  'panel.widget.link.title': 'Copy this link to OBS',
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
  'panel.widget.local_widget_url': 'Widget URL',
  'panel.widget.link.copied': 'Link copied.',
  'panel.widget.link.copy_fallback': 'Couldn’t copy automatically. Show the link, select it and copy it before closing — it won’t be shown again.',
  'panel.widget.link_lifetime_help': 'The link cannot be viewed again after this dialog closes. If you lose it, generate a new link; the previous one will be invalidated.',
  'panel.widget.link.done': 'Done, I copied the link',
  'panel.widget.link.show': 'Show link',
  'panel.widget.link.hide': 'Hide link',
  'panel.widget.link.hidden_label': 'Link hidden',
  'panel.widget.link.confirm_close.title': 'Close without copying the link?',
  'panel.widget.link.confirm_close.body': 'This link can’t be shown again. To use this widget later, generate a new link on its card — this link will then stop working.',
  'panel.widget.link.confirm_close.back': 'Back to the link',
  'panel.widget.link.confirm_close.confirm': 'Close anyway',
  'panel.widget.notice.link_closed_uncopied': 'Link closed without copying. Use “Regenerate link” on the widget card when you need it.',
  'panel.widget.copy_link': 'Copy link',
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
    const secretUrl = 'https://localhost:3000/overlay?ref=widget-ref#one-time-secret';
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
    const dialog = await screen.findByRole('dialog', { name: 'Copy this link to OBS' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toMatch(/cannot be viewed again/);
    expect(document.body.innerHTML).not.toContain('one-time-secret');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show link' }));
    expect(screen.getByDisplayValue(secretUrl)).toBeTruthy();
    expect(screen.queryByText(secretUrl)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied the link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    await waitFor(() => expect(screen.queryByDisplayValue(secretUrl)).toBeNull());
    expect(document.body.innerHTML).not.toContain('one-time-secret');
  });

  it.each(['queue_name', 'queue_state', 'queue_waiting_count'])('keeps %s tied to the selected queue and linked reward', async (sourceType) => {
    const request = vi.fn(async (path, options) => path === '/api/overlay-widgets' && options?.method === 'POST'
      ? { widget: widget({ sourceType: 'queue_name', queueId: 'queue-1' }), capabilityUrl: 'https://localhost/overlay#secret' }
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

  it('closes the regenerate confirmation before opening the masked link dialog and returns focus to the card', async () => {
    const active = widget();
    const secretUrl = 'https://localhost/overlay#replacement-secret';
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
    expect(JSON.parse(request.mock.calls.find(([path]) => path.endsWith('/regenerate'))[1].body)).toEqual({ expectedVersion: 3 });
    await screen.findByRole('dialog', { name: 'Copy this link to OBS' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement.textContent).toBe('Copy link');
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied the link' }));
    expect(await screen.findByRole('dialog', { name: 'Close without copying the link?' })).toBeTruthy();
    expect(document.activeElement.textContent).toBe('Back to the link');
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/Link closed without copying/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole('article')).getByRole('button', { name: 'Regenerate link' })));
    expect(document.body.innerHTML).not.toContain('replacement-secret');
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
      if (path === '/api/overlay-widgets' && options?.method === 'POST') return { widget: widget({ fixedText: 'Ready' }), capabilityUrl: 'https://localhost/overlay#one-time' };
      if (path === '/api/overlay-widgets' && ++widgetListReads > 1) throw Object.assign(new Error('read failed'), { referenceId: 'refresh-ref-1' });
      return [];
    });
    renderPage({ request });
    await screen.findByText('No widgets created');
    fireEvent.click(screen.getByRole('button', { name: 'Create your first widget' }));
    fireEvent.submit(document.querySelector('.widget-editor-form'));
    fireEvent.click(await screen.findByRole('button', { name: 'Show link' }));
    expect(screen.getByDisplayValue('https://localhost/overlay#one-time')).toBeTruthy();
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

describe('one-time widget link dialog guards (jsdom stub, not browser evidence)', () => {
  const secretUrl = 'https://localhost/overlay?ref=r1#guarded-secret-value';
  const active = widget();

  async function openLink({ list = [active] } = {}) {
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/regenerate') && options?.method === 'POST') return { widget: { ...active, version: 4 }, capabilityUrl: secretUrl };
      if (path === '/api/overlay-widgets' && options?.method === 'POST') return { widget: widget({ id: 'abcdef12-1234-4234-8234-123456789abc' }), capabilityUrl: secretUrl };
      if (path === '/api/overlay-widgets') return list;
      return {};
    });
    renderPage({ request });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Copy this link to OBS' });
    return { dialog, request };
  }
  const nativeDialog = () => document.querySelector('dialog.widget-link-dialog');
  const secretLeaks = () => document.body.innerHTML.includes('guarded-secret-value');

  it('uses a guarded native modal dialog with closedby=none and no backdrop dismissal', async () => {
    const { dialog } = await openLink();
    expect(nativeDialog()).toBe(dialog);
    expect(dialog.getAttribute('closedby')).toBe('none');
    fireEvent.mouseDown(dialog); fireEvent.click(dialog);
    fireEvent.mouseDown(document.body); fireEvent.click(document.body);
    expect(screen.getByRole('dialog', { name: 'Copy this link to OBS' })).toBeTruthy();
  });

  it('routes Escape keydown and cancelable cancel to the confirm view without dropping the link', async () => {
    const { dialog } = await openLink();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Close without copying the link?' })).toBeTruthy();
    expect(screen.getByText(/can’t be shown again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the link' }));
    expect(screen.getByRole('dialog', { name: 'Copy this link to OBS' })).toBeTruthy();
    expect(document.activeElement.textContent).toBe('Copy link');
    const cancel = new Event('cancel', { cancelable: true });
    nativeDialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Close without copying the link?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show link' }));
    expect(screen.getByDisplayValue(secretUrl)).toBeTruthy();
  });

  it('reopens in the confirm view when the browser closes the dialog after a non-cancelable cancel', async () => {
    await openLink();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    nativeDialog().dispatchEvent(new Event('cancel', { cancelable: false }));
    nativeDialog().close();
    expect(showModal).toHaveBeenCalled();
    expect(nativeDialog().hasAttribute('open')).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Close without copying the link?' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement.textContent).toBe('Back to the link'));
  });

  it('copies with status feedback, then Done closes directly and focus returns to the card', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { dialog } = await openLink();
    const status = within(dialog).getByRole('status');
    const alert = within(dialog).getByRole('alert');
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(secretUrl);
    await waitFor(() => expect(status.textContent).toBe('Link copied.'));
    expect(secretLeaks()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied the link' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Link closed without copying/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole('article')).getByRole('button', { name: 'Regenerate link' })));
  });

  it('after copying, Escape closes like Done', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    const { dialog } = await openLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toBe('Link copied.'));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    ['rejected', () => ({ writeText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) })],
    ['unavailable', () => undefined],
  ])('shows the fallback alert when the clipboard is %s and Done still requires confirmation', async (_label, clipboard) => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: clipboard(), configurable: true });
    const { dialog } = await openLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/Couldn’t copy automatically/));
    expect(within(dialog).getByRole('status').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied the link' }));
    expect(await screen.findByRole('dialog', { name: 'Close without copying the link?' })).toBeTruthy();
  });

  it('keeps the secret out of the DOM, attributes and live regions while masked', async () => {
    const { dialog } = await openLink();
    expect(secretLeaks()).toBe(false);
    expect(within(dialog).getByText('Link hidden')).toBeTruthy();
    const toggle = within(dialog).getByRole('button', { name: 'Show link' });
    fireEvent.click(toggle);
    const input = screen.getByDisplayValue(secretUrl);
    expect(input.getAttribute('type')).toBe('text');
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(input.closest('form')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (element === input && attribute.name === 'value') continue;
        expect(attribute.value).not.toContain('guarded-secret-value');
      }
    }
    for (const region of document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')) expect(region.textContent).not.toContain('guarded-secret-value');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide link' }));
    expect(screen.queryByDisplayValue(secretUrl)).toBeNull();
    expect(secretLeaks()).toBe(false);
  });

  it('never logs or persists the secret', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    const { dialog } = await openLink();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show link' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).not.toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Done, I copied the link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('guarded-secret-value');
    expect(setItem).not.toHaveBeenCalled();
    expect(globalThis.location.href).not.toContain('guarded-secret-value');
    expect(secretLeaks()).toBe(false);
  });

  it('guards unload only while the link is uncopied', async () => {
    const add = vi.spyOn(globalThis, 'addEventListener');
    const remove = vi.spyOn(globalThis, 'removeEventListener');
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    const { dialog } = await openLink();
    const handler = add.mock.calls.find(([type]) => type === 'beforeunload')?.[1];
    expect(handler).toBeTypeOf('function');
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(remove.mock.calls.some(([type, fn]) => type === 'beforeunload' && fn === handler)).toBe(true));
  });

  it('returns focus to the new card Edit button after a copied create', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    const created = widget({ id: 'abcdef12-1234-4234-8234-123456789abc', sourceType: 'fixed_text', fixedText: 'New' });
    let listReads = 0;
    const request = vi.fn(async (path, options) => {
      if (path === '/api/overlay-widgets' && options?.method === 'POST') return { widget: created, capabilityUrl: secretUrl };
      if (path === '/api/overlay-widgets') return listReads++ === 0 ? [] : [created];
      return {};
    });
    renderPage({ request });
    fireEvent.click(await screen.findByRole('button', { name: 'Create your first widget' }));
    fireEvent.submit(document.querySelector('.widget-editor-form'));
    const dialog = await screen.findByRole('dialog', { name: 'Copy this link to OBS' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toBe('Link copied.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done, I copied the link' }));
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole('article')).getByRole('button', { name: 'Edit' })));
  });
});
