'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { normalizeCatalogBundle, translatePanel } from '../../lib/i18n/panel-catalogs.mjs';
import { persistProductLocale } from '../../lib/i18n/persist-product-locale.mjs';
import { loadPanelRuntimeSnapshot, loadPanelSnapshot } from './load-panel-snapshot.mjs';
import { summarizeQueues } from '../overview/queue-summary.mjs';
import { getQueueLifecycleFailureFeedback, loadQueueProjection, performQueueLifecycleAction, requestQueueOpenState } from '../queues/queue-lifecycle.mjs';
import { getManualQueueEntryFailureKey, getQueueEntryActionFailureFeedback, getQueueEntryActionFeedback, performQueueEntryActionWithRefresh, queueCallRequiresRefresh } from '../queues/queue-entry-actions.mjs';
import { createQueueWithRefresh, getQueueCreationFailureKey, getQueueCreationFeedback } from '../queues/queue-creation.mjs';
import { getQueueSettingsFailureKey, getQueueSettingsFeedback, saveQueueSettingsWithRetry } from '../queues/queue-settings.mjs';
import { loadQueueHistory as fetchQueueHistory } from '../queues/queue-history.mjs';
import { confirmQueueClear as confirmQueueClearRequest, getQueueClearFailureFeedback, previewQueueClear as previewQueueClearRequest } from '../queues/queue-clear.mjs';
import { loadQueueRewardCandidates as fetchQueueRewardCandidates, resolveQueueReward as resolveQueueRewardRequest } from '../queues/queue-reward-resolution.mjs';
import { getQueueRewardSettingsFailureFeedback, updateQueueRewardSettings as updateQueueRewardSettingsRequest } from '../queues/queue-reward-settings.mjs';

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
  const [queueLifecycleNotice, setQueueLifecycleNotice] = useState(null);
  const [queueCreation, setQueueCreation] = useState(null);
  const [queueSettingsAction, setQueueSettingsAction] = useState(null);
  const [queueClearRefreshRequired, setQueueClearRefreshRequired] = useState(false);
  const [queueCallRecovery, setQueueCallRecovery] = useState(null);
  const queueCallRefreshRequired = Boolean(queueCallRecovery?.required);
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
      setQueueClearRefreshRequired(false);
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

  const runQueueEntryAction = useCallback(async (queueId, entryId, action, actionOptions = {}) => {
    if (saving) return;
    if (['call-next', 'call'].includes(action) && queueCallRefreshRequired) return;
    if (['call-next', 'call'].includes(action)) setQueueCallRecovery(null);
    setSaving(true);
    setQueueAction({ queueId, entryId, status: 'saving', key: '' });
    try {
      const { result, queues, refreshFailed } = await performQueueEntryActionWithRefresh({
        request: apiClient.request, queueId, entryId, action,
        ...actionOptions,
      });
      if (queues) {
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      }
      const feedback = getQueueEntryActionFeedback({ action, result, refreshFailed, priority: actionOptions.priority });
      if (queueCallRequiresRefresh({ action, feedback, refreshFailed })) {
        setQueueCallRecovery({ queueId, required: true, key: feedback.key });
        setQueueAction(null);
        return;
      }
      setQueueAction({
        queueId,
        entryId,
        ...feedback,
      });
    } catch (requestError) {
      const feedback = getQueueEntryActionFailureFeedback(requestError, { action });
      if (queueCallRequiresRefresh({ action, feedback })) {
        setQueueCallRecovery({ queueId, required: true, key: feedback.key, referenceId: feedback.referenceId ?? null });
        setQueueAction(null);
        return;
      }
      setQueueAction({
        queueId,
        entryId,
        ...feedback,
      });
    } finally {
      setSaving(false);
    }
  }, [queueCallRefreshRequired, saving]);

  const loadQueueHistory = useCallback((queueId) => fetchQueueHistory({ request: apiClient.request, queueId }), []);

  const refreshQueueProjection = useCallback(async ({ purpose = 'general' } = {}) => {
    try {
      const queues = await loadQueueProjection(apiClient.request);
      setQueueProjection(queues);
      setQueueSummary(summarizeQueues(queues));
      setQueueClearRefreshRequired(false);
      if (queueCallRefreshRequired) {
        setQueueCallRecovery((current) => current ? { ...current, required: false, key: 'panel.queue.call_next.refreshed' } : current);
      }
      if (purpose === 'reward-link') setQueueAction((current) => current?.key === 'panel.reward.link_refresh_failed'
        ? { ...current, status: 'confirmed', key: 'panel.reward.link_refreshed', referenceId: null }
        : current);
      if (purpose === 'reward-settings') setQueueAction((current) => current?.key === 'panel.reward.settings_refresh_failed'
        ? { ...current, status: 'pending', key: 'panel.notice.reward_update_pending', referenceId: null }
        : current);
      if (purpose === 'manual-entry') setQueueAction((current) => {
        if (current?.key !== 'panel.entry.add.refresh_failed') return current;
        const reconciled = queues.some((queue) => queue.id === current.queueId
          && queue.entries.some((entry) => entry.id === current.entryId));
        return reconciled
          ? { ...current, status: 'confirmed', key: 'panel.entry.added', referenceId: null, values: undefined }
          : current;
      });
      return true;
    } catch (error) {
      if (purpose === 'clear') setQueueClearRefreshRequired(true);
      if (queueCallRefreshRequired) {
        setQueueCallRecovery((current) => current ? { ...current, required: true, key: 'panel.queue.call_next.refresh_failed' } : current);
      }
      if (purpose === 'reward-link') {
        const referenceId = typeof error?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.referenceId) ? error.referenceId : null;
        setQueueAction((current) => current?.key === 'panel.reward.link_refresh_failed' ? { ...current, referenceId } : current);
      }
      return false;
    }
  }, [queueCallRefreshRequired]);

  const previewQueueClear = useCallback((queueId) => {
    if (queueClearRefreshRequired) return Promise.resolve({ status: 'refresh_required' });
    return previewQueueClearRequest({ request: apiClient.request, queueId });
  }, [queueClearRefreshRequired]);

  const confirmQueueClear = useCallback(async (queueId) => {
    if (queueClearRefreshRequired) return { status: 'refresh_required' };
    if (saving) return null;
    setSaving(true);
    setQueueAction({ queueId, status: 'saving', key: '' });
    try {
      const result = await confirmQueueClearRequest({ request: apiClient.request, queueId });
      if (result.status === 'cleared') {
        try {
          const refreshed = await loadQueueProjection(apiClient.request);
          setQueueProjection(refreshed);
          setQueueSummary(summarizeQueues(refreshed));
          setQueueAction({ queueId, status: 'confirmed', key: 'panel.queue.action_result.confirmed' });
        } catch {
          setQueueClearRefreshRequired(true);
          return { ...result, refreshRequired: true };
        }
      } else if (result.status === 'empty') {
        const refreshed = await refreshQueueProjection({ purpose: 'clear' });
        setQueueClearRefreshRequired(!refreshed);
        setQueueAction(null);
        return { status: 'uncertain', refreshRequired: !refreshed };
      }
      return result;
    } catch (error) {
      const feedback = getQueueClearFailureFeedback(error, { phase: 'confirm' });
      let refreshed = true;
      if (feedback.key === 'panel.queue.clear.uncertain') {
        refreshed = await refreshQueueProjection({ purpose: 'clear' });
        setQueueClearRefreshRequired(!refreshed);
      }
      setQueueAction(null);
      return {
        status: feedback.key === 'panel.queue.clear.uncertain' ? 'uncertain' : 'failed',
        referenceId: feedback.referenceId,
        ...(feedback.key === 'panel.queue.clear.uncertain' ? { refreshRequired: !refreshed } : {}),
      };
    } finally {
      setSaving(false);
    }
  }, [queueClearRefreshRequired, refreshQueueProjection, saving]);

  const runQueueLifecycleAction = useCallback(async (queueId, action, context = {}) => {
    if (saving) return null;
    setSaving(true);
    setQueueLifecycleNotice(null);
    try {
      const result = await performQueueLifecycleAction({ request: apiClient.request, queueId, action, queue: context.queue, challenge: context.challenge });
      if (action === 'archive-local-confirm' && result.status === 'archived') {
        setQueueLifecycleNotice({ key: 'panel.queue.archive_local.done' });
      } else if (action === 'unarchive' && result.status === 'unarchived') {
        setQueueLifecycleNotice({ key: 'panel.queue.unarchive.done' });
      }
      try {
        const refreshed = loadQueueProjection(apiClient.request);
        const queues = await refreshed;
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      } catch {
        // Keep the accepted lifecycle response even when its follow-up read fails.
      }
      return result;
    } catch (requestError) {
      if (action.startsWith('archive-local-')) {
        const key = requestError?.code === 'QUEUE_REWARD_OPERATION_PROCESSING' ? 'panel.queue.archive_local.processing'
          : requestError?.code === 'LOCAL_ARCHIVE_CHALLENGE_EXPIRED' ? 'panel.queue.archive_local.expired'
            : requestError?.code === 'STALE_QUEUE_VERSION' ? 'panel.queue.archive_local.stale'
              : 'panel.queue.archive_local.unavailable';
        return { status: 'error', key };
      }
      if (action === 'cancel-delete') return getQueueLifecycleFailureFeedback(requestError, { action });
      return null;
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const loadQueueRewardCandidates = useCallback((queueId) => fetchQueueRewardCandidates({ request: apiClient.request, queueId }), []);

  const resolveQueueReward = useCallback(async (queueId, rewardId) => {
    if (saving) return null;
    setSaving(true);
    setQueueAction({ queueId, status: 'saving', key: '' });
    let refreshFailed = false;
    try {
      const result = await resolveQueueRewardRequest({ request: apiClient.request, queueId, rewardId });
      try {
        const queues = await loadQueueProjection(apiClient.request);
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
        setQueueAction({ queueId, status: 'confirmed', key: 'panel.reward.link_success' });
      } catch (refreshError) {
        refreshFailed = true;
        const referenceId = typeof refreshError?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(refreshError.referenceId) ? refreshError.referenceId : null;
        setQueueAction({ queueId, status: 'warning', key: 'panel.reward.link_refresh_failed', referenceId });
      }
      return { ...result, refreshFailed };
    } catch (requestError) {
      const referenceId = typeof requestError?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(requestError.referenceId) ? requestError.referenceId : null;
      setQueueAction({ queueId, status: 'error', key: 'panel.reward.link_error_title', referenceId });
      return { status: 'error', referenceId };
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const saveQueueRewardSettings = useCallback(async (queueId, settings) => {
    if (saving) return { status: 'error' };
    setSaving(true);
    try {
      const result = await updateQueueRewardSettingsRequest({ request: apiClient.request, queueId, settings });
      let refreshFailed = false;
      try {
        const queues = await loadQueueProjection(apiClient.request);
        setQueueProjection(queues);
        setQueueSummary(summarizeQueues(queues));
      } catch {
        refreshFailed = true;
      }
      if (refreshFailed) {
        const acceptedProjection = queueProjection.map((queue) => queue.id === queueId ? result : queue);
        setQueueProjection(acceptedProjection);
        setQueueSummary(summarizeQueues(acceptedProjection));
      }
      setQueueAction({
        queueId,
        status: refreshFailed ? 'warning' : 'pending',
        key: refreshFailed ? 'panel.reward.settings_refresh_failed' : 'panel.notice.reward_update_pending',
      });
      return { status: 'pending', refreshFailed, result };
    } catch (requestError) {
      return { status: 'error', ...getQueueRewardSettingsFailureFeedback(requestError) };
    } finally {
      setSaving(false);
    }
  }, [saving, queueProjection]);

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
      } else if (entry.login && result?.id) {
        const acceptedEntry = {
          id: result.id,
          userLogin: entry.login,
          displayName: entry.login,
          status: result.status,
          position: result.position,
          priorityClass: entry.priority ? 'priority' : 'standard',
          priorityReason: entry.priority ? entry.priorityReason : null,
          uid: entry.uid || null,
        };
        const acceptedProjection = queueProjection.map((queue) => queue.id === queueId
          ? { ...queue, entries: [...queue.entries.filter((item) => item.id !== result.id), acceptedEntry].sort((left, right) => left.position - right.position) }
          : queue);
        setQueueProjection(acceptedProjection);
        setQueueSummary(summarizeQueues(acceptedProjection));
      }
      setQueueAction({
        queueId,
        ...(refreshFailed && entry.login ? {
          status: 'warning', key: 'panel.entry.add.refresh_failed', entryId: result.id,
          values: { user: entry.login, position: result.position },
        } : getQueueEntryActionFeedback({ action: 'add-manual', result, refreshFailed })),
      });
      return true;
    } catch (requestError) {
      const referenceId = typeof requestError?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(requestError.referenceId)
        ? requestError.referenceId
        : null;
      setQueueAction({
        queueId,
        status: 'error',
        key: getManualQueueEntryFailureKey(requestError),
        ...(referenceId ? { referenceId } : {}),
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, queueProjection]);

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

  const value = useMemo(() => ({ catalogs, locales, localeState, localeNotice, runtimeState, setupState, healthState, queueProjection, queueSummary, status, error, saving, queueAction, queueLifecycleNotice, queueCallRecovery, queueCreation, queueSettingsAction, refreshing, refreshNotice, lastRefreshAt, refreshOverview, t, changeLocale, toggleQueueIntake, runQueueEntryAction, runQueueLifecycleAction, loadQueueRewardCandidates, resolveQueueReward, saveQueueRewardSettings, addManualQueueEntry, loadQueueHistory, previewQueueClear, confirmQueueClear, refreshQueueProjection, queueClearRefreshRequired, queueCallRefreshRequired, createQueue, saveQueueSettings }), [catalogs, locales, localeState, localeNotice, runtimeState, setupState, healthState, queueProjection, queueSummary, status, error, saving, queueAction, queueLifecycleNotice, queueCallRecovery, queueCreation, queueSettingsAction, refreshing, refreshNotice, lastRefreshAt, refreshOverview, t, changeLocale, toggleQueueIntake, runQueueEntryAction, runQueueLifecycleAction, loadQueueRewardCandidates, resolveQueueReward, saveQueueRewardSettings, addManualQueueEntry, loadQueueHistory, previewQueueClear, confirmQueueClear, refreshQueueProjection, queueClearRefreshRequired, queueCallRefreshRequired, createQueue, saveQueueSettings]);
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const context = useContext(PanelContext);
  if (!context) throw new Error('usePanel must be used within PanelProvider');
  return context;
}
