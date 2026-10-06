const benefitLabels = Object.freeze({
  subscription: 'Inscrição conferida',
  bits: 'Bits conferidos',
  external_payment: 'Pagamento externo conferido',
  operator_override: 'Outro benefício conferido',
});

/** @param {unknown} reason */
export function priorityBenefitLabel(reason) {
  return typeof reason === 'string' ? benefitLabels[reason] ?? 'Benefício conferido' : 'Benefício conferido';
}
