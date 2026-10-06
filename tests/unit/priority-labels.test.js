import { describe, expect, it } from 'vitest';
import { priorityBenefitLabel } from '../../apps/web/priority-labels.mjs';

describe('priority benefit labels', () => {
  it.each([
    ['subscription', 'Inscrição conferida'],
    ['bits', 'Bits conferidos'],
    ['external_payment', 'Pagamento externo conferido'],
    ['operator_override', 'Outro benefício conferido'],
  ])('maps %s to safe Portuguese copy', (reason, label) => {
    expect(priorityBenefitLabel(reason)).toBe(label);
  });

  it('does not reflect arbitrary data into the panel', () => {
    expect(priorityBenefitLabel('<img src=x>')).toBe('Benefício conferido');
    expect(priorityBenefitLabel(null)).toBe('Benefício conferido');
  });
});
