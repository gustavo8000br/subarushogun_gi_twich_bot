'use client';

import QueueList from './queue-list.jsx';
import { usePanel } from '../panel-shell/panel-provider.jsx';

export default function QueuesPageContent() {
  const { status, error, queueProjection, localeState, t, saving, queueAction, queueSettingsAction, toggleQueueIntake, runQueueEntryAction, addManualQueueEntry, saveQueueSettings } = usePanel();
  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">{t('panel.queues.eyebrow')}</p><h1>{t('panel.queues.title')}</h1><p className="page-description">{t('panel.queues.description')}</p></div>
      </div>
      {status === 'loading' ? <p className="status-card" role="status">{t('panel.health.database.checking')}…</p> : null}
      {status === 'unavailable' ? <p className="status-card error-card" role="alert">{t(error)}</p> : null}
      {status === 'ready' ? <QueueList queues={queueProjection} locale={localeState.locale} t={t} onToggleQueue={toggleQueueIntake} onEntryAction={runQueueEntryAction} onManualEntry={addManualQueueEntry} onSaveSettings={saveQueueSettings} saving={saving} queueAction={queueAction} queueSettingsAction={queueSettingsAction} /> : null}
    </>
  );
}
