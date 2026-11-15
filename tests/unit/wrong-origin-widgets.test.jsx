/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WidgetsPageView } from '../../apps/frontend/features/widgets/widgets-page-content.jsx';
import { installDialogStub } from './helpers/dialog-stub.mjs';

// OPS-15 D-3: a widget action refused for its origin (403 ORIGIN_NOT_ALLOWED) shows the wrong-host message inside
// the dialog the person is looking at; at localhost the generic text stays.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeAll(installDialogStub);

const COPY = {
  'panel.widget.create_first': 'Create first', 'panel.widget.save': 'Save widget', 'panel.widget.notice.error': 'GENERIC-WIDGET-ERROR',
  'panel.error.wrong_host': 'The session is not valid at {host}. This panel only works at localhost.', 'panel.error.wrong_host_action': 'Open {url}',
};
const t = (key, options = {}) => (COPY[key] ?? key).replace(/\{([a-z]+)\}/g, (_, name) => String(options.values?.[name] ?? `{${name}}`));
const setLocation = (hostname) => vi.stubGlobal('location', { protocol: 'https:', hostname, port: '3000', pathname: '/widgets/', search: '', hash: '' });
const refusal = (extra) => Object.assign(new Error('The request could not be completed.'), { status: 403, ...extra });

async function save(error) {
  const request = vi.fn(async (path, init) => {
    if (init?.method === 'POST') throw error;
    return path === '/api/overlay-widgets' ? [] : {};
  });
  render(<WidgetsPageView t={t} request={request} queues={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create first' }));
  fireEvent.change(document.querySelector('select[name="sourceType"]'), { target: { name: 'sourceType', value: 'fixed_text' } });
  fireEvent.change(document.querySelector('textarea[name="fixedText"]'), { target: { name: 'fixedText', value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save widget' }));
  return waitFor(() => { const card = document.querySelector('.widget-editor-dialog .error-card, form .error-card, .error-card'); expect(card).not.toBeNull(); return card; });
}

describe('widget save refused for its origin', () => {
  it('shows the wrong-host message and the localhost link at 127.0.0.1', async () => {
    setLocation('127.0.0.1');
    const card = await save(refusal({ code: 'ORIGIN_NOT_ALLOWED' }));
    expect(card.textContent).toContain('The session is not valid at 127.0.0.1. This panel only works at localhost.');
    expect(card.textContent).not.toContain('GENERIC-WIDGET-ERROR');
    expect(card.querySelector('a').getAttribute('href')).toBe('https://localhost:3000/widgets/');
  });

  it('keeps the generic text at localhost', async () => {
    setLocation('localhost');
    const card = await save(refusal({ code: 'ORIGIN_NOT_ALLOWED' }));
    expect(card.textContent).toContain('GENERIC-WIDGET-ERROR');
    expect(card.querySelector('a')).toBeNull();
  });

  it('keeps the generic text for another 403 at 127.0.0.1', async () => {
    setLocation('127.0.0.1');
    const card = await save(refusal({ code: 'REQUEST_FAILED' }));
    expect(card.textContent).toContain('GENERIC-WIDGET-ERROR');
    expect(card.querySelector('a')).toBeNull();
  });
});
