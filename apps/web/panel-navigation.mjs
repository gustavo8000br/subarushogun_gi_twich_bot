const pageIds = new Set(['overview', 'queues', 'new-queue', 'operations', 'settings', 'connection']);

/** @param {{connected?: boolean}} setup */
export function getInitialPanelPage(setup) {
  return setup?.connected === true ? 'overview' : 'connection';
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
