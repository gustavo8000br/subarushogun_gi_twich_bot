'use client';

import { wrongHostForPanel } from './wrong-host.mjs';
import { ReferenceLine } from './reference-line.jsx';

// LA-17: explanation plus a plain link (no automatic redirect: it would hide the cause, and cookies and
// certificate trust are per host). The link text carries the URL so it is meaningful out of context.
export function WrongHostMessage({ wrongHost, t }) {
  return (
    <>
      <span>{t('panel.error.wrong_host', { values: { host: wrongHost.host } })}</span>{' '}
      <a href={wrongHost.url}>{t('panel.error.wrong_host_action', { values: { url: wrongHost.url } })}</a>
    </>
  );
}

// The load-failure card of the panel shell: same role="alert" container as the generic message.
export function PanelLoadError({ error, referenceId = null, t }) {
  const wrongHost = error === 'panel.error.wrong_host' ? wrongHostForPanel() : null;
  return (
    <div className="status-card error-card" role="alert">
      <p>{wrongHost ? <WrongHostMessage wrongHost={wrongHost} t={t} /> : t(error === 'panel.error.wrong_host' ? 'panel.error.local_load' : error)}</p>
      {!wrongHost && referenceId ? <ReferenceLine referenceId={referenceId} t={t} /> : null}
    </div>
  );
}

// D-3: the same message and link when an action (a mutation) is refused for its Origin at a loopback IP literal.
export function WrongOriginAlert({ t }) {
  const wrongHost = wrongHostForPanel();
  if (!wrongHost) return null;
  return (
    <p className="status-card error-card" role="alert">
      <WrongHostMessage wrongHost={wrongHost} t={t} />
    </p>
  );
}
