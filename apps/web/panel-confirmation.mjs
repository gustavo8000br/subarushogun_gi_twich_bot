/**
 * Opens the panel's accessible confirmation dialog and resolves only after an
 * explicit choice. Missing UI fails closed so an action is never accepted by
 * default.
 * @param {{ dialog: HTMLDialogElement, messageNode: HTMLElement, acceptButton: HTMLButtonElement, cancelButton: HTMLButtonElement, message: string }} elements
 * @returns {Promise<boolean>}
 */
export function requestPanelConfirmation({ dialog, messageNode, acceptButton, cancelButton, message }) {
  if (!dialog || !messageNode || !acceptButton || !cancelButton || typeof dialog.showModal !== 'function' || dialog.open) {
    return Promise.resolve(false);
  }

  messageNode.textContent = message;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      acceptButton.removeEventListener('click', accept);
      cancelButton.removeEventListener('click', cancel);
      dialog.removeEventListener('cancel', cancelFromKeyboard);
      if (dialog.open) dialog.close();
      resolve(accepted);
    };
    const accept = () => finish(true);
    const cancel = () => finish(false);
    const cancelFromKeyboard = (event) => {
      event.preventDefault();
      finish(false);
    };

    acceptButton.addEventListener('click', accept, { once: true });
    cancelButton.addEventListener('click', cancel, { once: true });
    dialog.addEventListener('cancel', cancelFromKeyboard, { once: true });
    dialog.showModal();
  });
}
