import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { requestPanelConfirmation } from '../../apps/web/panel-confirmation.mjs';

const app = await readFile(new URL('../../apps/web/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../apps/web/index.html', import.meta.url), 'utf8');
const catalogs = await Promise.all(['en', 'es', 'pt-BR'].map((locale) =>
  readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')));

describe('panel confirmation dialog contract', () => {
  it('removes hide/archive copy and labels legacy recovery as show-to-viewers', () => {
    const actionLabels = catalogs.map((catalog) => Object.fromEntries(catalog.split('\n').map((line) => line.split('\t'))));
    expect(actionLabels.map((labels) => labels['panel.queue.action.archive'])).toEqual([undefined, undefined, undefined]);
    expect(actionLabels.map((labels) => labels['panel.queue.confirm.archive'])).toEqual([undefined, undefined, undefined]);
    expect(actionLabels.map((labels) => labels['panel.queue.action.unarchive'])).toEqual(['Show to viewers', 'Mostrar esta cola a los espectadores', 'Mostrar esta fila para viewers']);
    for (const labels of actionLabels) {
      expect(labels['panel.queue.confirm.unarchive']).toMatch(/viewers|espectadores/i);
      expect(labels['panel.queue.unarchive.done']).toMatch(/viewers|espectadores/i);
    }
  });

  it('removes the hide/archive action from normal queue controls and preserves legacy recovery only', () => {
    expect(app).not.toContain("action(panelText('panel.queue.action.archive'), 'archive-queue'");
    expect(app).not.toContain("actionName === 'archive-queue'");
    expect(app).toContain('getQueueVisibilityAction(queue, actionState)');
    expect(app).toContain("actionName === 'unarchive-queue'");
    const legacyControls = app.match(/else if \(queue\.isArchived\) \{([\s\S]*?)\n[ ]{4}\} else \{/)?.[1] ?? '';
    expect(legacyControls).toContain('visibilityAction');
    expect(legacyControls).not.toMatch(/'open-queue'|'call-next'|'clear-queue'/);
  });

  it('does not use browser-native confirmation prompts for product actions', () => {
    expect(app).not.toMatch(/window\.confirm\s*\(/);
    expect(app.match(/await confirmPanelAction\(/g)).toHaveLength(12);
  });

  it('requires two separate confirmations before deleting locally when reward sync is uncertain', () => {
    expect(app).toMatch(/archive-local\/challenge/);
    expect(app).toMatch(/archive-local\/confirm/);
    expect(app).toMatch(/getQueueConfirmationCopy\(queue, 'archive-local-first'\)/);
    expect(app).toMatch(/getQueueConfirmationCopy\(queue, 'archive-local-final'\)/);
    for (const catalog of catalogs) {
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_first\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_final\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_review\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_anyway\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.archive_local\.(processing|expired|stale|unavailable)\t\S+/);
      expect(catalog).toMatch(/reward may still exist|todavía puede existir|ainda pode existir/i);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_anyway\t(?:Delete from panel anyway|Excluir do painel mesmo assim|Eliminar del panel de todos modos)/);
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_final\t(?:Final confirmation: delete queue|Confirmação final: excluir a fila|Confirmación final: ¿eliminar la cola)/);
      expect(catalog).not.toMatch(/panel\.queue\.(?:action\.archive_local_anyway|confirm\.archive_local_uncertain_first|confirm\.archive_local_uncertain_final|archive_local\.(?:done|processing|unavailable))\t[^\n]*(?:archive|arquiv|archiv)/i);
      expect(catalog).toMatch(/historical and unverified|histórico e não verificado|histórico y no verificado/i);
      expect(catalog).toMatch(/not an indication that sync is still running|não significa que uma operação continue em execução|no indica que la sincronización continúe en curso/i);
    }
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
    const pending = requestPanelConfirmation({ ...ui, message: '<b>Confirm?</b>', acceptLabel: 'Archive locally', cancelLabel: 'Keep queue' });
    expect(ui.dialog.open).toBe(true);
    expect(ui.messageNode.textContent).toBe('<b>Confirm?</b>');
    expect(ui.acceptButton.textContent).toBe('Archive locally');
    expect(ui.cancelButton.textContent).toBe('Keep queue');
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

  it.each([
    ['Tab', 'acceptButton', 'cancelButton'],
    ['Shift+Tab', 'cancelButton', 'acceptButton'],
  ])('keeps keyboard focus inside the modal with %s from the boundary', async (key, currentName, expectedName) => {
    const ui = confirmationUi();
    const pending = requestPanelConfirmation({ ...ui, message: 'Confirm?' });
    const current = ui[currentName];
    const expected = ui[expectedName];
    ui.dialog.ownerDocument.activeElement = current;
    const event = new globalThis.Event('keydown', { cancelable: true });
    Object.defineProperties(event, {
      key: { value: key.endsWith('Tab') ? 'Tab' : key },
      shiftKey: { value: key.startsWith('Shift+') },
    });

    ui.dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(ui.dialog.ownerDocument.activeElement).toBe(expected);
    ui.cancelButton.dispatchEvent(new globalThis.Event('click'));
    await expect(pending).resolves.toBe(false);
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
  dialog.ownerDocument = { activeElement: null };
  dialog.open = false;
  const focusable = [];
  dialog.querySelectorAll = () => focusable;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const button = () => {
    const element = new globalThis.EventTarget();
    element.tabIndex = 0;
    element.disabled = false;
    element.hidden = false;
    element.getAttribute = () => null;
    element.closest = () => null;
    element.focus = () => { dialog.ownerDocument.activeElement = element; };
    focusable.push(element);
    return element;
  };
  const cancelButton = button();
  const acceptButton = button();
  return {
    dialog,
    messageNode: { textContent: '' },
    acceptButton,
    cancelButton,
  };
}
