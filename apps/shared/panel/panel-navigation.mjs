const pageIds = new Set(['overview', 'queues', 'new-queue', 'operations', 'commands', 'widgets', 'settings', 'connection']);

/** @param {{connected?: boolean}} setup */
export function getInitialPanelPage(setup) {
  return setup?.connected === true ? 'overview' : 'connection';
}

/** @param {{connected?: boolean, eligibility?: {eligible?: boolean}}|null} setup @param {number} queueCount */
export function getOverviewNextAction(setup, queueCount) {
  if (queueCount > 0 && setup?.connected === true) return { page: 'queues', key: 'panel.overview.open_queues' };
  if (setup?.connected !== true) return { page: 'connection', key: 'panel.overview.connect_channel' };
  if (setup.eligibility?.eligible === true) return { page: 'new-queue', key: 'panel.overview.create_first_queue' };
  return { page: 'connection', key: 'panel.overview.check_channel' };
}

/** @param {{connected?: boolean, eligibility?: {eligible?: boolean}}|null} setup */
export function getQueueEmptyAction(setup) {
  if (setup?.connected !== true) return { page: 'connection', key: 'panel.queue.empty.connect' };
  if (setup.eligibility?.eligible === true) return { page: 'new-queue', key: 'panel.queue.empty.create' };
  return { page: 'connection', key: 'panel.queue.empty.check_channel' };
}

/** @param {string} pageId @param {{navigationItems: Array<{dataset: DOMStringMap, setAttribute: Function, removeAttribute: Function}>, pages: Array<{dataset: DOMStringMap, hidden: boolean|string}>}} input */
export function selectPanelPage(pageId, { navigationItems, pages }) {
  const availablePages = new Set(pages.map(({ dataset }) => dataset.panelPage));
  const selected = pageIds.has(pageId) && availablePages.has(pageId)
    ? pageId
    : availablePages.has('overview') ? 'overview' : pages[0]?.dataset.panelPage;

  for (const page of pages) page.hidden = page.dataset.panelPage !== selected;
  for (const item of navigationItems) {
    if (item.dataset.pageTarget === selected) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  return selected;
}
