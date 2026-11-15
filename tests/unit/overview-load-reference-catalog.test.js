import { describe, expect, it } from 'vitest';
import { loadFirstPartyPanelFallback } from '../../apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs';

// E7 / AC-E7.6 (node environment: the loader reads the real catalog files). The fallback is what a failed first load renders.
describe('E7 reference keys in the bundled first-party fallback', () => {
  it('is part of the bundled first-party fallback used when the catalog request fails', async () => {
    const fallback = await loadFirstPartyPanelFallback();
    expect(fallback['pt-BR']['panel.error.reference']).toBe('Referência: {id}');
    expect(fallback['pt-BR']['panel.error.reference_copy']).toBe('Copiar referência');
    expect(fallback['pt-BR']['panel.error.reference_copied']).toBe('Referência copiada');
    expect(fallback['pt-BR']['panel.error.reference_copy_failed']).toContain('Selecione o código');
  });
});
