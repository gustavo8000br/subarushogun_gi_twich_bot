import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// LA-18 (FT-70): the user guides state that a second redemption by someone with an active entry is refunded automatically.
const read = (path) => readFileSync(path, 'utf8');
const row = (text) => text.split('\n').find((line) => line.includes('duplicate_active_entry'));

describe('duplicate active entry refund note (LA-18)', () => {
  it('is in the English user guide point-return table', () => {
    const line = row(read('docs/USER_GUIDE-en_US.md'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/already has an active entry in the same queue/);
    expect(line).toMatch(/automatically requests cancellation/);
    expect(line).toMatch(/points return after Twitch confirms/);
  });

  it('is in the Portuguese user manual point-return table', () => {
    const line = row(read('docs/MANUAL_DE_USUARIO-pt_BR.md'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/já tem entrada ativa na mesma fila/);
    expect(line).toMatch(/pede automaticamente o cancelamento/);
    expect(line).toMatch(/pontos voltam após a confirmação da Twitch/);
  });
});
