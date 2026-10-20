/** @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QueueSettingsForm from '../../apps/frontend/features/queues/queue-settings-form.jsx';
import { translateCatalog } from '../../apps/shared/browser/translate-catalog.mjs';
import { PANEL_PLACEHOLDERS } from '../../apps/web/panel-catalog.mjs';

const COPY = {
  'panel.queue.action.configure': 'Configure queue',
  'panel.queue_settings.title': 'Settings for queue: {title}',
  'panel.queue_settings.call_deadline': 'Call timeout',
  'panel.queue_settings.call_message': 'Call message',
  'panel.queue_settings.call_message_default': '{user}, your turn! Use {command} to confirm your presence.',
  'panel.command.syntax.queue_presente': '!<queue> present',
  'panel.queue_settings.call_placeholders': 'Accepted values: {user}, {queue}, {position}, {uid}, {account}',
  'panel.queue_settings.show_uid_list': 'Show UID in chat list',
  'panel.queue_settings.show_uid_overlay': 'Show UID in overlay',
  'panel.queue_settings.show_uid_call': 'Show UID when called',
  'panel.queue_settings.refund_removed': 'Refund when removed',
  'panel.queue_settings.refund_no_show': 'Refund on no-show',
  'panel.queue_settings.refund_viewer_leave': 'Refund when viewer leaves',
  'panel.queue_settings.uid_policy_hint': 'UID privacy policy',
  'panel.queue_settings.section_attendance': 'Call and attendance',
  'panel.queue_settings.section_privacy': 'Viewer UID privacy',
  'panel.queue_settings.section_points': 'Account and points policies',
  'panel.queue_settings.unsaved': 'Unsaved changes',
  'panel.queue_settings.no_changes': 'All settings are saved.',
  'panel.queue_settings.save': 'Save settings',
  'panel.form.cancel': 'Cancel',
};
const t = (key, options) => translateCatalog({ en: COPY }, 'en', key, {
  ...options,
  placeholders: PANEL_PLACEHOLDERS,
});

function queue(version, values = {}) {
  return {
    id: 'queue-1', version, title: 'Arena', callTimeoutMin: 10, callMessage: 'Original message',
    showUidInList: false, showUidInOverlay: false, showUidOnCall: false,
    refundIfRemovedWhileCalled: false, refundOnNoShow: false, refundIfViewerLeavesCalled: false,
    ...values,
  };
}

describe('Next queue settings form', () => {
  it('uses the localized default with the queue-specific presence command when no message is saved', async () => {
    const view = render(React.createElement(QueueSettingsForm, {
      queue: queue(3, { slug: 'arena', callMessage: null }), t, saving: false, feedback: null, onSave: vi.fn(),
    }));
    fireEvent.click(screen.getByText('Configure queue'));
    expect(screen.queryByText('Switch account on call')).toBeNull();

    expect(screen.getByRole('textbox', { name: /Call message/ }).value)
      .toBe('{user}, your turn! Use “!arena present” to confirm your presence.');
    view.unmount();
  });

  it('preserves an unsaved draft across a queue revision and resets to the newest projection on cancel', async () => {
    const onSave = vi.fn(async () => true);
    const initialQueue = queue(3);
    const view = render(React.createElement(QueueSettingsForm, {
      queue: initialQueue, t, saving: false, feedback: null, onSave,
    }));

    fireEvent.click(screen.getByText('Configure queue'));
    expect(screen.getByText('Accepted values: {user}, {queue}, {position}, {uid}, {account}')).toBeTruthy();
    const message = screen.getByRole('textbox', { name: /Call message/ });
    fireEvent.change(message, { target: { value: 'Draft kept by operator' } });
    expect(screen.getByRole('textbox', { name: /Call message/ }).value).toBe('Draft kept by operator');
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

    view.rerender(React.createElement(QueueSettingsForm, {
      queue: queue(4, { callMessage: 'Updated elsewhere' }),
      t, saving: false, feedback: null, onSave,
    }));

    expect(screen.getByRole('textbox', { name: /Call message/ }).value).toBe('Draft kept by operator');
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Call message/ }).value).toBe('Updated elsewhere'));
    expect(screen.queryByLabelText('Switch account on call')).toBeNull();
    expect(screen.getByText('All settings are saved.')).toBeTruthy();
  });
});
