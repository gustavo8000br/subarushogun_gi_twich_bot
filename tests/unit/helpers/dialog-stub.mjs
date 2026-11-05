// jsdom 30 ships an empty HTMLDialogElement: no showModal/close, top layer, inert or close watcher.
// Same stub semantics as the queue dialog tests (open attribute + synchronous `close` event).
// This is NOT evidence of browser behavior; real close requests are proven by browser-only E2E.
export function installDialogStub() {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
