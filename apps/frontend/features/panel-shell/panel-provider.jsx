'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { normalizeCatalogBundle, translatePanel } from '../../lib/i18n/panel-catalogs.mjs';
import { persistProductLocale } from '../../lib/i18n/persist-product-locale.mjs';
import { loadPanelRuntimeSnapshot, loadPanelSnapshot } from './load-panel-snapshot.mjs';
import { summarizeQueues } from '../overview/queue-summary.mjs';
import { loadQueueProjection, requestQueueOpenState } from '../queues/queue-lifecycle.mjs';
import { getManualQueueEntryFailureKey, getQueueEntryActionFeedback, performQueueEntryActionWithRefresh } from '../queues/queue-entry-actions.mjs';
import { createQueueWithRefresh, getQueueCreationFailureKey, getQueueCreationFeedback } from '../queues/queue-creation.mjs';
import { getQueueSettingsFailureKey, getQueueSettingsFeedback, saveQueueSettingsWithRetry } from '../queues/queue-settings.mjs';

const PanelContext = createContext(null);

export function PanelProvider({ children, fallbackCatalog }) {
  const [catalogs, setCatalogs] = useState(fallbackCatalog ?? null);
  const [locales, setLocales] = useState(fallbackCatalog?.['pt-BR'] ? ['pt-BR'] : []);
  const [localeState, setLocaleState] = useState({ locale: 'pt-BR', revision: 1 });
  const [runtimeState, setRuntimeState] = useState(null);
  const [setupState, setSetupState] = useState(null);
  const [healthState, setHealthState] = useState(null);
  const [queueProjection, setQueueProjection] = useState([]);
  const [queueSummary, setQueueSummary] = useState({ queues: 0, waiting: 0, inService: 0 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [localeNotice, setLocaleNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [queueAction, setQueueAction] = useState(null);
  const [queueCreation, setQueueCreation] = useState(null);
  const [queueSettingsAction, setQueueSettingsAction] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const refreshInFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    apiClient.initializeSession().then(() => loadPanelSnapshot(apiClient.request)).then(({ bundle, state, setup, queues, health }) => {
      if (!alive) return;
      const normalized = normalizeCatalogBundle(bundle);
      setCatalogs(normalized.catalogs);
      setLocales(normalized.locales);
      setLocaleState(state.product_locale ?? { locale: 'pt-BR', revision: 1 });
      setRuntimeState(state);
      setSetupState(setup);
      setHealthState(health);
      setQueueProjection(queues);
      setQueueSummary(summarizeQueues(queues));
      setStatus('ready');
      setLastRefreshAt(Date.now());
    }).catch(() => {
      if (alive) {
        setStatus('unavailable');
        setError('panel.error.local_load');
      }
    });
    return () => { alive = false; };
  }, []);

  const refreshOverview = useCallback(async ({ quiet = false } = {}) => {
    if (refreshInFlight.current || status !== 'ready') return false;
    refreshInFlight.current = true;
    if (!quiet) setRefreshing(true);
    if (!quiet) setRefreshNotice(null);
    try {
      const snapshot = await loadPanelRuntimeSnapshot(apiClient.request);
      setRuntimeState(snapshot.state);
      setSetupState(snapshot.setup);
      setHealthState(snapshot.health);
      setQueueProjection(snapshot.queues);
      setQueueSummary(summarizeQueues(snapshot.queues));
      if (snapshot.state.product_locale && locales.includes(snapshot.state.product_locale.locale)
        && Number.isInteger(snapshot.state.product_locale.revision)) setLocaleState(snapshot.state.product_locale);
      setLastRefreshAt(Date.now());
      if (!quiet) setRefreshNotice({ status: 'success' });
      else setRefreshNotice(null);
      return true;
    } catch {
      setRefreshNotice({ status: 'error' });
      return false;
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [locales, status]);

  const t = useCallback((key, options) => translatePanel(catalogs, localeState.locale, key, options), [catalogs, localeState.locale]);
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = localeState.locale;
  }, [localeState.locale]);
  const changeLocale = useCallback(async (locale) => {
    if (!locales.includes(locale) || locale === localeState.locale || saving) return;
    setSaving(true);
    setError('');
    setLocaleNotice(null);
    try {
      const saved = await persistProductLocale({ request: apiClient.request, locale, current: localeState });
      setLocaleState(saved);
      setLocaleNotice({ key: 'panel.locale.updated', tone: 'success' });
    } catch (requestError) {
      let current = null;
      try {
        const state = await apiClient.request('/api/state');
        const persisted = state?.product_locale;
        if (persisted && locales.includes(persisted.locale)
          && Number.isInteger(persisted.revision) && persisted.revision >= 1) {
          current = persisted;
          setLocaleState(persisted);
        }
      } catch { /* Keep the current selection when the persisted state cannot be read. */ }

      if (current?.locale === locale && current.revision > localeState.revision) {
        setLocaleNotice({ key: 'panel.locale.updated', tone: 'success' });
      } else {
        const changedElsewhere = current && (current.locale !== localeState.locale || current.revision !== localeState.revision);
        setLocaleNotice({
          key: requestError?.code === 'PRODUCT_LOCALE_VERSION_CONFLICT' || changedElsewhere
            ? 'panel.error.locale_conflict'
            : 'panel.error.generic',
          tone: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  }, [locales, localeState, saving]);

  const toggleQueueIntake = useCallback(async (queueId, isOpen) => {
    if (saving) return;
    setSaving(true);
    setQueueAction({ queueId, status: 'saving', key: '' });
    try {
      const result = await requestQueueOpenState({ request: apiClient.request, queueId, isOpen });
      const refreshed = await loadQueueProjection(apiClient.request);
      setQueueProjection(refreshed);
      setQueueSummary(summarizeQueues(refreshed));
      setQueueAction({
        queueId,
        status: result.status === 'pending' ? 'pending' : 'confirmed',
        key: result.status === 'pending' ? 'panel.queue.action_result.pending' : 'panel.queue.action_result.confirmed',
      });
    } catch (requestError) {
      setQueueAction({
        queueId,
        status: 'error',
        key: requestError?.code === 'QUEUE_REWARD_NOT_READY'
          ? 'panel.error.reward_not_ready'
          : requestError?.code === 'QUEUE_NOT_AVAILABLE'
            ? 'panel.error.queue_not_available'
            : 'panel.queue.action_result.failed',
      });
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const runQueueEntryAction = useCallback(async (queueId, entryId, action) => {
    if (saving) return;
    setSaving(true);
    setQueueAction({ queueId, entryId, status: 'saving', key: '' });
    try {
      const { result, queues, refreshFailed } = await performQueueEntryActionWithRefresh({
        request: apiClient.request, queueId, entryId, action,
      });
      if (queues) {
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      }
      const feedback = getQueueEntryActionFeedback({ action, result, refreshFailed });
      setQueueAction({
        queueId,
        entryId,
        ...feedback,
      });
    } catch (requestError) {
      setQueueAction({
        queueId,
        entryId,
        status: 'error',
        key: requestError?.code === 'QUEUE_MODE_TRANSITION_PENDING'
          ? 'panel.error.queue_mode_transition_pending'
          : 'panel.queue.action_result.failed',
      });
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const addManualQueueEntry = useCallback(async (queueId, entry) => {
    if (saving) return false;
    setSaving(true);
    setQueueAction({ queueId, status: 'saving', key: '' });
    try {
      const { result, queues, refreshFailed } = await performQueueEntryActionWithRefresh({
        request: apiClient.request, queueId, action: 'add-manual', ...entry,
      });
      if (queues) {
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      }
      setQueueAction({ queueId, ...getQueueEntryActionFeedback({ action: 'add-manual', result, refreshFailed }) });
      return true;
    } catch (requestError) {
      setQueueAction({
        queueId,
        status: 'error',
        key: getManualQueueEntryFailureKey(requestError),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const createQueue = useCallback(async (formValues) => {
    if (saving) return false;
    setSaving(true);
    setQueueCreation({ status: 'saving', key: '' });
    try {
      const result = await createQueueWithRefresh({ request: apiClient.request, formValues });
      if (result.queues) {
        setQueueProjection(result.queues);
        setQueueSummary(summarizeQueues(result.queues));
      } else if (result.queue) {
        const queues = [result.queue, ...queueProjection.filter((item) => item.id !== result.queue.id)];
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      }
      setQueueCreation({
        ...getQueueCreationFeedback(result),
        ...(result.referenceId ? { referenceId: result.referenceId } : {}),
      });
      return Boolean(result.queue);
    } catch (requestError) {
      setQueueCreation({ status: 'error', key: getQueueCreationFailureKey(requestError), referenceId: requestError?.referenceId ?? null });
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, queueProjection]);

  const saveQueueSettings = useCallback(async (queueId, values, baselineSettings) => {
    if (saving) return false;
    setSaving(true);
    setQueueSettingsAction({ queueId, status: 'saving', key: '' });
    try {
      const { queue } = await saveQueueSettingsWithRetry({
        request: apiClient.request, queueId, values, baselineSettings,
      });
      let refreshed = null;
      try { refreshed = await loadQueueProjection(apiClient.request); } catch { /* Preserve the accepted settings response. */ }
      const nextProjection = refreshed
        ? [queue, ...refreshed.filter((item) => item.id !== queue.id)]
        : [queue, ...queueProjection.filter((item) => item.id !== queue.id)];
      setQueueProjection(nextProjection);
      setQueueSummary(summarizeQueues(nextProjection));
      setQueueSettingsAction({ queueId, ...getQueueSettingsFeedback({ refreshFailed: !refreshed }) });
      return true;
    } catch (requestError) {
      if (requestError?.status === 409) {
        try {
          const latest = await loadQueueProjection(apiClient.request);
          setQueueProjection(latest);
          setQueueSummary(summarizeQueues(latest));
        } catch { /* Keep the current projection and report the conflict. */ }
      }
      setQueueSettingsAction({
        queueId, status: 'error', key: getQueueSettingsFailureKey(requestError),
        ...(requestError?.referenceId ? { referenceId: requestError.referenceId } : {}),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, queueProjection]);

  const value = useMemo(() => ({ catalogs, locales, localeState, localeNotice, runtimeState, setupState, healthState, queueProjection, queueSummary, status, error, saving, queueAction, queueCreation, queueSettingsAction, refreshing, refreshNotice, lastRefreshAt, refreshOverview, t, changeLocale, toggleQueueIntake, runQueueEntryAction, addManualQueueEntry, createQueue, saveQueueSettings }), [catalogs, locales, localeState, localeNotice, runtimeState, setupState, healthState, queueProjection, queueSummary, status, error, saving, queueAction, queueCreation, queueSettingsAction, refreshing, refreshNotice, lastRefreshAt, refreshOverview, t, changeLocale, toggleQueueIntake, runQueueEntryAction, addManualQueueEntry, createQueue, saveQueueSettings]);
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const context = useContext(PanelContext);
  if (!context) throw new Error('usePanel must be used within PanelProvider');
  return context;
}
