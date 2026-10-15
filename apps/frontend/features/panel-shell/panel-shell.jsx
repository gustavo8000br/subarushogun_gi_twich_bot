'use client';

import LanguagePicker from '../../components/ui/language-picker.jsx';
import { useEffect, useRef } from 'react';
import QueueSummaryCards from '../overview/queue-summary-cards.jsx';
import { PanelProvider, usePanel } from './panel-provider.jsx';
import { getOverviewNextAction } from '../../../web/panel-navigation.mjs';

const NAVIGATION = Object.freeze([
  ['overview', 'panel.navigation.overview', true, '/'],
  ['queues', 'panel.navigation.queues', true, '/queues/'],
  ['new_queue', 'panel.navigation.new_queue', true, '/new-queue/'],
  ['operations', 'panel.navigation.operations', true, '/operations/'],
  ['commands', 'panel.navigation.commands', false],
  ['widgets', 'panel.navigation.widgets', false],
  ['settings', 'panel.navigation.settings', false],
  ['connection', 'panel.navigation.connection', true, '/connection/'],
]);

function PanelFrame({ activePage, children }) {
  const activeNavigationItem = useRef(null);
  const { status, error, runtimeState, setupState, queueSummary, localeState, t } = usePanel();
  const currentLabel = NAVIGATION.find(([id]) => id === activePage)?.[1] ?? 'panel.navigation.overview';
  const nextAction = status === 'ready' ? getOverviewNextAction(setupState, queueSummary.queues) : null;
  const nextStep = !nextAction
    ? { title: 'panel.overview.next_unavailable_title', description: 'panel.overview.next_unavailable_description', label: null, href: null }
    : {
      title: nextAction.page === 'queues' ? 'panel.overview.next_queues_title'
        : nextAction.page === 'connection' ? (setupState?.connected ? 'panel.overview.check_title' : 'panel.overview.connect_title')
          : 'panel.overview.next_empty_title',
      description: nextAction.page === 'queues' ? 'panel.overview.next_queues_description'
        : nextAction.page === 'connection' ? (setupState?.connected ? 'panel.overview.check_description' : 'panel.overview.connect_description')
          : 'panel.overview.next_empty_description',
      label: nextAction.key,
      href: nextAction.page === 'queues' ? '/queues/' : nextAction.page === 'connection' ? '/connection/' : '/new-queue/',
    };
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 620px)').matches) return;
    const navItem = activeNavigationItem.current;
    const nav = navItem?.parentElement;
    if (navItem && nav) nav.scrollLeft = Math.max(0, navItem.offsetLeft - nav.offsetLeft - 12);
  }, [activePage]);
  return (
    <div className="panel-shell">
      <a className="skip-link" href="#main-content">{t('panel.accessibility.skip_to_content')}</a>
      <aside className="panel-sidebar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Fila Local</span>
        </a>
        <p className="sidebar-heading">{t('panel.sidebar.title')}</p>
        <nav aria-label={t('panel.navigation.label')}>
          {NAVIGATION.map(([id, label, enabled, href]) => (
            enabled ? <a key={id} ref={id === activePage ? activeNavigationItem : null} className={`nav-item${id === activePage ? ' active' : ''}`} href={href} {...(id === activePage ? { 'aria-current': 'page' } : {})}>
              <span className={`nav-icon nav-icon-${id}`} aria-hidden="true" />
              <span>{t(label)}</span>
            </a> : <span key={id} className="nav-item pending" aria-disabled="true">
              <span className={`nav-icon nav-icon-${id}`} aria-hidden="true" />
              <span>{t(label)}</span><span className="nav-status" aria-hidden="true">·</span>
            </span>
          ))}
        </nav>
        <p className="sidebar-local-note">{t('panel.sidebar.local_note')}</p>
      </aside>
      <div className="panel-workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>Fila Local</span><span aria-hidden="true">/</span><strong>{t(currentLabel)}</strong></div>
          <div className="topbar-tools">
            <span className="local-indicator"><span aria-hidden="true" />{t('panel.runtime.local_data')}</span>
            <LanguagePicker />
            <span className="avatar" aria-hidden="true">{(runtimeState?.account?.label ?? 'S').slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="page-content" id="main-content">
          {status === 'loading' ? <p className="status-card" role="status">{t('panel.health.database.checking')}…</p> : null}
          {status === 'unavailable' ? <p className="status-card error-card" role="alert">{t(error)}</p> : null}
          {activePage === 'overview' ? <>
              <div className="page-heading">
                <div><p className="eyebrow">{t('panel.overview.eyebrow')}</p><h1>{t('panel.navigation.overview')}</h1><p className="page-description">{t('panel.overview.description')}</p></div>
                <div className="version-chip"><span className="version-dot" />{t('panel.runtime.version')} <strong>{runtimeState?.product_version ?? '—'}</strong></div>
              </div>
              <section className="migration-card" aria-labelledby="migration-title">
                <div className="migration-icon" aria-hidden="true">✦</div>
                <div className="next-step-content"><p className="eyebrow">{t('panel.overview.next_eyebrow')}</p><h2 id="migration-title">{t(nextStep.title)}</h2><p>{t(nextStep.description)}</p>{nextStep.href ? <a className="next-step-link" href={nextStep.href}>{t(nextStep.label)} <span aria-hidden="true">→</span></a> : null}</div>
              </section>
              {status === 'ready' ? (
                <>
              <section className="health-section" aria-labelledby="health-title">
                <div className="section-heading"><div><p className="eyebrow">{t('panel.section.local')}</p><h2 id="health-title">{t('panel.health.label')}</h2></div></div>
                <div className="health-grid">
                  <article className="health-card"><span className="health-symbol database-symbol" aria-hidden="true">▦</span><div><span>{t('panel.health.database')}</span><strong><i />{t('panel.health.database.connected')}</strong></div><span className="health-arrow" aria-hidden="true">↗</span></article>
                  <article className="health-card"><span className="health-symbol twitch-symbol" aria-hidden="true">◉</span><div><span>{t('panel.health.twitch_api')}</span><strong><i />{t(`panel.health.twitch.${runtimeState?.connectivity?.twitch ?? 'unknown'}`)}</strong></div><span className="health-arrow" aria-hidden="true">↗</span></article>
                </div>
              </section>
              <QueueSummaryCards summary={queueSummary} locale={localeState.locale} t={t} />
                </>
              ) : null}
          </> : children}
        </main>
      </div>
    </div>
  );
}

export default function PanelShell({ fallbackCatalog, activePage = 'overview', children }) {
  return <PanelProvider fallbackCatalog={fallbackCatalog}><PanelFrame activePage={activePage}>{children}</PanelFrame></PanelProvider>;
}
