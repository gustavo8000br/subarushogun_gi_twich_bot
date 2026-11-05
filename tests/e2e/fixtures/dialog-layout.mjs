import assert from 'node:assert/strict';

/** TS-10 (AC-TS10-3): reward dialogs fit the viewport and keep readable, separated content at phone and tablet widths. */
export const DIALOG_VIEWPORTS = Object.freeze([{ width: 390, height: 844 }, { width: 768, height: 900 }]);

/**
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} dialog an open <dialog>
 * @param {string} label
 */
export async function assertDialogLayout(page, dialog, label) {
  const viewport = page.viewportSize();
  const measured = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const gaps = [];
    const actions = element.querySelector('.operation-confirmation-actions');
    const buttons = actions ? [...actions.querySelectorAll('button')].filter((button) => button.offsetParent !== null).map((button) => button.getBoundingClientRect()) : [];
    for (let i = 1; i < buttons.length; i += 1) {
      const a = buttons[i - 1]; const b = buttons[i];
      gaps.push(Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom));
    }
    const notices = [...element.querySelectorAll('.hint, .connection-notice')].filter((node) => node.offsetParent !== null)
      .map((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    return {
      top: box.top, left: box.left, right: box.right, bottom: box.bottom,
      overflowX: element.scrollWidth - element.clientWidth,
      overflowY: getComputedStyle(element).overflowY,
      gaps, notices, actionCount: buttons.length,
      closeType: element.querySelector('.panel-heading .icon-button')?.getAttribute('type'),
    };
  });
  assert.ok(measured.left >= 0 && measured.right <= viewport.width, `${label}: the dialog fits horizontally in ${viewport.width}px (${measured.left}..${measured.right})`);
  assert.ok(measured.top >= 0 && measured.bottom <= viewport.height + 1, `${label}: the dialog fits vertically in ${viewport.height}px (${measured.top}..${measured.bottom})`);
  assert.ok(measured.overflowX <= 0, `${label}: no horizontal overflow (${measured.overflowX}px)`);
  assert.ok(['auto', 'scroll'].includes(measured.overflowY), `${label}: the dialog scrolls internally (${measured.overflowY})`);
  assert.equal(measured.closeType, 'button', `${label}: the close control cannot submit the form`);
  assert.ok(measured.actionCount >= 1, `${label}: the dialog exposes its actions`);
  for (const gap of measured.gaps) assert.ok(gap >= 12, `${label}: actions are at least 12px apart (${gap}px)`);
  assert.ok(measured.notices.length >= 1, `${label}: the dialog has a notice or hint to measure`);
  for (const size of measured.notices) assert.ok(size >= 14, `${label}: notice text is at least 14px (${size}px)`);
}

/** Runs the layout check at every TS-10 viewport and restores the original viewport. */
export async function assertDialogLayoutAtViewports(page, dialog, label) {
  const original = page.viewportSize();
  try {
    for (const viewport of DIALOG_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await assertDialogLayout(page, dialog, `${label} @${viewport.width}x${viewport.height}`);
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}
