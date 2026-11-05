'use client';

const SAFE_REFERENCE = /^[A-Za-z0-9_.-]{1,64}$/;
const LINK_ACTIONS = Object.freeze({
  operations: { href: '/operations/', label: 'panel.queue.deletion.blocked_link' },
  connection: { href: '/connection/', label: 'panel.navigation.connection' },
});

/** The text of one outcome; plural keys (`count`) pick the locale's form (R7), and 0 uses `other` as the rest of the panel does. */
function outcomeText(t, locale, outcome) {
  if (Number.isFinite(outcome.count)) {
    const category = outcome.count === 0 ? 'other' : new Intl.PluralRules(locale).select(outcome.count);
    return t(`${outcome.key}.${category}`, { values: { count: new Intl.NumberFormat(locale).format(outcome.count) } });
  }
  return t(outcome.key, outcome.values ? { values: outcome.values } : undefined);
}

/**
 * FT-23 (AC 1, R4): ONE persistent container with TWO live elements that are always mounted, empty until a message arrives:
 * `role="status"` for success and pending outcomes, `role="alert"` for refusals. The message is written into the element that
 * matches its kind and the other one is emptied; the role of an element that holds text is never switched. The dismiss and
 * action controls sit OUTSIDE the live elements so they are not re-read on every update. Nothing disappears on a timer.
 * @param {{outcome: Record<string, any>|null, t: (key:string, options?:object)=>string, locale: string, onDismiss: ()=>void, onRefresh: ()=>void}} props
 */
export default function OutcomeRegion({ outcome, t, locale, onDismiss, onRefresh }) {
  const text = outcome ? outcomeText(t, locale, outcome) : null;
  const reference = typeof outcome?.referenceId === 'string' && SAFE_REFERENCE.test(outcome.referenceId)
    ? <small>{t('panel.error.reference', { values: { id: outcome.referenceId } })}</small> : null;
  const link = outcome?.action ? LINK_ACTIONS[outcome.action] : null;
  return (
    <div className="outcome-region">
      <p className="outcome-message" role="status" aria-atomic="true">{outcome?.element === 'status' ? <>{text}{reference ? <> {reference}</> : null}</> : null}</p>
      <p className="outcome-message" role="alert" aria-atomic="true">{outcome?.element === 'alert' ? <>{text}{reference ? <> {reference}</> : null}</> : null}</p>
      {outcome ? <div className="outcome-controls">
        {outcome.action === 'refresh' ? <button type="button" className="outcome-action" onClick={() => onRefresh?.()}>{t('panel.outcome.action.refresh')}</button> : null}
        {link ? <a className="outcome-action" href={link.href}>{t(link.label)}</a> : null}
        <button type="button" className="outcome-dismiss" onClick={() => onDismiss?.()}>{t('panel.outcome.dismiss')}</button>
      </div> : null}
    </div>
  );
}
