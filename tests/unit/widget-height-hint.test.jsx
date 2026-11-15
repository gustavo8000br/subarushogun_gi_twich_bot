/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WidgetsPageView } from '../../apps/frontend/features/widgets/widgets-page-content.jsx';
import { installDialogStub } from './helpers/dialog-stub.mjs';

afterEach(cleanup);
beforeAll(installDialogStub);

const t = (key, options) => {
  const min = options?.values?.min;
  return min === undefined ? key : `${key}|${min}`;
};

function openEditor() {
  const request = vi.fn(async (path) => (path === '/api/overlay-widgets' ? [] : {}));
  render(<WidgetsPageView t={t} request={request} queues={[]} />);
  return screen.findByRole('button', { name: 'panel.widget.create_first' }).then((button) => {
    fireEvent.click(button);
    return {
      height: document.querySelector('input[name="height"]'),
      font: document.querySelector('input[name="fontSize"]'),
    };
  });
}
const warning = () => screen.queryByText(/^panel\.widget\.height_below_min/);

describe('widget form height hint (AC-12.2)', () => {
  it('links the Height field to a hint that follows the font size', async () => {
    const { height, font } = await openEditor();
    const hint = document.getElementById(height.getAttribute('aria-describedby'));
    expect(hint.textContent).toBe('panel.widget.height_hint|65');
    fireEvent.change(font, { target: { name: 'fontSize', value: '24' } });
    expect(hint.textContent).toBe('panel.widget.height_hint|54');
  });

  it('warns only for a numeric height below the minimum, and never blocks saving', async () => {
    const { height } = await openEditor();
    expect(warning()).toBeNull();
    fireEvent.change(height, { target: { name: 'height', value: '64' } });
    expect(warning().textContent).toBe('panel.widget.height_below_min|65');
    expect(warning().getAttribute('role')).toBe('status');
    expect(screen.getByRole('button', { name: 'panel.widget.save' }).disabled).toBe(false);
    fireEvent.change(height, { target: { name: 'height', value: '65' } });
    expect(warning()).toBeNull();
    fireEvent.change(height, { target: { name: 'height', value: 'auto' } });
    expect(warning()).toBeNull();
    fireEvent.change(height, { target: { name: 'height', value: '' } });
    expect(warning()).toBeNull();
  });
});
