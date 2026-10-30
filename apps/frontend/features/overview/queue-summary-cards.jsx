/** @param {{summary:{queues:number,waiting:number,inService:number},locale:string,t:(key:string)=>string}} props */
export default function QueueSummaryCards({ summary, locale, t }) {
  const format = (value) => new Intl.NumberFormat(locale).format(value);
  return (
    <section className="summary-section" aria-label={t('panel.summary.label')}>
      <article className="summary-card"><span>{t('panel.summary.queues')}</span><strong>{format(summary.queues)}</strong><small>{t('panel.summary.configured')}</small></article>
      <article className="summary-card"><span>{t('panel.summary.waiting')}</span><strong>{format(summary.waiting)}</strong><small>{t('panel.summary.viewers_waiting')}</small></article>
      <article className="summary-card"><span>{t('panel.summary.in_service')}</span><strong>{format(summary.inService)}</strong><small>{t('panel.summary.called_or_started')}</small></article>
    </section>
  );
}
