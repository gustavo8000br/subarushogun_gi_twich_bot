/**
 * Opens the panel's accessible confirmation dialog and resolves only after an
 * explicit choice. Missing UI fails closed so an action is never accepted by
 * default.
 * @param {{ dialog: HTMLDialogElement, messageNode: HTMLElement, acceptButton: HTMLButtonElement, cancelButton: HTMLButtonElement, message: string, acceptLabel?: string, cancelLabel?: string }} elements
 * @returns {Promise<boolean>}
 */
export function requestPanelConfirmation({ dialog, messageNode, acceptButton, cancelButton, message, acceptLabel, cancelLabel }) {
  if (!dialog || !messageNode || !acceptButton || !cancelButton || typeof dialog.showModal !== 'function' || dialog.open) {
    return Promise.resolve(false);
  }

  messageNode.textContent = message;
  if (acceptLabel) acceptButton.textContent = acceptLabel;
  if (cancelLabel) cancelButton.textContent = cancelLabel;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      acceptButton.removeEventListener('click', accept);
      cancelButton.removeEventListener('click', cancel);
      dialog.removeEventListener('cancel', cancelFromKeyboard);
      dialog.removeEventListener('keydown', keepTabFocusInside);
      if (dialog.open) dialog.close();
      resolve(accepted);
    };
    const accept = () => finish(true);
    const cancel = () => finish(false);
    const cancelFromKeyboard = (event) => {
      event.preventDefault();
      finish(false);
    };
    const keepTabFocusInside = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll(
        'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      )]).filter((element) => element.tabIndex >= 0 && !element.hidden && !('disabled' in element && element.disabled) && element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[inert]')
        && (!element.getClientRects || element.getClientRects().length > 0));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = dialog.ownerDocument.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    acceptButton.addEventListener('click', accept, { once: true });
    cancelButton.addEventListener('click', cancel, { once: true });
    dialog.addEventListener('cancel', cancelFromKeyboard, { once: true });
    dialog.addEventListener('keydown', keepTabFocusInside);
    dialog.showModal();
  });
}
