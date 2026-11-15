/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WidgetLinkDialog } from '../../apps/frontend/features/widgets/widget-link-dialog.jsx';
import { installDialogStub } from './helpers/dialog-stub.mjs';

// S-13 U-9: when the copy fails the revealed field selects its content on focus so Ctrl+C works at once.
// jsdom check of the handler only; text selection in a real browser is not proven here.
afterEach(cleanup);
beforeAll(installDialogStub);

const URL_VALUE = 'https://localhost/overlay#one-time-secret';
const t = (key) => key;

describe('widget link dialog manual-copy fallback (U-9)', () => {
  it('selects the whole revealed value on focus without exposing the URL in label attributes', () => {
    render(<WidgetLinkDialog t={t} url={URL_VALUE} onClosed={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.link.show' }));
    const input = document.querySelector('input.widget-link-value');
    expect(input.value).toBe(URL_VALUE);
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(URL_VALUE.length);
    for (const attribute of ['aria-label', 'aria-description', 'title', 'data-url']) expect(input.getAttribute(attribute)).toBeNull();
  });
});
