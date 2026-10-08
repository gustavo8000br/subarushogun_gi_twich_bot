import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { requestPanelConfirmation } from '../../apps/web/panel-confirmation.mjs';

const app = await readFile(new URL('../../apps/web/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../apps/web/index.html', import.meta.url), 'utf8');
const catalogs = await Promise.all(['en', 'es', 'pt-BR'].map((locale) =>
  readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')));

describe('panel confirmation dialog contract', () => {
  it('does not use browser-native confirmation prompts for product actions', () => {
    expect(app).not.toMatch(/window\.confirm\s*\(/);
    expect(app.match(/await confirmPanelAction\(/g)).toHaveLength(8);
  });

  it('provides an accessible in-app dialog with explicit cancel and accept actions', () => {
    expect(html).toMatch(/<dialog[^>]*id="panel-confirmation-dialog"[^>]*aria-labelledby="panel-confirmation-title"[^>]*>/);
    expect(html).toMatch(/id="panel-confirmation-cancel"[^>]*data-i18n="panel\.confirmation\.cancel"/);
    expect(html).toMatch(/id="panel-confirmation-accept"[^>]*data-i18n="panel\.confirmation\.accept"/);
    for (const catalog of catalogs) {
      expect(catalog).toMatch(/panel\.confirmation\.cancel\t\S+/);
      expect(catalog).toMatch(/panel\.confirmation\.accept\t\S+/);
    }
  });

  it('resolves true only for an explicit OK click and writes user text safely', async () => {
    const ui = confirmationUi();
    const pending = requestPanelConfirmation({ ...ui, message: '<b>Confirm?</b>' });
    expect(ui.dialog.open).toBe(true);
    expect(ui.messageNode.textContent).toBe('<b>Confirm?</b>');
    ui.acceptButton.dispatchEvent(new globalThis.Event('click'));
    await expect(pending).resolves.toBe(true);
    expect(ui.dialog.open).toBe(false);
  });

  it.each(['cancel-button', 'escape'])('resolves false when closed by %s', async (choice) => {
    const ui = confirmationUi();
    const pending = requestPanelConfirmation({ ...ui, message: 'Confirm?' });
    if (choice === 'escape') ui.dialog.dispatchEvent(new globalThis.Event('cancel', { cancelable: true }));
    else ui.cancelButton.dispatchEvent(new globalThis.Event('click'));
    await expect(pending).resolves.toBe(false);
    expect(ui.dialog.open).toBe(false);
  });

  it('fails closed when the dialog cannot be opened or is already open', async () => {
    const ui = confirmationUi();
    ui.dialog.open = true;
    await expect(requestPanelConfirmation({ ...ui, message: 'Confirm?' })).resolves.toBe(false);
    await expect(requestPanelConfirmation({ ...ui, dialog: null, message: 'Confirm?' })).resolves.toBe(false);
  });
});

function confirmationUi() {
  const dialog = new globalThis.EventTarget();
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  return {
    dialog,
    messageNode: { textContent: '' },
    acceptButton: new globalThis.EventTarget(),
    cancelButton: new globalThis.EventTarget(),
  };
}
