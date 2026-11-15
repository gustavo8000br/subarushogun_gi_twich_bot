'use client';

import { useState } from 'react';

// E7: "Reference: <code>id</code> [Copy reference]" with two live regions that exist (empty) from the first render.
// Used inside the load-failure alert card; the id is plain text in reading order, nothing here moves focus.
export function ReferenceLine({ referenceId, t }) {
  const [copyState, setCopyState] = useState('idle');
  const sentence = t('panel.error.reference', { values: { id: referenceId } });
  const at = sentence.lastIndexOf(referenceId);

  function copy() {
    const clipboard = globalThis.navigator?.clipboard;
    const fail = () => setCopyState('failed');
    if (typeof clipboard?.writeText !== 'function') { fail(); return; }
    // Called synchronously inside the click handler to keep transient user activation; only the id is copied.
    let pending;
    try { pending = clipboard.writeText(referenceId); } catch { fail(); return; }
    Promise.resolve(pending).then(() => setCopyState('copied'), fail);
  }

  return (
    <div className="reference-line">
      <p>
        {at < 0 ? <>{sentence} <code>{referenceId}</code></> : <>{sentence.slice(0, at)}<code>{referenceId}</code>{sentence.slice(at + referenceId.length)}</>}
      </p>
      <button type="button" onClick={copy}>{t('panel.error.reference_copy')}</button>
      <span role="status" className="reference-feedback">{copyState === 'copied' ? t('panel.error.reference_copied') : ''}</span>
      <span role="alert" className="reference-feedback">{copyState === 'failed' ? t('panel.error.reference_copy_failed') : ''}</span>
    </div>
  );
}
