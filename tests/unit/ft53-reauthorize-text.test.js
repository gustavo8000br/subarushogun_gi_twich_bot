// OPS-22 FT-53 (UX plan 2.2): the reauthorize text exists in the three panel catalogs, names the Twitch connection page by its
// navigation label, says both facts, and never promises that cancelling will work after reauthorization.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function catalog(locale) {
  const text = await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
  return new Map(text.split('\n').filter(Boolean).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
}

const KEY = 'panel.queue.delete.cancel.remote_delete_attempted_reauthorize';
const TEXT = {
  en: 'The request to delete the reward may have reached Twitch, but Twitch refused the authorization, so we could not check whether the reward still exists. The deletion was not cancelled. Reauthorize the channel on the Twitch connection page, refresh the panel, and review the queue before trying to cancel again.',
  es: 'La solicitud para eliminar la recompensa puede haber llegado a Twitch, pero Twitch rechazó la autorización y no se pudo comprobar si la recompensa sigue existiendo. La eliminación no se canceló. Vuelve a autorizar el canal en la página Conexión de Twitch, actualiza el panel y revisa la cola antes de intentar cancelar de nuevo.',
  'pt-BR': 'O pedido para excluir a recompensa pode ter chegado à Twitch, mas a Twitch recusou a autorização e não foi possível conferir se ela ainda existe. A exclusão não foi cancelada. Reautorize o canal na página Conexão Twitch, atualize o painel e confira a fila antes de tentar cancelar de novo.',
};

describe('FT-53 reauthorize text', () => {
  for (const locale of Object.keys(TEXT)) {
    it(`${locale}: the approved text is shipped and the generic text is unchanged`, async () => {
      const panel = await catalog(locale);
      expect(panel.get(KEY)).toBe(TEXT[locale]);
      expect(panel.has('panel.queue.delete.cancel.remote_delete_attempted')).toBe(true);
      expect(panel.get(KEY)).not.toBe(panel.get('panel.queue.delete.cancel.remote_delete_attempted'));
    });
  }

  it('names the connection page with the exact label of panel.navigation.connection (en: "Twitch connection", es: "Conexión de Twitch", pt-BR: "Conexão Twitch")', async () => {
    for (const [locale, page] of [['en', 'Twitch connection'], ['es', 'Conexión de Twitch'], ['pt-BR', 'Conexão Twitch']]) {
      const panel = await catalog(locale);
      expect(panel.get('panel.navigation.connection'), locale).toBe(page);
      expect(panel.get(KEY), locale).toContain(page.replace('Twitch connection', 'Twitch connection'));
    }
  });

  it('does not promise that cancelling will work after reauthorization (OPS-22 AC 16 limit)', async () => {
    for (const locale of Object.keys(TEXT)) {
      const text = (await catalog(locale)).get(KEY);
      expect(text, locale).not.toMatch(/will (now )?work|funcionará|vai funcionar|automatic/i);
    }
  });
});
