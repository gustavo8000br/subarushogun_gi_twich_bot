// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  'panel.form.section_call_message': 'Mensagem de chamada no chat',
  'panel.form.call_message': 'Mensagem enviada no chat da Twitch quando alguém é chamado',
  'panel.form.call_preview_label': 'Prévia (apenas exemplo)',
  'panel.form.call_preview_user': 'Alex',
  'panel.form.call_preview_queue': 'Fila Cozy',
  'panel.form.call_preview_account': 'Streamer',
  'panel.form.call_preview_uid_note': 'O UID só será enviado se você selecionar “Solicitar UID” acima e depois ativar “Mostrar UID na chamada” nas opções da fila.',
  'panel.form.call_message_invalid': 'Use até 350 caracteres em uma única linha e somente os campos aceitos listados acima.',
  'panel.queue_settings.call_message_default': '{user}, sua vez!',
  'panel.queue_settings.call_placeholders': 'Campos aceitos: {user}, {queue}, {position}, {uid}, {account}.',
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

afterEach(cleanup);

describe('Next queue creation form', () => {
  it('renders existing creation fields and Twitch limit guidance', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    for (const name of ['title', 'slug', 'aliases', 'queueMode', 'cost', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream', 'globalCooldownSeconds', 'rewardPrompt', 'uidMode', 'callTimeoutMin', 'callMessage']) {
      expect(markup).toContain(`name="${name}"`);
    }
    expect(markup).toContain('pattern="[a-z0-9-]+"');
    expect(markup).toContain('Limites aplicados pela Twitch.');
    expect(markup).toContain('type="submit"');
    expect(markup.match(/<fieldset/g)).toHaveLength(5);
    expect(markup).toContain('Identificação da fila');
    expect(markup).toContain('Alex, sua vez!');
    expect(markup).toContain('Prévia (apenas exemplo)');
    expect(markup).toContain('Resgate na Twitch');
    expect(markup).toContain('href="/queues/"');
  });

  it('defaults to a local manual queue and points to Twitch setup while disconnected', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: false, onCreate: async () => true }));
    expect(markup).toMatch(/<option value="manual_only" selected="">Local, entradas manuais<\/option>/);
    expect(markup).toContain('name="cost"');
    expect(markup).toContain('hidden="" disabled=""');
    expect(markup).toContain('Conecte a Twitch para configurar recompensas. A fila manual funciona sem conexão.');
    expect(markup).toContain('href="/connection/"');
  });

  it('defaults to Channel Points when Twitch is connected', () => {
    const markup = renderToStaticMarkup(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    expect(markup).toMatch(/<option value="channel_points" selected="">Pontos do Canal<\/option>/);
    expect(markup).toContain('name="cost"');
    expect(markup).not.toContain('href="/connection/"');
  });

  it('keeps reward settings when switching between Channel Points and manual entry', () => {
    render(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    const cost = screen.getByLabelText('Custo em pontos');
    const prompt = screen.getByLabelText('Descrição da recompensa');
    const perStream = screen.getByLabelText('Limite por live');
    const mode = globalThis.document.querySelector('[name="queueMode"]');
    fireEvent.change(cost, { target: { value: '2500' } });
    fireEvent.change(prompt, { target: { value: 'Entre na fila pelo resgate.' } });
    fireEvent.change(perStream, { target: { value: '12' } });

    fireEvent.change(mode, { target: { value: 'manual_only' } });
    expect(globalThis.document.querySelector('.queue-create-reward-fields').hidden).toBe(true);
    expect(globalThis.document.querySelector('.queue-create-reward-fields').disabled).toBe(true);
    expect(new globalThis.FormData(globalThis.document.querySelector('form')).has('cost')).toBe(false);
    fireEvent.change(mode, { target: { value: 'channel_points' } });

    expect(globalThis.document.querySelector('.queue-create-reward-fields').hidden).toBe(false);
    expect(globalThis.document.querySelector('.queue-create-reward-fields').disabled).toBe(false);
    expect(screen.getByLabelText('Custo em pontos').value).toBe('2500');
    expect(screen.getByLabelText('Descrição da recompensa').value).toBe('Entre na fila pelo resgate.');
    expect(screen.getByLabelText('Limite por live').value).toBe('12');
  });

  it('keeps the untouched default message in sync with the selected locale and shows UID prerequisites', () => {
    const englishT = (key) => key === 'panel.queue_settings.call_message_default' ? '{user}, your turn!' : t(key);
    const { rerender } = render(React.createElement(NewQueueForm, { t: englishT, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    const message = globalThis.document.querySelector('[name="callMessage"]');
    expect(message.value).toBe('{user}, your turn!');

    const portugueseT = (key) => key === 'panel.queue_settings.call_message_default' ? '{user}, sua vez!' : t(key);
    rerender(React.createElement(NewQueueForm, { t: portugueseT, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    expect(message.value).toBe('{user}, sua vez!');

    fireEvent.change(message, { target: { value: '{user}, entre na fila {queue} ({uid})' } });
    const preview = screen.getByRole('group', { name: 'Prévia (apenas exemplo)' });
    expect(preview.querySelector('output').textContent).toContain('Alex, entre na fila Fila Cozy ()');
    expect(screen.getByText('O UID só será enviado se você selecionar “Solicitar UID” acima e depois ativar “Mostrar UID na chamada” nas opções da fila.')).toBeTruthy();
    expect(message.getAttribute('aria-describedby')).toContain('new-queue-call-message-uid-note');
    expect(message.getAttribute('aria-describedby')).not.toContain('new-queue-call-message-preview');

    rerender(React.createElement(NewQueueForm, { t: englishT, saving: false, feedback: null, twitchConnected: true, onCreate: async () => true }));
    expect(message.value).toBe('{user}, entre na fila {queue} ({uid})');
  });

  it('explains invalid multi-line templates before calling the create action', () => {
    const onCreate = vi.fn(async () => true);
    render(React.createElement(NewQueueForm, { t, saving: false, feedback: null, twitchConnected: true, onCreate }));
    const message = globalThis.document.querySelector('[name="callMessage"]');
    fireEvent.change(message, { target: { value: 'Linha um\nLinha dois' } });

    expect(screen.getByRole('alert').textContent).toBe('Use até 350 caracteres em uma única linha e somente os campos aceitos listados acima.');
    expect(message.getAttribute('aria-invalid')).toBe('true');
    fireEvent.submit(globalThis.document.querySelector('form'));
    expect(onCreate).not.toHaveBeenCalled();
    expect(message).toBe(globalThis.document.activeElement);
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
