'use client';

import LanguagePicker from '../../components/ui/language-picker.jsx';
import { useEffect, useRef } from 'react';
import QueueSummaryCards from '../overview/queue-summary-cards.jsx';
import { getRuntimeHealthSeverity, projectRuntimeHealth, summarizeUnresolvedOperations } from '../overview/queue-summary.mjs';
import { PanelProvider, usePanel } from './panel-provider.jsx';
import { getOverviewNextAction } from '../../../shared/panel/panel-navigation.mjs';

const NAVIGATION = Object.freeze([
  ['overview', 'panel.navigation.overview', true, '/'],
  ['queues', 'panel.navigation.queues', true, '/queues/'],
  ['new_queue', 'panel.navigation.new_queue', true, '/new-queue/'],
  ['operations', 'panel.navigation.operations', true, '/operations/'],
  ['commands', 'panel.navigation.commands', true, '/commands/'],
  ['widgets', 'panel.navigation.widgets', true, '/widgets/'],
  ['settings', 'panel.navigation.settings', true, '/settings/'],
  ['connection', 'panel.navigation.connection', true, '/connection/'],
]);

function PanelFrame({ activePage, children }) {
  const activeNavigationItem = useRef(null);
  const { status, error, runtimeState, setupState, healthState, queueSummary, localeState, refreshing, refreshNotice, lastRefreshAt, refreshOverview, t } = usePanel();
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
  useEffect(() => {
    if (activePage !== 'overview' || status !== 'ready') return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshOverview({ quiet: true });
    }, 5000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshOverview({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activePage, refreshOverview, status]);
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
                <div className="overview-heading-actions">
                  <div className="version-chip"><span className="version-dot" />{t('panel.runtime.version')} <strong>{runtimeState?.product_version ?? '—'}</strong></div>
                  {status === 'ready' ? <button type="button" className="button button-secondary overview-refresh" onClick={() => void refreshOverview()} disabled={refreshing} aria-busy={refreshing}>
                    {t(refreshing ? 'panel.overview.refreshing' : 'panel.overview.refresh')}
                  </button> : null}
                  {lastRefreshAt ? <time className="overview-last-updated" dateTime={new Date(lastRefreshAt).toISOString()}>{t('panel.overview.last_updated', { values: { time: new Intl.DateTimeFormat(localeState.locale, { hour: '2-digit', minute: '2-digit' }).format(lastRefreshAt) } })}</time> : null}
                </div>
              </div>
              {refreshNotice?.status === 'success' ? <p className="status-card overview-refresh-notice" role="status">{t('panel.overview.refreshed')}</p> : null}
              {refreshNotice?.status === 'error' ? <p className="status-card error-card overview-refresh-notice" role="alert">{t('panel.overview.refresh_failed')}</p> : null}
              <section className="migration-card" aria-labelledby="migration-title">
                <div className="migration-icon" aria-hidden="true">✦</div>
                <div className="next-step-content"><p className="eyebrow">{t('panel.overview.next_eyebrow')}</p><h2 id="migration-title">{t(nextStep.title)}</h2><p>{t(nextStep.description)}</p>{nextStep.href ? <a className="next-step-link" href={nextStep.href}>{t(nextStep.label)} <span aria-hidden="true">→</span></a> : null}</div>
              </section>
              {status === 'ready' ? (
                <>
              <section className="health-section" aria-labelledby="health-title">
                <div className="section-heading"><div><p className="eyebrow">{t('panel.section.local')}</p><h2 id="health-title">{t('panel.health.label')}</h2></div>
                  <p className="overview-reconciliation"><span>{t('panel.overview.last_reconciliation')}</span><strong>{healthState?.last_reconciliation_at && Number.isFinite(Date.parse(healthState.last_reconciliation_at))
                    ? new Intl.DateTimeFormat(localeState.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(healthState.last_reconciliation_at))
                    : t('panel.overview.reconciliation_not_run')}</strong></p>
                </div>
                <ul className="health-legend" aria-label={t('panel.health.legend.label')}>
                  <li data-severity="functional"><i aria-hidden="true" />{t('panel.health.legend.functional')}</li>
                  <li data-severity="partial"><i aria-hidden="true" />{t('panel.health.legend.partial')}</li>
                  <li data-severity="nonfunctional"><i aria-hidden="true" />{t('panel.health.legend.nonfunctional')}</li>
                </ul>
                {(() => {
                  const health = projectRuntimeHealth(healthState);
                  const cards = [
                    ['bot', 'panel.health.bot', health.bot, 'panel.health.bot'],
                    ['database', 'panel.health.database', health.database, 'panel.health.database'],
                    ['twitch-api', 'panel.health.twitch_api', health.twitchApi, 'panel.health.twitch'],
                    ['twitch-integration', 'panel.health.twitch_integration', health.twitchIntegration, 'panel.health.twitch'],
                    ['twitch-chat', 'panel.health.twitch_chat', health.twitchChat, 'panel.health.chat'],
                    ['twitch-rewards', 'panel.health.twitch_rewards', health.twitchRewards, 'panel.health.rewards'],
                  ];
                  return <div className="health-grid">
                    {cards.map(([id, label, value, statusPrefix]) => <article className="health-card" key={id} data-state={value} data-severity={getRuntimeHealthSeverity(value)}>
                      <span className={`health-symbol${id.startsWith('twitch') ? ' twitch-symbol' : ''}`} aria-hidden="true">{id === 'database' ? '▦' : id === 'bot' ? '⌂' : '◉'}</span>
                      <div><span>{t(label)}</span><strong><i aria-hidden="true" />{t(`${statusPrefix}.${value}`)}</strong>
                        {id === 'twitch-api' ? <small>{health.pingMs === null ? t('panel.health.ping_unavailable') : t('panel.health.ping_ms', { values: { ms: new Intl.NumberFormat(localeState.locale).format(health.pingMs) } })}</small> : null}
                      </div>
                    </article>)}
                  </div>;
                })()}
              </section>
              <QueueSummaryCards summary={queueSummary} locale={localeState.locale} t={t} />
              <section className="overview-context-grid" aria-label={t('panel.overview.context_label')}>
                <article className="overview-context-card"><span>{t('panel.overview.current_account')}</span><strong>{runtimeState?.account?.label ?? t('panel.settings.account_fallback')}</strong></article>
                {(() => {
                  const operations = summarizeUnresolvedOperations(
                    runtimeState?.pending_operations ?? [], runtimeState?.unresolved_operation_summary,
                  );
                  return <a className="overview-context-card overview-operations-link" href="/operations/">
                    <span>{t('panel.overview.pending_operations')}</span><strong>{new Intl.NumberFormat(localeState.locale).format(operations.total)}</strong>
                    <small>{t('panel.overview.needs_review', { values: { count: new Intl.NumberFormat(localeState.locale).format(operations.needsReview) } })}</small>
                  </a>;
                })()}
              </section>
                </>
              ) : null}
          </> : status === 'ready' ? children : null}
        </main>
      </div>
    </div>
  );
}

export default function PanelShell({ fallbackCatalog, activePage = 'overview', children }) {
  return <PanelProvider fallbackCatalog={fallbackCatalog}><PanelFrame activePage={activePage}>{children}</PanelFrame></PanelProvider>;
}
