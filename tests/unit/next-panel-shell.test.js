import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import QueueSummaryCards from '../../apps/frontend/features/overview/queue-summary-cards.jsx';

const catalog = {
  'panel.brand.home': 'Fila Local início',
  'panel.accessibility.skip_to_content': 'Pular para o conteúdo principal',
  'panel.sidebar.title': 'PAINEL DO STREAMER',
  'panel.navigation.label': 'Navegação principal',
  'panel.navigation.overview': 'Visão geral',
  'panel.navigation.queues': 'Filas e atendimentos',
  'panel.navigation.new_queue': 'Nova fila',
  'panel.navigation.operations': 'Sincronização com a Twitch e devolução de pontos',
  'panel.navigation.commands': 'Comandos do chat',
  'panel.navigation.widgets': 'Widgets do OBS',
  'panel.navigation.settings': 'Configurações',
  'panel.navigation.connection': 'Conexão Twitch',
  'panel.sidebar.local_note': 'O painel e os dados ficam neste computador.',
  'panel.runtime.local_data': 'Dados neste computador',
  'panel.locale.label': 'Idioma',
  'panel.overview.eyebrow': 'VISÃO GERAL',
  'panel.overview.description': 'Acompanhe sua operação local.',
  'panel.overview.next_eyebrow': 'PRÓXIMO PASSO',
  'panel.overview.ready': 'Próximo passo',
  'panel.overview.next_unavailable_title': 'Verificando dados locais',
  'panel.overview.next_unavailable_description': 'A próxima ação aparecerá quando o painel local terminar de carregar.',
  'panel.runtime.version': 'Versão local',
  'panel.health.label': 'Saúde da instalação',
  'panel.health.database': 'Banco de dados',
  'panel.health.database.connected': 'Conectado',
  'panel.health.twitch_api': 'API da Twitch',
  'panel.health.twitch.unknown': 'Estado desconhecido',
  'panel.health.database.checking': 'Verificando',
  'panel.summary.label': 'Resumo da operação',
  'panel.summary.queues': 'FILAS',
  'panel.summary.configured': 'configuradas',
  'panel.summary.waiting': 'AGUARDANDO',
  'panel.summary.viewers_waiting': 'viewers na fila',
  'panel.summary.in_service': 'EM ATENDIMENTO',
  'panel.summary.called_or_started': 'chamados ou iniciados',
  'panel.section.local': 'LOCAL',
  'panel.error.local_load': 'A API local não está disponível.',
  'translation.unavailable': 'Texto do produto indisponível.',
};

describe('Next panel shell', () => {
  it('renders the localized local-first shell from the static first-party fallback catalog', () => {
    const markup = renderToStaticMarkup(React.createElement(PanelShell, { fallbackCatalog: { 'pt-BR': catalog } }));
    expect(markup).toContain('aria-label="Navegação principal"');
    expect(markup).toContain('<a class="brand" href="/">');
    expect(markup).not.toContain('aria-label="Fila Local"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Visão geral');
    expect(markup).toContain('Filas e atendimentos');
    expect(markup).toContain('href="/queues/"');
    expect(markup).toContain('href="/operations/"');
    expect(markup).toContain('href="/connection/"');
    expect(markup).toContain('href="/new-queue/"');
    expect(markup).toContain('href="/widgets/"');
    expect(markup).toContain('href="/commands/"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).toContain('Pular para o conteúdo principal');
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).toContain('Verificando dados locais');
    expect(markup).not.toContain('Twitch queue manager');
  });

  it('does not mount protected route content until the local session and snapshot are ready', () => {
    const markup = renderToStaticMarkup(React.createElement(PanelShell, {
      fallbackCatalog: { 'pt-BR': catalog },
      activePage: 'operations',
      children: React.createElement('p', null, 'Protected operations content'),
    }));
    expect(markup).toContain('Verificando…');
    expect(markup).not.toContain('Protected operations content');
  });

  it('renders the loaded queue counts from the operator projection', () => {
    const t = (key) => catalog[key] ?? key;
    const markup = renderToStaticMarkup(React.createElement(QueueSummaryCards, {
      summary: { queues: 3, waiting: 12, inService: 2 }, locale: 'pt-BR', t,
    }));
    expect(markup).toContain('>3</strong>');
    expect(markup).toContain('>12</strong>');
    expect(markup).toContain('>2</strong>');
    expect(markup).toContain('viewers na fila');
  });
});
