'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api/client.mjs';
import { usePanel } from '../panel-shell/panel-provider.jsx';
import {
  getOperationActions,
  getOperationGroup,
  getOperationIdentifier,
  getOperationStatusKey,
  getOperationTypeKey,
  performOperationActionWithRefresh,
  validateOperationsProjection,
} from './operations.mjs';

const OPERATION_GROUPS = Object.freeze([
  ['twitch_sync', 'panel.operations.group.twitch_sync'],
  ['points_refund', 'panel.operations.group.points_refund'],
  ['redemption_fulfillment', 'panel.operations.group.redemption_fulfillment'],
]);

const STATUS_CLASSES = new Set([
  'pending', 'retry', 'processing', 'unknown', 'conflict', 'failed',
  'confirmed', 'resolved_manual', 'cancelled', 'cancel_verification',
]);

function safeReferenceId(error) {
  return typeof error?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.referenceId)
    ? error.referenceId : null;
}

function OperationCard({ operation, locale, t, saving, anySaving, onAction }) {
  const count = operation.attempts;
  const pluralCategory = count === 0 ? 'other' : new Intl.PluralRules(locale).select(count);
  const pluralKey = `panel.operation.attempts.${pluralCategory}`;
  const attemptText = t(pluralKey, { values: { count: new Intl.NumberFormat(locale).format(count) } });
  const statusClass = STATUS_CLASSES.has(operation.status) ? operation.status : 'unknown';
  const actionKeys = {
    resolve_unknown: 'panel.operation.action.resolve',
    retry: 'panel.operation.action.retry',
    continue_delete: 'panel.operation.action.continue_delete',
  };

  return (
    <article className="operation-card" aria-labelledby={`operation-title-${operation.id}`}>
      <header className="operation-card-heading">
        <strong id={`operation-title-${operation.id}`}>{t(getOperationTypeKey(operation.type))}</strong>
        <span className={`operation-status is-${statusClass}`}>{t(getOperationStatusKey(operation.status))}</span>
      </header>
      <div className="operation-card-meta">
        <code>{getOperationIdentifier(operation)}</code>
        <span>{attemptText}</span>
      </div>
      {getOperationActions(operation).length ? (
        <div className="operation-card-actions">
          {getOperationActions(operation).map((action) => (
            <button key={action} type="button" className="button button-secondary" disabled={saving || anySaving} onClick={() => onAction(operation, action)}>
              {saving ? t('panel.queue.action_result.saving') : t(actionKeys[action])}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** @param {{t:(key:string, options?:object)=>string, locale:string, request?:(path:string, options?:object)=>Promise<any>}} props */
export default function OperationsPageContent({ t, locale, request = apiClient.request }) {
  const [operations, setOperations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingOperationId, setSavingOperationId] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [loadErrorReference, setLoadErrorReference] = useState(null);
  const requestInFlight = useRef(false);
  const operationsRef = useRef(null);
  const confirmationDialog = useRef(null);

  useEffect(() => { operationsRef.current = operations; }, [operations]);

  const loadOperations = useCallback(async ({ quiet = false } = {}) => {
    if (requestInFlight.current) return { ok: false, skipped: true };
    if (quiet && operationsRef.current === null) return { ok: false, skipped: true };
    requestInFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const result = validateOperationsProjection(await request('/api/operations'));
      operationsRef.current = result;
      setOperations(result);
      setLoading(false);
      setLoadErrorReference(null);
      if (quiet) setNotice(null);
      return { ok: true };
    } catch (error) {
      setLoading(false);
      const referenceId = safeReferenceId(error);
      setLoadErrorReference(referenceId);
      if (operationsRef.current === null) {
        setOperations(null);
        setNotice(null);
      } else if (!quiet) {
        setNotice({ key: 'panel.operations.refresh_failed', error: true, referenceId });
      }
      return { ok: false, referenceId };
    } finally {
      requestInFlight.current = false;
    }
  }, [request]);

  useEffect(() => {
    void loadOperations();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOperations({ quiet: true });
    }, 5000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadOperations({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadOperations]);

  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!confirmation && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [confirmation]);

  async function runOperationAction(operation, action) {
    if (reconciling) return;
    setSavingOperationId(operation.id);
    setNotice(null);
    try {
      const result = await performOperationActionWithRefresh({ request, operation, action });
      const nextOperations = result.operations ?? operationsRef.current?.map((item) => (
        item.id === operation.id ? { ...item, status: result.result.status } : item
      ));
      if (nextOperations) {
        operationsRef.current = nextOperations;
        setOperations(nextOperations);
      }
      setNotice({
        key: result.refreshFailed
          ? 'panel.operations.action_refresh_failed'
          : action === 'resolve_unknown'
            ? 'panel.operations.action_manual_resolution'
            : 'panel.operations.action_retry_pending',
        error: result.refreshFailed,
        referenceId: result.refreshFailed ? safeReferenceId({ referenceId: result.refreshReferenceId }) : null,
      });
    } catch (error) {
      setNotice({ key: 'panel.operations.action_failed', error: true, referenceId: safeReferenceId(error) });
    } finally {
      setSavingOperationId(null);
    }
  }

  async function reconcileWithTwitch() {
    if (reconciling || savingOperationId) return;
    setReconciling(true);
    setNotice({ key: 'panel.reconciliation.running' });
    try {
      const result = await request('/api/reconciliation', { method: 'POST', body: '{}' });
      if (!result || !['complete', 'partial', 'failed'].includes(result.status)
        || !Array.isArray(result.issues)
        || (result.status !== 'complete' && result.issues.length === 0)
        || (result.imported !== undefined && (!Number.isInteger(result.imported) || result.imported < 0))) {
        throw new Error('invalid reconciliation result');
      }
      const projection = await loadOperations({ quiet: true });
      if (!projection?.ok) {
        setNotice({ key: 'panel.reconciliation.refresh_failed', error: true, referenceId: projection?.referenceId });
        return;
      }
      const issueCount = result.issues.length;
      if (result.status !== 'complete' || issueCount > 0) {
        const plural = issueCount === 0 ? 'other' : new Intl.PluralRules(locale).select(issueCount);
        setNotice({ key: `panel.reconciliation.issues.${plural}`, values: { count: new Intl.NumberFormat(locale).format(issueCount) }, error: true });
      } else {
        const imported = result.imported ?? 0;
        const plural = imported === 0 ? 'other' : new Intl.PluralRules(locale).select(imported);
        setNotice({ key: `panel.reconciliation.complete.${plural}`, values: { count: new Intl.NumberFormat(locale).format(imported) } });
      }
    } catch (error) {
      setNotice({ key: 'panel.operations.reconcile_failed', error: true, referenceId: safeReferenceId(error) });
    } finally {
      setReconciling(false);
    }
  }

  function requestOperationAction(operation, action) {
    if (action === 'resolve_unknown' || action === 'continue_delete') {
      setConfirmation({ operation, action });
      return;
    }
    void runOperationAction(operation, action);
  }

  function acceptConfirmation() {
    if (!confirmation || savingOperationId || reconciling) return;
    const { operation, action } = confirmation;
    setConfirmation(null);
    void runOperationAction(operation, action);
  }

  const grouped = operations === null ? null : OPERATION_GROUPS.map(([id, label]) => ({
    id,
    label,
    items: operations.filter((operation) => getOperationGroup(operation) === id),
  })).filter((group) => group.items.length > 0);
  const confirmationCopy = confirmation?.action === 'resolve_unknown'
    ? 'panel.operation.confirm.resolve'
    : 'panel.operation.confirm.continue_delete';
  const confirmationAccept = confirmation?.action === 'resolve_unknown'
    ? 'panel.operation.action.resolve'
    : 'panel.operation.action.continue_delete';
  const noticeReference = notice?.referenceId ? t('panel.error.reference', { values: { id: notice.referenceId } }) : null;

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">{t('panel.operations.eyebrow')}</p><h1>{t('panel.operations.title')}</h1><p className="page-description">{t('panel.operations.description')}</p></div>
        <div className="operations-heading-actions">
          <button type="button" className="button button-secondary operations-reconcile" disabled={reconciling || savingOperationId !== null || Boolean(confirmation)} onClick={() => void reconcileWithTwitch()}>
            {reconciling ? t('panel.reconciliation.running') : t('panel.connection.reconcile')}
          </button>
          <button type="button" className="button button-secondary operations-refresh" disabled={loading || reconciling || savingOperationId !== null} onClick={() => void loadOperations()}>
            {loading ? t('panel.operations.refreshing') : t('panel.operations.refresh')}
          </button>
        </div>
      </section>
      {notice ? <div className={`operation-notice${notice.error ? ' is-error' : ''}`} role={notice.error ? 'alert' : 'status'}><p>{t(notice.key, { values: notice.values })}</p>{noticeReference ? <small>{noticeReference}</small> : null}</div> : null}
      {loading && operations === null ? <p className="status-card" role="status">{t('panel.operations.loading')}</p> : null}
      {!loading && operations === null ? <section className="status-card error-card" role="alert"><p>{t('panel.error.local_load')}</p>{loadErrorReference ? <small>{t('panel.error.reference', { values: { id: loadErrorReference } })}</small> : null}<button type="button" className="button button-secondary" onClick={() => void loadOperations()}>{t('panel.operations.refresh')}</button></section> : null}
      {!loading && operations?.length === 0 ? <section className="operation-empty"><h2>{t('panel.operations.empty')}</h2><p>{t('panel.operations.empty_hint')}</p></section> : null}
      {grouped?.length ? <div className="operation-groups">
        {grouped.map((group) => <section className="operation-group" key={group.id} aria-labelledby={`operation-group-${group.id}`}>
          <h2 id={`operation-group-${group.id}`}>{t(group.label)} <span>{new Intl.NumberFormat(locale).format(group.items.length)}</span></h2>
          <div className="operation-list">
            {group.items.map((operation) => <OperationCard
              key={operation.id}
              operation={operation}
              locale={locale}
              t={t}
              saving={savingOperationId === operation.id}
              anySaving={savingOperationId !== null || reconciling}
              onAction={requestOperationAction}
            />)}
          </div>
        </section>)}
      </div> : null}
      <dialog
        ref={confirmationDialog}
        className="operation-confirmation"
        aria-labelledby="operation-confirmation-title"
        aria-describedby="operation-confirmation-copy"
        onCancel={(event) => { event.preventDefault(); if (!savingOperationId) setConfirmation(null); }}
        onClose={() => { if (confirmation) setConfirmation(null); }}
      >
        <h2 id="operation-confirmation-title">{t('panel.confirmation.title')}</h2>
        <p id="operation-confirmation-copy">{confirmation ? t(confirmationCopy) : ''}</p>
        <div className="operation-confirmation-actions">
          <button type="button" className="button button-secondary" disabled={Boolean(savingOperationId) || reconciling} onClick={() => setConfirmation(null)}>{t('panel.confirmation.cancel')}</button>
          <button type="button" className="button button-primary" disabled={Boolean(savingOperationId) || reconciling} onClick={acceptConfirmation}>{t(confirmationAccept)}</button>
        </div>
      </dialog>
    </>
  );
}

export function OperationsPanelPageContent() {
  const { t, localeState } = usePanel();
  return <OperationsPageContent t={t} locale={localeState.locale} />;
}
