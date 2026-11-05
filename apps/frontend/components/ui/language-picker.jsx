'use client';

import { useState } from 'react';
import { usePanel } from '../../features/panel-shell/panel-provider.jsx';

const LANGUAGE_NAMES = Object.freeze({ 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español' });

export default function LanguagePicker() {
  const { locales, localeState, localeNotice, changeLocale, status, saving, t } = usePanel();
  const [choice, setChoice] = useState(null);
  // TS-10: a persisted locale without a catalog falls back to pt-BR; the user's choice stays visible while it is saved.
  const persisted = locales.includes(localeState.locale) ? localeState.locale : (locales.includes('pt-BR') ? 'pt-BR' : (locales[0] ?? ''));
  const value = saving && choice && locales.includes(choice) ? choice : persisted;
  return (
    <label className="language-picker">
      <span>{t('panel.locale.label')}</span>
      <select
        aria-label={t('panel.locale.label')}
        value={value}
        disabled={status !== 'ready' || saving || locales.length === 0}
        onChange={(event) => { setChoice(event.target.value); void changeLocale(event.target.value); }}
      >
        {locales.map((locale) => <option key={locale} value={locale}>{LANGUAGE_NAMES[locale] ?? locale}</option>)}
      </select>
      {status === 'loading' ? <span role="status" aria-live="polite">{t('panel.locale.loading')}</span> : null}
      {saving ? <span role="status" aria-live="polite">{t('panel.locale.saving')}</span> : null}
      {!saving && localeNotice ? <span
        className={`locale-notice is-${localeNotice.tone}`}
        role={localeNotice.tone === 'error' ? 'alert' : 'status'}
        aria-live={localeNotice.tone === 'error' ? 'assertive' : 'polite'}
      >{t(localeNotice.key)}</span> : null}
    </label>
  );
}
