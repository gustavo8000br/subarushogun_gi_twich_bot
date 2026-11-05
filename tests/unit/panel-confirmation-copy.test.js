import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// TS-10: catalog-only and Next-source cases moved out of the removed panel-confirmation-contract.test.js (vanilla module cases were not portable).
const catalogs = await Promise.all(['en', 'es', 'pt-BR'].map((locale) =>
  readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')));
const nextLifecycle = await readFile(new URL('../../apps/frontend/features/queues/queue-lifecycle-actions.jsx', import.meta.url), 'utf8');

describe('panel confirmation copy and Next dialog contract', () => {
  it('removes hide/archive copy and labels legacy recovery as show-to-viewers', () => {
    const actionLabels = catalogs.map((catalog) => Object.fromEntries(catalog.split('\n').map((line) => line.split('\t'))));
    expect(actionLabels.map((labels) => labels['panel.queue.action.archive'])).toEqual([undefined, undefined, undefined]);
    expect(actionLabels.map((labels) => labels['panel.queue.confirm.archive'])).toEqual([undefined, undefined, undefined]);
    expect(actionLabels.map((labels) => labels['panel.queue.action.unarchive'])).toEqual(['Show to viewers', 'Mostrar esta cola a los espectadores', 'Mostrar esta fila para viewers']);
    for (const labels of actionLabels) {
      expect(labels['panel.queue.confirm.unarchive']).toMatch(/viewers|espectadores/i);
      expect(labels['panel.queue.unarchive.done']).toMatch(/viewers|espectadores/i);
    }
  });

  it('passes the queue title to the Next panel final local deletion confirmation', () => {
    // FT-23: the title-only confirmations (final local deletion, cancel deletion) are listed explicitly and receive only {title}.
    const titleOnly = nextLifecycle.match(/const TITLE_ONLY_CONFIRMATIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    expect(titleOnly).toContain("'panel.queue.confirm.archive_local_uncertain_final'");
    expect(nextLifecycle).toMatch(/TITLE_ONLY_CONFIRMATIONS\.has\(key\) \? \{ values: \{ title: queue\.title \} \}/);
    expect(nextLifecycle).toMatch(/getQueueConfirmationCopy\(queue, 'archive-local-final'\)/);
  });

  it('has localized copy for both local-deletion confirmations without archive wording', () => {
    for (const catalog of catalogs) {
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_first\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_final\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_review\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_anyway\t\S+/);
      expect(catalog).toMatch(/panel\.queue\.archive_local\.(processing|expired|stale|unavailable)\t\S+/);
      expect(catalog).toMatch(/reward may still exist|todavía puede existir|ainda pode existir/i);
      expect(catalog).toMatch(/panel\.queue\.action\.archive_local_anyway\t(?:Delete from panel anyway|Excluir do painel mesmo assim|Eliminar del panel de todos modos)/);
      expect(catalog).toMatch(/panel\.queue\.confirm\.archive_local_uncertain_final\t(?:Final confirmation: delete queue “\{title\}”|Confirmação final: excluir a fila “\{title\}”|Confirmación final: ¿eliminar la cola “\{title\}”)/);
      expect(catalog).not.toMatch(/panel\.queue\.(?:action\.archive_local_anyway|confirm\.archive_local_uncertain_first|confirm\.archive_local_uncertain_final|archive_local\.(?:done|processing|unavailable))\t[^\n]*(?:archive|arquiv|archiv)/i);
      expect(catalog).toMatch(/historical and unverified|histórico e não verificado|histórico y no verificado/i);
      expect(catalog).toMatch(/not an indication that sync is still running|não significa que uma operação continue em execução|no indica que la sincronización continúe en curso/i);
    }
  });

  it('never uses browser-native confirmation prompts in the Next panel', async () => {
    const files = await readdir(new URL('../../apps/frontend/', import.meta.url), { recursive: true });
    const sources = files.filter((file) => /^(features|components|app)\//.test(file) && /\.(jsx|mjs|js)$/.test(file));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const source = await readFile(new URL(`../../apps/frontend/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    }
  });
});
