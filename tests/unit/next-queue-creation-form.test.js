import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NewQueueForm from '../../apps/frontend/features/queues/new-queue-form.jsx';

const t = (key) => ({
  'panel.form.queue_name': 'Nome da fila',
  'panel.form.section_identity': 'Identificação da fila',
  'panel.form.section_entry': 'Como entra',
  'panel.form.section_reward': 'Recompensa',
  'panel.form.section_handling': 'Atendimento',
  'panel.form.command': 'Comando',
  'panel.form.aliases': 'Apelidos',
  'panel.form.queue_mode': 'Tipo de fila',
  'panel.form.mode_channel_points': 'Pontos do Canal',
  'panel.form.mode_manual': 'Local, entradas manuais',
  'panel.form.cost': 'Custo em pontos',
  'panel.form.max_per_stream': 'Limite por live',
  'panel.form.max_per_viewer': 'Limite por pessoa',
  'panel.form.cooldown': 'Intervalo global',
  'panel.form.no_limit': 'Sem limite',
  'panel.form.no_cooldown': 'Sem intervalo',
  'panel.form.twitch_limits_hint': 'Limites aplicados pela Twitch.',
  'panel.form.reward_description': 'Descrição da recompensa',
  'panel.form.reward_prompt_placeholder': 'Resgate para entrar.',
  'panel.form.uid_mode': 'Modo do UID',
  'panel.form.uid_hidden': 'Oculto',
  'panel.form.uid_visible': 'Solicitar UID',
  'panel.form.call_timeout': 'Prazo de chamada',
  'panel.form.create_queue': 'Criar fila',
  'panel.form.queue_name_placeholder': 'Ex.: Arena',
  'panel.form.command_placeholder': 'arena',
  'panel.form.aliases_placeholder': 'pvp, batalha',
  'panel.form.command_hint': 'Sugestão de comando',
  'panel.form.aliases_hint': 'Nomes alternativos',
  'panel.form.mode_channel_points_hint': 'Resgate na Twitch',
  'panel.form.mode_manual_hint': 'Entrada local',
  'panel.form.twitch_setup_required': 'Conecte a Twitch para configurar recompensas. A fila manual funciona sem conexão.',
  'panel.form.cancel': 'Cancelar',
}[key] ?? key);

describe('Next queue creation form', () => {
  it('renders existing creation fields and Twitch limit guidance', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    for (const name of ['title', 'slug', 'aliases', 'queueMode', 'cost', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds', 'rewardPrompt', 'uidMode', 'callTimeoutMin']) {
      expect(markup).toContain(`name="${name}"`);
    }
    expect(markup).toContain('pattern="[a-z0-9-]+"');
    expect(markup).toContain('Limites aplicados pela Twitch.');
    expect(markup).toContain('type="submit"');
    expect(markup.match(/<fieldset/g)).toHaveLength(4);
    expect(markup).toContain('Identificação da fila');
    expect(markup).toContain('Resgate na Twitch');
    expect(markup).toContain('href="/queues/"');
  });

  it('defaults to a local manual queue and points to Twitch setup while disconnected', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: false, onCreate: async () => true }));
    expect(markup).toMatch(/<option value="manual_only" selected="">Local, entradas manuais<\/option>/);
    expect(markup).not.toContain('name="cost"');
    expect(markup).toContain('Conecte a Twitch para configurar recompensas. A fila manual funciona sem conexão.');
    expect(markup).toContain('href="/connection/"');
  });

  it('defaults to Channel Points when Twitch is connected', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    expect(markup).toMatch(/<option value="channel_points" selected="">Pontos do Canal<\/option>/);
    expect(markup).toContain('name="cost"');
    expect(markup).not.toContain('href="/connection/"');
  });

  it('shows pending synchronization feedback and links to queue status', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, {
      t, saving: false, feedback: { status: 'pending', key: 'panel.queue.creation_result.pending' }, onCreate: async () => true,
    }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('href="/queues/"');
  });

  it('blocks resubmission while an earlier create result is uncertain', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, {
      t, saving: false, feedback: { status: 'uncertain', key: 'panel.queue.creation_result.uncertain' }, onCreate: async () => true,
    }));
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(markup).toContain('href="/queues/"');
  });

  it('renders the safe diagnostic reference for an uncertain server result', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, {
      t: (key, { values = {} } = {}) => key === 'panel.error.reference' ? `Referência: ${values.id}` : t(key),
      saving: false,
      feedback: { status: 'uncertain', key: 'panel.queue.creation_result.uncertain', referenceId: 'safe-ref-1' },
      onCreate: async () => false,
    }));
    expect(markup).toContain('Referência: safe-ref-1');
  });
});
