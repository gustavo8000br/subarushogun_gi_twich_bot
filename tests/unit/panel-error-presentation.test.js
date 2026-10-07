import { describe, expect, it } from 'vitest';
import { presentPanelError } from '../../apps/web/panel-error-presentation.mjs';

const catalogs = {
  'pt-BR': {
    'panel.error.generic': 'Não foi possível concluir. Tente novamente.',
    'panel.error.locale_conflict': 'O idioma mudou em outra solicitação. Atualize a página.',
  },
  en: {
    'panel.error.generic': 'Could not complete the action. Try again.',
    'panel.error.locale_conflict': 'The language changed in another request. Refresh the page.',
  },
};

describe('panel error presentation', () => {
  it('maps stable API codes to local catalog copy without exposing backend messages', () => {
    const result = presentPanelError({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT', message: 'database token=secret' }, 'en', catalogs);

    expect(result).toBe('The language changed in another request. Refresh the page.');
    expect(result).not.toContain('database');
    expect(result).not.toContain('secret');
  });

  it('uses a localized generic message for unknown codes, network errors, and missing translations', () => {
    expect(presentPanelError({ code: 'INTERNAL_ERROR', message: 'raw backend details' }, 'en', catalogs))
      .toBe('Could not complete the action. Try again.');
    expect(presentPanelError(new Error('browser network details'), 'en', catalogs))
      .toBe('Could not complete the action. Try again.');
    expect(presentPanelError({ code: 'INTERNAL_ERROR' }, 'es', catalogs))
      .toBe('Não foi possível concluir. Tente novamente.');
  });
});
