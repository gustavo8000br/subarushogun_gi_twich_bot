import { describe, expect, it } from 'vitest';
import { getInitialPanelPage, selectPanelPage } from '../../apps/web/panel-navigation.mjs';

function element(dataset = {}) {
  return {
    dataset,
    hidden: false,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

describe('local panel navigation', () => {
  it('shows the connection flow until the Twitch channel is connected', () => {
    expect(getInitialPanelPage({ connected: false, status: 'not_configured' })).toBe('connection');
    expect(getInitialPanelPage({ connected: false, status: 'reconnect_required' })).toBe('connection');
    expect(getInitialPanelPage({ connected: true, status: 'connected' })).toBe('overview');
  });

  it('shows one page and marks only its navigation item current', () => {
    const navigationItems = ['overview', 'queues', 'new-queue', 'operations', 'settings', 'connection'].map((page) => element({ pageTarget: page }));
    const pages = ['overview', 'queues', 'new-queue', 'operations', 'settings', 'connection'].map((page) => element({ panelPage: page }));

    const selected = selectPanelPage('new-queue', { navigationItems, pages });

    expect(selected).toBe('new-queue');
    expect(pages.map(({ hidden }) => hidden)).toEqual([true, true, false, true, true, true]);
    expect(navigationItems.map(({ attributes }) => attributes['aria-current'] ?? null)).toEqual([null, null, 'page', null, null, null]);
  });

  it('falls back to the overview if a requested page is unknown', () => {
    const pages = [element({ panelPage: 'overview' }), element({ panelPage: 'queues' })];
    const navigationItems = [element({ pageTarget: 'overview' }), element({ pageTarget: 'queues' })];

    expect(selectPanelPage('arbitrary', { navigationItems, pages })).toBe('overview');
    expect(pages.map(({ hidden }) => hidden)).toEqual([false, true]);
  });
});
