/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';
import { WidgetsPageView } from '../../apps/frontend/features/widgets/widgets-page-content.jsx';
import { installDialogStub } from './helpers/dialog-stub.mjs';

// OPS-15 D-4: the widget form shows localized option labels; the technical value sent to the API stays raw.
afterEach(cleanup);
beforeAll(installDialogStub);

const catalog = (locale) => Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t')));
const translator = (locale) => { const entries = catalog(locale); return (key) => entries[key] ?? key; };

async function openEditor(locale, request = vi.fn(async (path) => (path === '/api/overlay-widgets' ? [] : {})), t = translator(locale)) {
  render(<WidgetsPageView t={t} request={request} queues={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: t('panel.widget.create_first') }));
  return request;
}
const options = (name) => [...document.querySelectorAll(`select[name="${name}"] option`)].map((option) => [option.value, option.textContent]);

describe('widget form option labels (D-4)', () => {
  it.each([
    ['pt-BR', { alignment: ['Esquerda', 'Centro', 'Direita'], effect: ['Nenhum', 'Contorno', 'Sombra'], overflow: ['Quebrar linha', 'Cortar', 'Reticências'] }],
    ['es', { alignment: ['Izquierda', 'Centro', 'Derecha'], effect: ['Ninguno', 'Contorno', 'Sombra'], overflow: ['Ajustar línea', 'Recortar', 'Puntos suspensivos'] }],
    ['en', { alignment: ['Left', 'Center', 'Right'], effect: ['None', 'Outline', 'Shadow'], overflow: ['Wrap', 'Clip', 'Ellipsis'] }],
  ])('shows localized labels in %s and keeps the raw values', async (locale, labels) => {
    await openEditor(locale);
    const raw = { alignment: ['left', 'center', 'right'], effect: ['none', 'outline', 'shadow'], overflow: ['wrap', 'clip', 'ellipsis'] };
    for (const field of ['alignment', 'effect', 'overflow']) {
      expect(options(field)).toEqual(raw[field].map((value, index) => [value, labels[field][index]]));
    }
    expect(options('fontFamily').map(([value]) => value)).toEqual(['system-ui', 'Arial, sans-serif', 'Verdana, sans-serif', 'Georgia, serif', 'Courier New, monospace']);
    expect(options('fontFamily')[0][1]).toBe(translator(locale)('panel.widget.font.system'));
    expect(options('fontFamily')[1][1]).toBe('Arial');
  });

  it.each([['en', 'Bold (700)'], ['es', 'Negrita (700)'], ['pt-BR', 'Negrito (700)']])('labels the numeric font weights in %s and keeps the numeric value (U-4)', async (locale, bold) => {
    await openEditor(locale);
    expect(options('fontWeight').map(([value]) => value)).toEqual(['300', '400', '500', '600', '700', '800', '900']);
    expect(options('fontWeight')[4][1]).toBe(bold);
    for (const [value, label] of options('fontWeight')) expect(label, value).toContain(`(${value})`);
  });

  it('sends the technical value, not the label, when the form is saved', async () => {
    const request = vi.fn(async (path, init) => (path === '/api/overlay-widgets' && !init ? [] : { widget: { id: 'w1' }, capabilityUrl: 'https://localhost:3000/overlay#x' }));
    await openEditor('pt-BR', request);
    fireEvent.change(document.querySelector('select[name="alignment"]'), { target: { name: 'alignment', value: 'center' } });
    fireEvent.change(document.querySelector('select[name="effect"]'), { target: { name: 'effect', value: 'shadow' } });
    fireEvent.change(document.querySelector('select[name="overflow"]'), { target: { name: 'overflow', value: 'ellipsis' } });
    fireEvent.change(document.querySelector('select[name="sourceType"]'), { target: { name: 'sourceType', value: 'fixed_text' } });
    fireEvent.change(document.querySelector('textarea[name="fixedText"]'), { target: { name: 'fixedText', value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar widget' }));
    await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const [, init] = request.mock.calls.find(([, call]) => call?.method === 'POST');
    expect(JSON.parse(init.body).style).toMatchObject({ alignment: 'center', effect: 'shadow', overflow: 'ellipsis' });
  });
});

const interpolating = (locale) => (key, options) => translatePanel({ [locale]: catalog(locale) }, locale, key, options);
describe('S-13 UX review texts in the real catalogs (F-01 to F-03, F-06)', () => {
  const sample = { id: '11111111-1234-4234-8234-123456789abc', sourceType: 'fixed_text', queueId: null, fixedText: 'Hi', fallbackText: 'x', style: { width: 640, height: 100 }, version: 1, capabilityVersion: 1, capabilityActive: true, deleted: false };
  it.each([['en', 'Delete: Fixed text (11111111)'], ['es', /^Eliminar: .+ \(11111111\)$/], ['pt-BR', /^Excluir: .+ \(11111111\)$/]])('names the widget in the action and the confirmation in %s', async (locale, name) => {
    const t = interpolating(locale);
    render(<WidgetsPageView t={t} request={vi.fn(async () => [sample])} queues={[]} />);
    fireEvent.click(await screen.findByRole('button', { name }));
    const dialog = screen.getByRole('alertdialog');
    const target = document.getElementById(dialog.getAttribute('aria-describedby')).textContent;
    expect(target).toMatch(/\(11111111\)$/);
    expect(target).not.toMatch(/[{}]|panel\./);
  });

  it.each(['en', 'es', 'pt-BR'])('shows the discard confirmation copy in %s and keeps width and height free-text for "auto"', async (locale) => {
    const t = interpolating(locale);
    await openEditor(locale, undefined, t);
    expect(document.querySelector('input[name="height"]').getAttribute('inputmode')).toBeNull();
    expect(document.querySelector('input[name="width"]').getAttribute('inputmode')).toBeNull();
    fireEvent.change(document.querySelector('input[name="fallbackText"]'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('button', { name: t('panel.widget.close') }));
    const dialog = screen.getByRole('alertdialog', { name: t('panel.widget.editor.discard.title') });
    for (const key of ['keep', 'confirm']) expect(within(dialog).getByRole('button', { name: t(`panel.widget.editor.discard.${key}`) })).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/panel\./);
  });
});

