import { describe, expect, it } from 'vitest';
import * as panelNavigation from '../../apps/web/panel-navigation.mjs';
const { getInitialPanelPage, selectPanelPage } = panelNavigation;

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
  it('selects a first-run action that matches channel eligibility and queue count', () => {
    expect(panelNavigation.getOverviewNextAction).toBeTypeOf('function');
    expect(panelNavigation.getOverviewNextAction({ connected: false }, 0)).toEqual({ page: 'connection', key: 'panel.overview.connect_channel' });
    expect(panelNavigation.getOverviewNextAction({ connected: true, eligibility: { eligible: true } }, 0)).toEqual({ page: 'new-queue', key: 'panel.overview.create_first_queue' });
    expect(panelNavigation.getOverviewNextAction({ connected: true, eligibility: { eligible: false } }, 0)).toEqual({ page: 'connection', key: 'panel.overview.check_channel' });
    expect(panelNavigation.getOverviewNextAction({ connected: true, eligibility: { eligible: true } }, 2)).toEqual({ page: 'queues', key: 'panel.overview.open_queues' });
  });

  it('chooses a safe next action from the queue empty state', () => {
    expect(panelNavigation.getQueueEmptyAction).toBeTypeOf('function');
    expect(panelNavigation.getQueueEmptyAction({ connected: false })).toEqual({ page: 'connection', key: 'panel.queue.empty.connect' });
    expect(panelNavigation.getQueueEmptyAction({ connected: true, eligibility: { eligible: true } })).toEqual({ page: 'new-queue', key: 'panel.queue.empty.create' });
    expect(panelNavigation.getQueueEmptyAction({ connected: true, eligibility: { eligible: false } })).toEqual({ page: 'connection', key: 'panel.queue.empty.check_channel' });
  });

  it('shows the connection flow until the Twitch channel is connected', () => {
    expect(getInitialPanelPage({ connected: false, status: 'not_configured' })).toBe('connection');
    expect(getInitialPanelPage({ connected: false, status: 'reconnect_required' })).toBe('connection');
    expect(getInitialPanelPage({ connected: true, status: 'connected' })).toBe('overview');
  });

  it('shows one page and marks only its navigation item current', () => {
    const navigationItems = ['overview', 'queues', 'new-queue', 'operations', 'commands', 'settings', 'connection'].map((page) => element({ pageTarget: page }));
    const pages = ['overview', 'queues', 'new-queue', 'operations', 'commands', 'settings', 'connection'].map((page) => element({ panelPage: page }));

    const selected = selectPanelPage('commands', { navigationItems, pages });

    expect(selected).toBe('commands');
    expect(pages.map(({ hidden }) => hidden)).toEqual([true, true, true, true, false, true, true]);
    expect(navigationItems.map(({ attributes }) => attributes['aria-current'] ?? null)).toEqual([null, null, null, null, 'page', null, null]);
  });

  it('falls back to the overview if a requested page is unknown', () => {
    const pages = [element({ panelPage: 'overview' }), element({ panelPage: 'queues' })];
    const navigationItems = [element({ pageTarget: 'overview' }), element({ pageTarget: 'queues' })];

    expect(selectPanelPage('arbitrary', { navigationItems, pages })).toBe('overview');
    expect(pages.map(({ hidden }) => hidden)).toEqual([false, true]);
  });

  it('opens the dedicated OBS widgets page from the panel navigation', () => {
    const navigationItems = ['overview', 'widgets'].map((page) => element({ pageTarget: page }));
    const pages = ['overview', 'widgets'].map((page) => element({ panelPage: page }));
    expect(selectPanelPage('widgets', { navigationItems, pages })).toBe('widgets');
    expect(pages.map(({ hidden }) => hidden)).toEqual([true, false]);
    expect(navigationItems.map(({ attributes }) => attributes['aria-current'] ?? null)).toEqual([null, 'page']);
  });
});
