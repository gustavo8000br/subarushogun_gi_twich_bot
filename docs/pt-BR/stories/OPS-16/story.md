# OPS-16 — Explicar variáveis da mensagem personalizada de chamada da fila

[English](../../../stories/OPS-16/story.md)

**Status:** Backlog — aguardando refinamento e priorização de implementação; não iniciada. Esta é uma continuação independente e não substitui nem reordena a migração ativa OPS-15.
**Tipo:** Orientação e localização no painel; sem mudança esperada de API ou banco.
**Relacionada:** Paridade de criação/configurações de fila da OPS-15; [issue GitHub #72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72).

## História

Como streamer que personaliza a mensagem enviada quando um viewer é chamado,
quero que o painel explique cada variável de modelo aceita e seu significado,
para poder personalizar a mensagem com segurança sem adivinhar o que o bot enviará.

## Contexto

O editor da mensagem de chamada informa os campos aceitos, mas não explica cada um. O runtime atual aceita `{user}`, `{queue}`, `{position}`, `{uid}` e `{account}`. Os significados e as condições de privacidade devem ser confirmados com o formatador atual antes da implementação; a API continua sendo a autoridade sobre os tokens aceitos. Esta story limita-se à orientação para o operador nos formulários de criação e configuração de fila.

## Critérios de aceite

1. O campo da mensagem de chamada em nova fila e as configurações de mensagem em filas existentes apresentam uma explicação localizada e acessível de todos os tokens aceitos: `{user}`, `{queue}`, `{position}`, `{uid}` e `{account}`.
2. Cada explicação descreve o valor realmente produzido pelo formatador de chat existente. `{uid}` informa explicitamente que fica vazio a menos que os requisitos de visibilidade de UID da fila permitam seu envio; a interface não pode sugerir que ele contorna as regras de privacidade.
3. A orientação inclui a sintaxe existente do comando de presença do viewer (`!<fila> presente`, localizada conforme a sintaxe atual dos comandos do produto), sem inventar comando ou token.
4. A prévia dinâmica, validação do campo, conjunto de tokens aceitos, limite de tamanho e payloads de salvar/criar permanecem inalterados. Esta story não adiciona rota de API, schema, migration, autorização ou comportamento de chat.
5. Entradas de catálogo em inglês, espanhol e pt-BR são semanticamente equivalentes e passam na validação de localização. Não usar HTML bruto; associar a orientação ao textarea correspondente para tecnologia assistiva.
6. Testes nomeados dos componentes cobrem ambos os formulários, os cinco tokens e suas descrições, a condição de privacidade do UID e a associação acessível. Testes existentes de rota/formatador continuam comprovando significados e conjunto aceito.
7. `$aiox-ux-design-expert` revisa posicionamento/legibilidade e `$aiox-qa` mapeia os critérios da story aos testes de forma independente antes de considerá-la Ready for Review. Isso não implica QA/aceite geral da OPS-15.

## Limites de escopo

- Não adicionar nem renomear placeholders. Se a implementação encontrar significado inconsistente entre formatador atual, validação de rota ou catálogos, interromper e criar decisão/story separada para mudança de comportamento, em vez de alterar silenciosamente o texto do chat.
- Não alterar a mensagem padrão; isso está sendo tratado pela correção ativa da interface registrada na worktree atual.
- Não alegar validação OBS/CEF, Twitch ou comportamento persistido de banco; esta story altera somente orientação do frontend.

## Notas de implementação

- Antes de editar, inspecionar `apps/api/src/outbox/chat-worker.mjs`, `apps/api/src/commands/chat-handler.mjs`, `apps/frontend/features/queues/new-queue-form.jsx` e `apps/frontend/features/queues/queue-settings-form.jsx`.
- Manter o catálogo runtime do painel e a lista explícita de placeholders como autoridade; sincronizar a validação de descoberta dos catálogos first-party conforme necessário.
- Verificação sugerida: testes focados de formulário/catálogo, `npm run validate:localization`, `npm run lint` e `npm run typecheck`; executar os gates do projeto exigidos no AGENTS.md antes de concluir.

## Lista de arquivos

- A ser preenchida pelo `$aiox-dev` implementador quando esta story for priorizada.

## Histórico de alterações

| Data | Alteração | Autor |
|---|---|---|
| 2026-10-19 | Criada story independente de backlog para explicar os placeholders aceitos na mensagem de chamada da fila; este artefato não inclui implementação. | `$aiox-sm` |
