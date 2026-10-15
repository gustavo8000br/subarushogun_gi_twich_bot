'use client';

import { usePanel } from '../panel-shell/panel-provider.jsx';
import NewQueueForm from './new-queue-form.jsx';

export default function NewQueuePageContent() {
  const { t, setupState, saving, queueCreation, createQueue } = usePanel();
  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">{t('panel.new_queue.eyebrow')}</p><h1>{t('panel.new_queue.title')}</h1><p className="page-description">{t('panel.new_queue.description')}</p></div>
      </div>
      <section className="panel create-panel" aria-label={t('panel.new_queue.title')}>
        <NewQueueForm t={t} saving={saving} feedback={queueCreation} twitchConnected={setupState?.connected === true} onCreate={createQueue} />
      </section>
    </>
  );
}
