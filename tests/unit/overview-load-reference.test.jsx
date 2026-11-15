// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import { loadFailureReferenceId, safeReferenceId } from '../../apps/frontend/features/panel-shell/safe-reference-id.mjs';
import { PANEL_PLACEHOLDERS } from '../../apps/shared/panel/panel-catalog.mjs';
import { apiClient } from '../../apps/frontend/lib/api/client.mjs';
import { readFileSync } from 'node:fs';

// E7 (OPS-15, ux-plan-e7-reference-id): the overview load failure shows the server-made referenceId, only for a 5xx.
vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { initializeSession: vi.fn(), request: vi.fn() },
}));

const COPY = {
  'panel.accessibility.skip_to_content': 'Skip', 'panel.sidebar.title': 'Panel', 'panel.navigation.label': 'Nav',
  'panel.navigation.overview': 'Overview', 'panel.navigation.queues': 'Queues', 'panel.navigation.new_queue': 'New queue',
  'panel.navigation.operations': 'Operations', 'panel.navigation.commands': 'Commands', 'panel.navigation.widgets': 'Widgets',
  'panel.navigation.settings': 'Settings', 'panel.navigation.connection': 'Connection',
  'panel.health.database.checking': 'Checking',
  'panel.error.local_load': 'GENERIC-LOCAL-LOAD',
  'panel.error.read_timeout': 'READ-TIMEOUT',
  'panel.error.wrong_host': 'The session is not valid at {host}. This panel only works at localhost.',
  'panel.error.wrong_host_action': 'Open {url}',
  'panel.error.reference': 'Referência: {id}',
  'panel.error.reference_copy': 'Copiar referência',
  'panel.error.reference_copied': 'Referência copiada',
  'panel.error.reference_copy_failed': 'Falha ao copiar',
};

function setLocation(parts) {
  vi.stubGlobal('location', { protocol: 'https:', hostname: 'localhost', port: '3000', pathname: '/', search: '', hash: '', ...parts });
}
function renderFailing(rejection) {
  apiClient.initializeSession.mockResolvedValue(undefined);
  apiClient.request.mockRejectedValue(rejection);
  return render(<PanelShell fallbackCatalog={{ 'pt-BR': COPY }} />);
}
const errorCard = () => waitFor(() => {
  const card = document.querySelector('.error-card[role="alert"]');
  expect(card).not.toBeNull();
  return card;
});
const serverError = (extra = {}) => Object.assign(new Error('private server copy'), { status: 500, code: 'INTERNAL_ERROR', referenceId: 'overview-ref-9', ...extra });

