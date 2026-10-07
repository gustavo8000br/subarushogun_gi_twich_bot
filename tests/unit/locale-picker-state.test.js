import { describe, expect, it } from 'vitest';
import { resolveLocaleSelection } from '../../apps/web/locale-picker-state.mjs';

describe('locale picker state', () => {
  it('preserves a pending locale choice while refreshing discovered catalogs', () => {
    expect(resolveLocaleSelection(['en', 'es', 'pt-BR', 'de'], 'pt-BR', 'de', true)).toBe('de');
  });

  it('shows the persisted locale when there is no pending user choice', () => {
    expect(resolveLocaleSelection(['en', 'es', 'pt-BR'], 'es', 'en', false)).toBe('es');
  });

  it('falls back to pt-BR in the picker if the persisted catalog is temporarily incomplete', () => {
    expect(resolveLocaleSelection(['en', 'pt-BR'], 'de', 'de', false)).toBe('pt-BR');
  });
});
