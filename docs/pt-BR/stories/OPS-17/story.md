# OPS-17 — Comandos de chat multilíngues para viewers

[English](../../../stories/OPS-17/story.md)

**Status:** Rascunho — política de idioma do viewer decidida pelo proprietário em 2026-10-30 (política B, veja "Política decidida"); o restante do refinamento continua necessário antes da validação do `@po`; separado da OPS-15 e da OPS-16.
**Tipo:** Comportamento de comandos no chat da Twitch; mudanças de persistência/schema exigem coordenação com `$aiox-data-engineer`.
**Relacionado:** [Issue #73 no GitHub](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73).

## História

Como streamer cujo idioma do painel difere dos idiomas dos viewers,
quero que os viewers possam entender e usar comandos de fila no idioma deles,
para que o idioma do painel não impeça a participação no chat da Twitch.

## Contexto

O painel atualmente localiza a sugestão de comando de presença pelo idioma selecionado pelo streamer (por exemplo, `!<fila> presente`). Os viewers da Twitch podem usar outro idioma. O sistema atual de chaves/apelidos de fila e o handler de chat são as autoridades; esta story não presume detecção automática de idioma nem uma estratégia de implementação.

## Política decidida (proprietário, 2026-10-30, D-01, opção B)

As palavras de comando por idioma suportado são **palavras fixas, uma lista fechada mantida pelo projeto, sem configuração da pessoa streamer**. O idioma do viewer nunca é inferido automaticamente. Como uma palavra de comando é casada entre idiomas suportados (por exemplo qualquer idioma suportado versus o idioma do painel) NÃO faz parte da decisão do dono e fica para o planejamento da story. Fonte: [decisões de projeto registradas](../../../decisoes_humanas/concluidas/decisoes-de-projeto-registradas.md) (issue #73). Efeito: o card ST-11 sai de "Aguardando decisão" e vai a "Rascunho".

Isto fixa só a política. **Não** aprova palavra, apelido, schema, contrato de API nem migration específicos: a lista fechada em si, as regras de colisão e a política de compatibilidade retroativa continuam sendo itens de refinamento abaixo, a escrever por `@sm`/`@po` com `@architect` e `@ux-design-expert` e validar antes da implementação. Como não há configuração da pessoa streamer, espera-se que o critério 7 (persistência) não seja necessário para as palavras; o `@data-engineer` confirma.

## Refinamento e critérios de aceite

1. ~~Decidir explicitamente como variantes de idioma dos comandos serão configuradas e resolvidas~~ **Decidido (2026-10-30, política B):** palavras fixas por idioma suportado em uma lista fechada mantida pelo projeto, sem configuração da pessoa streamer e sem inferência automática do idioma do viewer. Resta: escrever a lista fechada e onde ela vive (catálogo ou código), com o `@architect`.
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
| 2026-11-04 | Registrada a decisão D-01 = B do proprietário (2026-10-30): palavras fixas por idioma suportado, lista fechada mantida pelo projeto, sem configuração da pessoa streamer. Status Backlog -> Rascunho. Critério de aceite 1 marcado como decidido; nenhuma palavra, apelido, schema nem API é aprovado. | `@sm` |