beforeEach(() => { vi.clearAllMocks(); setLocation({}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('safeReferenceId (AC-E7.1)', () => {
  it.each(['overview-ref-9', 'a.b_c-1', 'x'.repeat(64)])('accepts %s', (id) => {
    expect(safeReferenceId({ referenceId: id })).toBe(id);
  });
  it.each(['x'.repeat(65), '', 'with space', '<script>', 'https://evil.example/x', 12345, null, undefined])('rejects %j', (id) => {
    expect(safeReferenceId({ referenceId: id })).toBeNull();
  });
  it('rejects a missing error', () => {
    expect(safeReferenceId(null)).toBeNull();
    expect(safeReferenceId(undefined)).toBeNull();
  });
  it('load rule: only a 5xx server answer carries an id', () => {
    expect(loadFailureReferenceId({ status: 500, referenceId: 'r1' })).toBe('r1');
    expect(loadFailureReferenceId({ status: 503, referenceId: 'r1' })).toBe('r1');
    expect(loadFailureReferenceId({ status: 0, referenceId: 'r1' })).toBeNull();
    expect(loadFailureReferenceId({ status: 401, referenceId: 'r1' })).toBeNull();
    expect(loadFailureReferenceId({ status: 500, timedOut: true, referenceId: 'r1' })).toBeNull();
  });
});

describe('overview load failure shows the reference (AC-E7.2, AC-E7.10)', () => {
  it('renders the message, the id inside <code> and the copy button inside the role="alert" card', async () => {
    renderFailing(serverError());
    const card = await errorCard();
    expect(card.textContent).toContain('GENERIC-LOCAL-LOAD');
    expect(card.textContent).toContain('Referência: overview-ref-9');
    expect(card.querySelector('code').textContent).toBe('overview-ref-9');
    const button = [...card.querySelectorAll('button')].find((item) => item.textContent === 'Copiar referência');
    expect(button).toBeTruthy();
    expect(button.getAttribute('type')).toBe('button');
  });

  it('renders no reference line and no button after a successful load', async () => {
    apiClient.initializeSession.mockResolvedValue(undefined);
    apiClient.request.mockImplementation(async (path) => {
      if (path === '/api/localization/catalogs') return { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': COPY } } } };
      if (path === '/api/state') return { product_version: '0.4.0-beta', account: { label: 'S' }, pending_operations: [], product_locale: { locale: 'pt-BR', revision: 1 } };
      if (path === '/api/queues') return [];
      return {};
    });
    render(<PanelShell fallbackCatalog={{ 'pt-BR': COPY }} />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.reference-line')).toBeNull();
    expect(document.querySelector('.error-card[role="alert"]')).toBeNull();
  });
});

describe('no id for failures without a server answer (AC-E7.3)', () => {
  it.each([
    ['timeout', Object.assign(new Error('t'), { timedOut: true, status: 0, referenceId: 'overview-ref-9' })],
    ['network failure', Object.assign(new Error('n'), { status: 0, referenceId: 'overview-ref-9' })],
    ['invalid id', serverError({ referenceId: '<script>alert(1)</script>' })],
    ['no id', serverError({ referenceId: undefined })],
    ['4xx', serverError({ status: 401 })],
  ])('%s', async (_name, rejection) => {
    renderFailing(rejection);
    const card = await errorCard();
    expect(card.querySelector('.reference-line')).toBeNull();
    expect(card.querySelector('code')).toBeNull();
    expect(card.querySelector('button')).toBeNull();
    expect(card.textContent).not.toContain('overview-ref-9');
  });

  it('no id at host 127.0.0.1 (wrong host keeps its own message)', async () => {
    setLocation({ hostname: '127.0.0.1' });
    renderFailing(serverError());
    const card = await errorCard();
    expect(card.textContent).toContain('127.0.0.1');
    expect(card.querySelector('.reference-line')).toBeNull();
    expect(card.querySelector('button')).toBeNull();
  });
});

describe('copy behavior (AC-E7.4, AC-E7.5)', () => {
  const regions = (card) => ({
    status: card.querySelector('[role="status"]'),
    alert: card.querySelector('.reference-line [role="alert"]'),
    button: card.querySelector('.reference-line button'),
  });

  it('has both live regions in the DOM before the click, empty', async () => {
    renderFailing(serverError());
    const { status, alert } = regions(await errorCard());
    expect(status).not.toBeNull();
    expect(alert).not.toBeNull();
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('');
  });

  it('copies exactly the id, announces it in the status region and keeps focus on the button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderFailing(serverError());
    const { status, alert, button } = regions(await errorCard());
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(status.textContent).toBe('Referência copiada'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('overview-ref-9');
    expect(alert.textContent).toBe('');
    expect(document.activeElement).toBe(button);
  });

  it('announces a rejected clipboard write in the alert region', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderFailing(serverError());
    const { status, alert, button } = regions(await errorCard());
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(alert.textContent).toBe('Falha ao copiar'));
    expect(status.textContent).toBe('');
    expect(document.activeElement).toBe(button);
  });

  it('announces a missing clipboard in the alert region', async () => {
    vi.stubGlobal('navigator', {});
    renderFailing(serverError());
    const { alert, button } = regions(await errorCard());
    fireEvent.click(button);
    await waitFor(() => expect(alert.textContent).toBe('Falha ao copiar'));
  });

  it('announces a synchronously throwing clipboard in the alert region', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => { throw new Error('sync'); } } });
    renderFailing(serverError());
    const { alert, button } = regions(await errorCard());
    fireEvent.click(button);
    await waitFor(() => expect(alert.textContent).toBe('Falha ao copiar'));
  });
});

describe('privacy (AC-E7.7)', () => {
  it('never renders the message, the body error text, the stack or the code; only the allowlisted id', async () => {
    renderFailing(serverError({ stack: 'at secretFrame (/srv/app.js:1:1)', payload: { error: 'private server copy', code: 'INTERNAL_ERROR' } }));
    const card = await errorCard();
    const surface = `${document.body.innerHTML}\n${document.body.textContent}`;
    expect(surface).not.toMatch(/private server copy|secretFrame|INTERNAL_ERROR/);
    expect(card.textContent).toContain('overview-ref-9');
  });
});

describe('catalogs (AC-E7.6)', () => {
  const NEW_KEYS = ['panel.error.reference_copy', 'panel.error.reference_copied', 'panel.error.reference_copy_failed'];
  const read = (locale) => Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t')));

  it.each(['en', 'es', 'pt-BR'])('has the three keys without placeholders in %s', (locale) => {
    const catalog = read(locale);
    for (const key of NEW_KEYS) {
      expect(catalog[key]).toBeTruthy();
      expect(catalog[key]).not.toMatch(/\{[a-z]+\}/);
    }
    expect(catalog['panel.error.reference']).toContain('{id}');
  });

  it('declares the keys for the runtime translator', () => {
    for (const key of NEW_KEYS) expect(PANEL_PLACEHOLDERS[key]).toEqual([]);
    expect(PANEL_PLACEHOLDERS['panel.error.reference']).toEqual(['id']);
  });
});
