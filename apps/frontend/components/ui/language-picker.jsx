'use client';

import { usePanel } from '../../features/panel-shell/panel-provider.jsx';

const LANGUAGE_NAMES = Object.freeze({ 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español' });

export default function LanguagePicker() {
  const { locales, localeState, changeLocale, saving, t } = usePanel();
  return (
    <label className="language-picker">
      <span>{t('panel.locale.label')}</span>
      <select
        aria-label={t('panel.locale.label')}
        value={localeState.locale}
        disabled={saving || locales.length === 0}
        onChange={(event) => void changeLocale(event.target.value)}
      >
        {locales.map((locale) => <option key={locale} value={locale}>{LANGUAGE_NAMES[locale] ?? locale}</option>)}
      </select>
      {saving ? <span aria-live="polite">{t('panel.health.database.checking')}</span> : null}
    </label>
  );
}
