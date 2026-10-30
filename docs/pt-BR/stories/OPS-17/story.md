# OPS-17 — Comandos de chat multilíngues para viewers

[English](../../../stories/OPS-17/story.md)

**Status:** Backlog — exige refinamento; separado da OPS-15 e da OPS-16.
**Tipo:** Comportamento de comandos no chat da Twitch; mudanças de persistência/schema exigem coordenação com `$aiox-data-engineer`.
**Relacionado:** [Issue #73 no GitHub](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73).

## História

Como streamer cujo idioma do painel difere dos idiomas dos viewers,
quero que os viewers possam entender e usar comandos de fila no idioma deles,
para que o idioma do painel não impeça a participação no chat da Twitch.

## Contexto

O painel atualmente localiza a sugestão de comando de presença pelo idioma selecionado pelo streamer (por exemplo, `!<fila> presente`). Os viewers da Twitch podem usar outro idioma. O sistema atual de chaves/apelidos de fila e o handler de chat são as autoridades; esta story não presume detecção automática de idioma nem uma estratégia de implementação.

## Refinamento e critérios de aceite

1. Decidir explicitamente como variantes de idioma dos comandos serão configuradas e resolvidas (por exemplo, palavras fixas suportadas ou apelidos configurados pelo streamer); não inferir automaticamente o idioma do viewer.
2. Preservar a sintaxe e os apelidos atuais de comandos de fila por meio de uma política de compatibilidade documentada.
3. Detectar e rejeitar/relatar colisões entre chaves de filas, apelidos e variantes localizadas, sem execução ambígua.
4. Manter o idioma do painel independente das variantes aceitas no chat.
5. Garantir que mensagens de chamada, ajuda, confirmações, erros e exemplos comuniquem corretamente as variantes aceitas em inglês, espanhol e pt-BR quando aplicável.
6. Adicionar testes nomeados para normalização, resolução de comandos independente do idioma, autorização, colisões, feedback e compatibilidade retroativa.
7. Se forem necessárias mudanças de persistência/schema, obter de `$aiox-data-engineer` o desenho de dados e plano de migration/rollback com PostgreSQL descartável antes da implementação. Testes unitários ou mocks não comprovam comportamento do banco.
8. `$aiox-architect`, `$aiox-ux-design-expert` e `$aiox-qa` revisam o escopo refinado e as evidências de aceite antes da conclusão; os resultados permanecem separados.

## Limites de escopo

- Detecção automática de idioma não está implícita.
- Esta story de backlog não aprova palavra nova de comando, apelido, schema, contrato de API ou migration.
- Não alterar o comportamento de seleção do idioma do painel.

## Lista de arquivos

- A preencher quando a implementação for priorizada.

## Histórico de alterações

| Data | Alteração | Autor |
| --- | --- | --- |
| 2026-10-19 | Criada story separada para variantes de comandos de chat da Twitch independentes do idioma; não inclui implementação nem decisão de persistência. | `$aiox-master` |
