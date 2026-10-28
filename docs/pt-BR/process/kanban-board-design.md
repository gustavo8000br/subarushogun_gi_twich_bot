# Desenho do quadro Kanban (GitHub Project #5)

[English](../../process/kanban-board-design.md)

**Data:** 2026-10-24. **Autor:** `@sm` (River). **Branch:** `feat/ops-15-next-panel`. **Escopo:** desenho apenas. Nada foi criado nem editado no GitHub; nenhuma story, issue ou o inventário foi alterado. O `@devops` aplica o desenho no GitHub; o `@sm` organiza; o `@devops` mantém atualizado.

**Atualização 2026-10-27 (`@sm`):** o desenho agora reflete os 12 itens acrescentados ao [inventário](backlog-inventory.md) (ST-15, ST-16, FT-21..FT-29, OW-16): novas opções de Fase OPS-22 e OPS-23, 12 issues novas a criar agora, 33 vínculos nativos quando tudo existir, 87 cards. Nada foi criado nem editado no GitHub.

**Atualização 2026-10-27, segunda (`@sm`):** mais 7 itens do [inventário](backlog-inventory.md) (ST-17 = OPS-24 e suas fatias FT-30..FT-35: backend para TypeScript e ESLint para Biome): nova opção de Fase "OPS-24 TypeScript e Biome", mais 1 issue a criar agora (13 no total), mais 6 vínculos nativos (39 quando tudo existir), Ordem estendida até o passo 16, 94 cards. Nada foi criado nem editado no GitHub.

**Atualização 2026-10-27, terceira (`@sm`):** após o GO do `@po` na OPS-22/23/24 e as issues criadas pelo `@devops`: os cards ST-15, ST-16, ST-17 passam a mostrar #80, #81, #91 e Situação Pronto; a FT-24 mostra #82 e Pronto; FT-21 e FT-22 mostram #89 e #90 (as issues existem; o rótulo "issue nova (agora)" não vale mais). Contagem de cards: 95 (um rascunho acrescentado depois, FT-36 "cancelar exclusão pendente", decisão do proprietário 2026-10-27; 26 issues + 67 rascunhos + 2 legados); fora isso mudaram apenas Situação, Etapa e o texto do próximo passo. FT-21 e FT-22 rodam em sequência após a FT-24. O `@devops` sincroniza os campos do Project a partir destas linhas. Nada foi criado nem editado no GitHub por esta mudança.

**Atualização 2026-10-27, quarta (`@sm`):** 7 cards rascunho acrescentados para as ondas do cutover incremental da OPS-15 (FT-37..FT-43; plano em [cutover-plan](../stories/OPS-15/cutover-plan.md)), todos na Fase "OPS-15 Migração Next": FT-37 (onda 0) Em revisão, FT-38 (onda 1) Pronto, FT-39..FT-43 Bloqueado. A Ordem usa subpassos decimais para que a sequência 0, 1, 3, 2, 5, ports da TS-10, 4, 6 fique exata (FT-37 = 4.1, FT-38 = 4.2, FT-39 = 4.3, FT-40 = 5, FT-41 = 5.1, FT-42 = 8.1, FT-43 = 8.2). Cards existentes são ligados, não duplicados (FT-05 e TS-04 rodam na FT-40; TS-01 e o script da FT-04 na FT-37; os aliases da FT-04 na FT-39; TS-12 na FT-42; a TS-10 bloqueia a FT-42). A OW-09 virou Concluído (decidida em 2026-10-27). Cards: 102 (26 issues + 74 rascunhos + 2 legados). Nada foi criado nem editado no GitHub por esta mudança.

**Entradas:** [inventário](backlog-inventory.md) (IDs ST/FT/GV/TS/OW), [pesquisa do @analyst](kanban-research.md), `.claude/rules/story-lifecycle.md`, e `gh issue list` somente leitura em 2026-10-24.

**Decisões do proprietário (2026-10-24):** o quadro é o Project **#5** "SubaruShogun GI Twitch Bot — Planejamento" (owner `gustavo8000br`), reaproveitado e já vinculado ao repositório. Hoje tem só o campo `Status` padrão (Todo/In Progress/Done) e 4 itens (#17 Done, #18 Done, #19 In Progress, #48 Todo). O modelo de campos segue a estrutura indicada pelo proprietário: seleção única **Situação**, **Área**, **Fase**, **Responsável** e **Prioridade**; as opções de Área, Fase e Responsável abaixo foram definidas para este projeto. O repositório é a fonte da verdade; o quadro é um espelho.

Os valores do quadro ficam em português do Brasil porque o quadro é do proprietário.

## 1. Campos do Project #5

### 1.1 Status padrão × Situação (recomendação)

**Usar um único campo de situação:** renomear o campo padrão `Status` para **Situação** e trocar suas opções pelas do ciclo AIOX. Motivo: os workflows nativos (definir ao adicionar, item fechado, PR integrada) operam sobre o campo `Status` padrão; um segundo campo "Situação" deixaria o quadro e os workflows em campos diferentes e geraria duas verdades. Renomear e editar opções é feito uma vez na interface web (a pesquisa não confirmou isso pela CLI antiga; o `gh` atual é 2.103.2, mas a edição de opções pela CLI continua não verificada). Depois de renomear, o `@devops` confere que os workflows nativos continuam apontando para o campo.

| Opção de Situação | Status da story (`story-lifecycle.md`) | Quando usar |
|---|---|---|
| Backlog | Backlog / Planned / sem story | Sem story ou story ainda não em Draft |
| Rascunho | Draft | Story em rascunho ou refinamento, antes da validação do `@po` |
| Aguardando decisão | (qualquer) | O próximo passo é uma decisão do proprietário |
| Pronto | Ready | `@po` GO, issue existente e gates de planejamento concluídos; no caso de fatias e ações, pode começar agora |
| Em andamento | InProgress | Implementação ou gate em curso |
| Em revisão | InReview | Pronta para gate `@qa` ou aceite do proprietário |
| Bloqueado | (qualquer) | O próximo passo é impossível agora por dependência; "Depende de" diz qual |
| Concluído | Done | Depois de PR integrada, com veredito `@qa` registrado (regra GV-04) |

Regras: `Aguardando decisão` e `Bloqueado` sobrepõem o status da story, que continua no próprio arquivo da story. Item cujo próximo passo ainda é executável (ex.: planejar enquanto uma dependência não terminou) fica no status da story, não em `Bloqueado`.

Workflows nativos: ligar "Item adicionado → Situação = Backlog", "Item fechado → Concluído" e "PR integrada → Concluído"; **desligar "Close issues on status change"** (só o `@devops` fecha issues, de forma deliberada); manter auto-add apenas com filtro `is:issue is:open` do repositório (PR não vira card; aparece como PR vinculada). Issue fechada como "não planejada" deve ser movida à mão.

### 1.2 Campos e opções

Teto do GitHub: 50 campos. Este desenho usa 15 personalizados.

| # | Campo | Tipo | Opções / formato | Quem escreve | Justificativa (1 linha) |
|---|---|---|---|---|---|
| 1 | **Situação** (o `Status` renomeado) | Seleção única | Backlog; Rascunho; Aguardando decisão; Pronto; Em andamento; Em revisão; Bloqueado; Concluído | `@devops` | Coluna do quadro e ponte com o ciclo da story |
| 2 | **Fase** | Seleção única | OPS-15 Migração Next; Estabilização; OPS-21 Contrato da API; OPS-22 Recuperação financeira; OPS-23 Tempo real; OPS-24 TypeScript e Biome; OPS-20 Elegibilidade de devolução; Chat e mensagens; Documentação; Instalador; Governança; Qualidade e testes | `@sm` | Agrupa por linha de entrega (derivada do inventário e da ordem do roadmap) |
| 3 | **Prioridade** | Seleção única | P0 (caminho crítico agora); P1 (antes do corte); P2 (acompanhamento aprovado); P3 (condicionado/baixo valor) | `@sm` | Critérios do inventário; pedido do proprietário |
| 4 | **Dificuldade** | Seleção única | P (até meio dia); M (1-3 dias); G (várias fatias/gates); GG (COMPLEXA, score >= 16) | `@sm` | Esforço restante; nome pedido pelo proprietário (equivale ao "Tamanho" da pesquisa) |
| 5 | **Responsável** | Seleção única | @sm; @po; @dev; @qa; @devops; @architect; @data-engineer; @ux-design-expert; @analyst; Proprietário | `@devops` (a partir da story/handoff) | Quem faz o PRÓXIMO passo; o campo nativo Assignees é de pessoa e não serve para agentes |
| 6 | **Área** | Seleção única | Painel Next; API; Banco de dados; Overlay/OBS; Twitch/worker; Infra/CI; Docs/processo | `@sm` | Onde o trabalho acontece no produto; filtra por especialista |
| 7 | **Tipo** | Seleção única | História; Fatia; Governança; Teste; Ação do proprietário | `@sm` | Rascunhos não têm labels; distingue o que é story do que é tarefa |
| 8 | **Gate atual** | Seleção única | Nenhum; Planejamento @po; Planejamento @ux; Planejamento @architect; Planejamento @data-engineer; Plano de testes @qa; Implementação @dev; Gate @qa; Aceite do proprietário; Commit/PR @devops | `@devops` | Responde "em que portão está" sem abrir a story |
| 9 | **Próximo passo** | Texto | Uma frase, imperativa | `@devops` | A linha de raciocínio que o proprietário perde; vem do handoff/story |
| 10 | **Por quê / decisão** | Texto | Uma frase + link para a decisão (story, auditoria, handoff) | `@sm` escreve, `@devops` publica | Guarda o motivo e a decisão sem repetir a story |
| 11 | **Evidência** | Texto | Links para o último veredito `@qa`, nota de pesquisa e PR | `@devops` | Prova do estado atual; separa evidência de afirmação |
| 12 | **Story** | Texto | Caminho `docs/stories/<ID>/story.md` (ou "sem story") | `@sm` | Aponta para a fonte da verdade em vez de copiá-la |
| 13 | **Depende de** | Texto | IDs do inventário e #issues, separados por vírgula | `@sm` | Dependências de rascunhos e itens sem issue; para issues, usar também o vínculo nativo "bloqueada por" |
| 14 | **Ordem** | Número | Passo da ordem recomendada (1-16 mais subpassos decimais 4.1 a 8.2 para as ondas do cutover, inventário seção 2); desempate por Prioridade e ID | `@sm` | Ordena a execução dentro da prioridade |
| 15 | **Atualizado em** | Data | AAAA-MM-DD da última sincronização | `@devops` | Mostra quão velho é o espelho |

**Cortados por redundância com campos nativos:** Parent issue e Sub-issues progress (hierarquia, seção 3), Linked pull requests (automático), Labels (`bug`/`enhancement`/`documentation`/`accessibility` já existem na issue), Milestone (não usado no repositório), Assignees e Repository (nativos), campo "Tamanho" (é a Dificuldade), campo "Iteração" (não há sprints) e um campo próprio de bloqueio (vira a opção Bloqueado + "Depende de").

Para campos de texto: uma linha mais links (limite de tamanho do campo não verificado).

**Atualização 2026-10-27, quinta (`@sm`):** 6 cards acrescentados (ST-18, ST-19, GV-13 = issue #94, TS-13, TS-14, OW-17), ST-04 passou para Rascunho (P2) e a ST-07 (#74) passou para baixo da OPS-22; as decisões resolvidas estão na seção 7.1. Cards: 108 (27 issues + 79 rascunhos + 2 legados). Nada foi criado nem editado no GitHub por esta mudança.

**Atualização 2026-10-28 (`@sm`):** 1 card acrescentado, **TS-15** (teste instável de exclusão de fila no Chromium, achado M-1; Situação Backlog, P2, Ordem 11, Fase Qualidade e testes). Cards: 109 (27 issues + 80 rascunhos + 2 legados); 107 IDs do inventário. Texto da ST-04 alinhado à story OPS-13 (ela continua "Pronta para revisão"; o card está em Rascunho apenas porque a validação está pendente); a ST-06 (#65) registra a decisão pendente do proprietário sobre a story OPS-14 ausente. Nada foi criado nem editado no GitHub por esta mudança.

## 2. O que vira card

**Recomendação: card = issue real sempre que o item for uma story, a issue-mãe de um roadmap ou uma fatia prestes a ser implementada; rascunho (draft item) do Project para todo o resto, até virar issue.**

- **Issues (27 cards do inventário, #94 incluída):** as 13 issues abertas hoje (#19, #40, #48, #57, #60, #65, #69, #72, #73, #74, #76, #77, #78), mais **13 issues novas** que o `@devops` cria agora (atualizado em 2026-10-27; as 6 acrescentadas são OPS-22, OPS-23 e OPS-24 como issues-mãe de story, as fatias de OPS-15 FT-21 e FT-22 e a fatia FT-24 da OPS-22): a issue de OPS-21 (ST-09, hoje `Ready` sem issue, pendência de rastreabilidade) e as fatias de OPS-15 já em curso ou prontas (FT-01, FT-02, FT-05, FT-06, FT-07, FT-08). Regra: a issue existe antes da implementação.
- **Rascunhos (80 cards, atualização 2026-10-28):** 2 stories em rascunho (ST-18, ST-19), 34 fatias que ainda não são issues (FT-03, FT-04, FT-09 a FT-20, FT-23, FT-25 a FT-43; FT-37 e FT-38 são as ondas já em revisão ou prontas: como a regra é issue antes da implementação, o `@devops` as converte em sub-issues da #69 antes do commit), 12 itens de governança (GV; a GV-13 é a issue #94), 15 de testes (TS) e 17 ações do proprietário (OW). Nenhum desses é story nova: governança é remediação de auditoria, testes aguardam a decisão OW-12 e OW-* são ações da pessoa. O rascunho carrega título, corpo com links e os campos; o `@devops` o converte em issue pela interface quando a fatia sai de `Bloqueado`/entra em `Pronto`, ou quando um item de GV/TS ganhar story (regra: "todo roadmap/story novo exige issue", e teste só é removido com story, issue e decisão do proprietário).
- **Legado (2 cards):** #17 e #18, já `Done`, ficam como estão (o mapeamento de `Done` para `Concluído` acontece ao renomear as opções; o `@devops` confere).
- **Total:** 109 cards no quadro (27 issues + 80 rascunhos do inventário + 2 legados).
- Rascunhos não aceitam comentários de issue e não violam a regra de "nunca comentar em issues"; o corpo do rascunho é editado pelo `@devops`. Pull requests não são cards.
- Item de inventário sem issue e sem rascunho: nenhum. Os 107 IDs do inventário entram, cada um com um card.

## 3. Hierarquia de sub-issues

Criar com `gh issue edit <filha> --parent <mãe>` (ou `--add-sub-issue`), `gh` 2.103.2. Hoje nenhuma issue tem pai (verificado pela pesquisa: 0 sub-issues em #69, #76, #19, #57).

```text
#69 OPS-15 Migração do painel/overlay para Next.js        (issue-mãe do roadmap)
 ├── #72 OPS-16 Explicar variáveis da mensagem de chamada
 ├── #77 OPS-18 Conta atual como overlay de identidade
 ├── #78 OPS-19 Confirmar recompensa ao iniciar atendimento
 ├── FT-01 Polimento das páginas        (issue nova agora)
 ├── FT-21 D-1 confirmação, FT-22 D-2 posição (issues novas agora)
 ├── FT-23 D-3/D-4 navegação/mensagens  (issue quando sair de Bloqueado)
 ├── FT-02 CH-2 validar placeholders    (issue nova agora)
 ├── FT-05 Catálogos em local neutro    (issue nova agora)
 ├── FT-06 Rastreabilidade de endpoints (issue nova agora)
 ├── FT-07 Prova de catálogo de comunidade (issue nova agora)
 ├── FT-08 QRA-13 e QRA-02              (issue nova agora)
 ├── FT-37..FT-43 Ondas do cutover 0, 1, 3, 2, 5, 4, 6 (rascunhos; FT-37 e FT-38 primeiro)
 └── FT-03, FT-04, FT-09, FT-10         (issues quando saírem de Bloqueado)

OPS-21 Contrato da API (issue nova agora)               (issue-mãe da story)
 └── FT-11 .. FT-17  fatias 1 a 7       (issue quando a fatia ficar pronta)

OPS-22 Recuperação financeira e exclusão de fila       (issue-mãe da story, nova agora; "bloqueia" nativamente o corte da #69)
 ├── #74 Diagnosticar reconciliação (sub-issue da #80 desde 2026-10-27; saiu da #69)
 └── FT-24 (issue agora), FT-25, FT-26, FT-36  fatias 1 a 4 (issue quando a fatia ficar pronta)

OPS-23 Painel em tempo real (SSE) e estado compartilhado     (issue-mãe da story, nova agora; "bloqueia" nativamente o corte da #69)
 └── FT-27, FT-28, FT-29  fatias 1 a 3 (issue quando a fatia ficar pronta)

OPS-24 Backend para TypeScript e Biome                       (issue-mãe da story, nova agora; não bloqueia o corte)
 └── FT-30 .. FT-35  fatias TS-0 a TS-5 (issue quando a fatia ficar pronta)

#94 ROADMAP Documentação e chat (DOC-2, DOC-3, OPS-14, OPS-17)   (issue-mãe do roadmap, criada em 2026-10-27)
 ├── #40 DOC-2, #73 OPS-17, #65 OPS-14, #48 DOC-3

#76 OPS-20 Elegibilidade de devolução                    (issue-mãe da story)
 └── FT-18, FT-19, FT-20  fatias 1 a 3  (issue quando a fatia ficar pronta)
```

Total de vínculos nativos quando tudo existir: 47 (4 existentes sob #69, 20 fatias de OPS-15 (as 13 anteriores mais as 7 ondas do cutover), 7 de OPS-21, 3 de OPS-20, 4 de OPS-22, 3 de OPS-23 e 6 de OPS-24; atualizado em 2026-10-27; quinta atualização: a #74 passa da #69 para a #80 e a #94 acrescenta 4 vínculos, portanto 51). **Criar agora: 13** (#72, #74, #77, #78 e as 6 fatias novas mais FT-21 e FT-22 sob #69, e FT-24 sob a issue da OPS-22; a issue de OPS-21 nasce sem pai, como issue-mãe da story). As demais entram just-in-time.

Sem pai (independentes, ligadas por dependência nativa "bloqueada por" e pelo campo Depende de): #57 (OPS-13), #19 (FND-9), #60 (OPS-12); #65, #73, #40 e #48 têm a issue-mãe #94 desde 2026-10-27, e a #57 continua aberta (a ST-04 aguarda a ST-18). Dependências nativas sugeridas: #65 bloqueada por #57; #73 por #65; #40 por #19; #48 por #40.

Observação: a relação #69 → #72/#77/#78 hoje é só textual no corpo das issues ([inventário](backlog-inventory.md), seção 3); o vínculo nativo é o que a lei do roadmap exige.

## 4. Views

A view padrão "View 1" é renomeada para a primeira da lista. Os filtros usam a sintaxe de filtros de Projects; conferir na interface por causa dos acentos.

| # | Nome | Layout | Filtro | Agrupamento | Ordenação | Campos visíveis |
|---|---|---|---|---|---|---|
| 1 | Quadro por Situação | Quadro | `-situação:Concluído` (Concluído numa coluna com limite visual ou arquivado após 14 dias) | Colunas = Situação | Ordem ↑ | Prioridade, Responsável, Gate atual, Dificuldade |
| 2 | Plano (prioridade e ordem) | Tabela | `-situação:Concluído` | Prioridade | Ordem ↑, ID | Todos os campos |
| 3 | Hierarquia (issue-mãe) | Tabela | `-tipo:"Ação do proprietário"` | Parent issue | Ordem ↑ | Sub-issues progress, Situação, Gate atual |
| 4 | Proprietário (decisões e ações) | Tabela | `responsável:Proprietário -situação:Concluído` | Situação | Ordem ↑ | Próximo passo, Depende de, Por quê / decisão |
| 5 | Bloqueados | Tabela | `situação:Bloqueado` | Responsável | Ordem ↑ | Depende de, Próximo passo |
| 6 | Por fase | Tabela | `-situação:Concluído` | Fase | Prioridade ↑, Ordem ↑ | Situação, Responsável, Gate atual |
| 7 | Em curso por agente | Quadro | `situação:Pronto,"Em andamento","Em revisão"` | Colunas = Responsável | Prioridade ↑ | Situação, Gate atual, Próximo passo |

O layout **Roadmap** (linha do tempo) não é usado: exige campos de data ou iteração de planejamento e este desenho não inventa datas (ver decisão D6). A view 3 cumpre o papel de "roadmap por issue-mãe".

## 5. Carga inicial

Regras de preenchimento (@devops carrega; nenhum valor é inventado):

- **Tipo:** pelo prefixo do ID: ST = História; FT = Fatia; GV = Governança; TS = Teste; OW = Ação do proprietário.
- **Story**, **Por quê / decisão** e **Evidência:** copiados da linha do mesmo ID no [inventário](backlog-inventory.md) (colunas "Story / issue" e "Line of thought"; evidência = links dos vereditos `@qa` citados na linha), condensados em uma linha com link. Onde não há evidência registrada, deixar vazio.
- **Atualizado em:** 2026-10-24 em todos (2026-10-27 para FT-37..FT-43 e OW-09).
- **Card:** `#N` = issue existente; "issue nova (agora)" = criar antes da carga; "rascunho" = draft item.
- **Prioridade, Dificuldade, Depende de:** do inventário. **Ordem:** passo da ordem recomendada (seção 2 do inventário); itens fora dos passos listados receberam o passo mais próximo por dependência; as ondas do cutover receberam subpassos decimais (FT-37 = 4.1, FT-38 = 4.2, FT-39 = 4.3, FT-40 = 5, FT-41 = 5.1, FT-42 = 8.1, FT-43 = 8.2), então valores iguais e empates se resolvem na ordem de execução pelo ID (OW-03 = 3 por fechar o ST-04; TS-01 a TS-03 = 11; TS-06/08/09 = 14; GV-09, GV-11 = 11; OW-07 = 10; OW-08 a OW-10 = 6; OW-14 = 15; OW-05 e ST-10 = 14).
- **Situação:** pelo mapeamento da seção 1.1. ST-02 e ST-03 ficam `Em andamento` porque as stories estão `InProgress` (código implementado, falta o gate `@qa`).

| ID | Card | Situação | Fase | Prio | Dif | Responsável | Área | Gate atual | Ordem | Depende de | Próximo passo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-01 | #69 | Em andamento | OPS-15 Migração Next | P0 | GG | @dev | Painel Next | Implementação @dev | 8 | FT-01..FT-10, FT-21..FT-23, FT-37..FT-43, ST-15, ST-16, OW-01..OW-11 | Conduzir as fatias; revisões finais @qa/@architect (FT-09) |
| ST-02 | #77 | Em andamento | Estabilização | P1 | P | @qa | Overlay/OBS | Gate @qa | 3 | — | @qa mapeia AC a evidências e emite veredito |
| ST-03 | #78 | Em andamento | Estabilização | P1 | P | @qa | Twitch/worker | Gate @qa | 3 | — | @qa reexecuta a suíte completa e emite veredito |
| ST-04 | #57 | Rascunho | Estabilização | P2 | P | @po | Overlay/OBS | Planejamento @po | 16 | ST-18, OW-03 | Validação pendente, conduzida pela ST-18 (OPS-25) depois da ST-01; não fechar a #57 com evidência Linux. A story OPS-13 continua "Pronta para revisão"; o card está em Rascunho só porque a validação do proprietário está pendente |
| ST-05 | #19 | Em revisão | Estabilização | P1 | P | Proprietário | Twitch/worker | Aceite do proprietário | 10 | OW-01, OW-04 | @po/@qa reconciliam checkboxes dos AC; proprietário agenda aceite |
| ST-06 | #65 | Backlog | Chat e mensagens | P2 | G | @sm | Twitch/worker | Planejamento @po | 15 | ST-04, ST-01 | Decisão pendente do proprietário: localizar ou recriar a story bilíngue OPS-14 (arquivo ausente; nada é inventado); só então validar |
| ST-07 | #74 | Backlog | OPS-22 Recuperação financeira | P1 | M | @devops | Twitch/worker | Nenhum | 6 | ST-15 | Incorporada à OPS-22 (#80), sem story própria; acompanhar pela ST-15 e manter a sub-issue sob a #80 |
| ST-08 | #72 | Backlog | Chat e mensagens | P2 | M | @po | Painel Next | Planejamento @po | 8 | FT-01 | @po valida a story; depois plano @ux >= 9,0 |
| ST-09 | issue nova (agora) | Rascunho | OPS-21 Contrato da API | P1 | GG | @devops | API | Planejamento @ux | 2 | GV-03 | @devops cria a issue-mãe; @ux e @qa concluem seus gates |
| ST-10 | #76 | Rascunho | OPS-20 Elegibilidade de devolução | P2 | GG | @po | Banco de dados | Planejamento @po | 14 | ST-01, ST-09, GV-03, OW-05 | Resolver CONCERNS do plano @qa; relabel via GV-03 |
| ST-11 | #73 | Aguardando decisão | Chat e mensagens | P3 | G | Proprietário | Twitch/worker | Planejamento @po | 15 | ST-06, ST-01 | Proprietário define a política de idioma do viewer; depois refinar |
| ST-12 | #40 | Bloqueado | Documentação | P3 | M | @dev | Docs/processo | Nenhum | 15 | ST-05, FT-10 | Sem ação até a UI ser aceita |
| ST-13 | #48 | Bloqueado | Documentação | P3 | G | @po | Docs/processo | Nenhum | 15 | ST-05, ST-12 | Sem ação ainda |
| ST-14 | #60 | Bloqueado | Instalador | P3 | G | @ux-design-expert | Infra/CI | Nenhum | 15 | `.release-stage` = rc (proprietário) | Nenhuma até a promoção para rc |
| ST-15 | #80 | Pronto | OPS-22 Recuperação financeira | P1 | GG | @dev | Twitch/worker | Implementação @dev | 4 | ST-01 (dependência do corte) | GO do @po 9,5; @architect e @data-engineer concluídos (ciclo de 6 tentativas 1/4/16/60/60 min, sem migration, 4 defeitos de código a absorver, deps `@twurple/common`/`@twurple/api-call` 8.2.0); falta o plano de testes do @qa; começar pela FT-24 |
| ST-16 | #81 | Pronto | OPS-23 Tempo real | P1 | GG | @architect | Painel Next | Planejamento @architect | 6 | ST-01, FT-01 | GO do @po 9,0; desenho do @architect e plano @ux >= 9,0; proprietário decide OD-23-1 (texto da OPS-15) e OD-23-2 (metas: caminho ao vivo 2 s p95, janela de 60 s) |
| ST-17 | #91 | Pronto | OPS-24 TypeScript e Biome | P2 | GG | @architect | API | Planejamento @architect | 16 | ST-15 (OPS-22 primeiro) | GO do @po 9,0; @architect, @data-engineer e @qa concluem seus gates; proprietário decide OD-24-1..3 (a OPS-23 espera só a TS-0 e a TS-2) |
| ST-18 | rascunho | Bloqueado | Estabilização | P2 | M | @po | Overlay/OBS | Planejamento @po | 16 | ST-01, ST-04, redução das tarefas do quadro | Story OPS-25 em Draft: validar o widget da conta no overlay Next (OBS nativo; @qa executa, @ux-design-expert ≥ 9,0); issue pelo @devops quando pronta |
| ST-19 | rascunho | Bloqueado | Chat e mensagens | P2 | M | @po | Twitch/worker | Planejamento @po | 16 | ST-01 (#69 integrada no main), ST-15 | Story OPS-26 em Draft: `ping` com latência real (D-8) e `status` do streamer; só depois do merge da branch no main; issue pelo @devops quando pronta |
| FT-01 | issue nova (agora) | Pronto | OPS-15 Migração Next | P0 | G | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-02, FT-05 | Planos @ux por página (>= 9,0); depois @dev test-first |
| FT-02 | issue nova (agora) | Pronto | OPS-15 Migração Next | P1 | P | @dev | API | Implementação @dev | 4 | — | Red em token desconhecido na criação de fila; depois @qa |
| FT-03 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | G | @qa | Painel Next | Plano de testes @qa | 8 | FT-01 | Escrever E1-E8 após a UI estabilizar (E8 manual do proprietário) |
| FT-04 | rascunho | Bloqueado | OPS-15 Migração Next | P2 | P | @architect | Painel Next | Planejamento @architect | 11 | OW-09 (resolvida), FT-37, FT-39 | Coberta pelas ondas FT-37 (script) e FT-39 (aliases); fechar quando ambas passarem no @qa |
| FT-05 | issue nova (agora) | Pronto | OPS-15 Migração Next | P1 | M | @architect | Painel Next | Planejamento @architect | 5 | — | Definir caminho neutro dos catálogos; @dev move test-first; executada pela FT-40 (onda 2) |
| FT-06 | issue nova (agora) | Em andamento | OPS-15 Migração Next | P1 | G | @qa | API | Gate @qa | 8 | FT-01 | Atualizar inventário de endpoints conforme as fatias entram |
| FT-07 | issue nova (agora) | Em andamento | OPS-15 Migração Next | P1 | M | @qa | Infra/CI | Gate @qa | 5 | FT-05 | Conferir o que a execução de 2026-10-20 cobre e listar a lacuna |
| FT-08 | issue nova (agora) | Pronto | OPS-15 Migração Next | P2 | P | @qa | API | Gate @qa | 11 | — | Ler a matriz QRA e os testes de rota (QRA-13, QRA-02) |
| FT-09 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @qa | Painel Next | Gate @qa | 12 | FT-01..FT-08, TS-10 | Revisões independentes @qa e @architect após as fatias |
| FT-10 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | G | @dev | Painel Next | Aceite do proprietário | 13 | FT-09, ST-15, ST-16, FT-21..FT-23, OW-01..OW-11, TS-10, TS-12 | Remoção decomposta nas ondas FT-37..FT-43 (2026-10-27); fica como proposta de fechamento e aceite; executar com autorização explícita |
| FT-11 | rascunho | Bloqueado | OPS-21 Contrato da API | P1 | M | @devops | API | Plano de testes @qa | 7 | FT-02, ST-09 | Criar sub-issue; @qa plano; depois @dev Red-first |
| FT-12 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | M | @dev | API | Planejamento @ux | 7 | FT-11 | Revisão @ux do copy dos catálogos; depois implementar |
| FT-13 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Painel Next | Planejamento @ux | 9 | FT-12, OW-15 | @ux >= 9,0 e decisão 4 do proprietário |
| FT-14 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 9 | FT-12, OW-15 | @data-engineer coordena; nunca junto de trabalho de UI |
| FT-15 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | M | @dev | Banco de dados | Gate @qa | 14 | FT-14 | Promover rota só com evidência em PostgreSQL isolado |
| FT-16 | rascunho | Bloqueado | OPS-21 Contrato da API | P2 | G | @dev | Painel Next | Planejamento @ux | 14 | FT-13, FT-15 | @ux copy >= 9,0; chaves por intenção |
| FT-17 | rascunho | Bloqueado | OPS-21 Contrato da API | P3 | P | @dev | API | Aceite do proprietário | 13 | FT-10, OW-15 | Junto da remoção do painel vanilla |
| FT-18 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Banco de dados | Planejamento @data-engineer | 14 | ST-01, FT-11, GV-03 | Só após a migração OPS-15 |
| FT-19 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Twitch/worker | Planejamento @data-engineer | 14 | FT-18, OW-05 | Só após FT-18 |
| FT-20 | rascunho | Bloqueado | OPS-20 Elegibilidade de devolução | P2 | G | @dev | Painel Next | Planejamento @ux | 14 | FT-19 | @ux >= 9,0; textos do painel só quando a fatia sair |
| FT-21 | #89 | Pronto | OPS-15 Migração Next | P1 | P | @dev | Twitch/worker | Implementação @dev | 4 | FT-24 (sequência) | Red em parser+handler para `CONFIRMAR`/`Confirmar`/rótulo `en`; depois @qa |
| FT-22 | #90 | Pronto | OPS-15 Migração Next | P1 | P | @data-engineer | Banco de dados | Planejamento @data-engineer | 4 | FT-21 (sequência, mesmo arquivo) | Confirmar `outbox.payload` sem DDL; depois @dev Red-first e @qa em PostgreSQL |
| FT-23 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-28, FT-26 | Plano @ux >= 9,0 (textos, região viva, foco); depois @dev Red-first |
| FT-24 | #82 | Pronto | OPS-22 Recuperação financeira | P0 | P | @dev | Twitch/worker | Implementação @dev | 4 | ST-15 | Red de contrato com instâncias reais do Twurple; depois @dev e @qa; acrescenta `@twurple/common` e `@twurple/api-call` 8.2.0 |
| FT-25 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @data-engineer | Banco de dados | Implementação @dev | 8 | FT-24, ST-15 | Planejamento fechado: ciclo de 6 tentativas (1/4/16/60/60 min), sem migration; absorver `markRedemptionUnknown` e a retentativa manual; Red em PostgreSQL após a FT-24 |
| FT-26 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @architect | Twitch/worker | Implementação @dev | 8 | FT-25, contrato OPS-21 | Planejamento fechado: estado da exclusão derivado; absorver bloqueios que viram `unknown` e a resolução manual que não destrava; Red em PostgreSQL por estado de resgate após a FT-25 |
| FT-27 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | G | @analyst | API | Planejamento @architect | 8 | ST-16, `sse-research.md` | Ler a nota de SSE; @architect fixa modelo de eventos, fronteira de processo e proxy |
| FT-28 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | M | @architect | Painel Next | Planejamento @architect | 8 | ST-16, ordem em relação à FT-01 | Definir a ordem com a FT-01 (mesmo conjunto de escrita); plano @ux >= 9,0 |
| FT-29 | rascunho | Bloqueado | OPS-23 Tempo real | P1 | M | @ux-design-expert | Painel Next | Planejamento @ux | 8 | FT-27, FT-28 | Plano @ux >= 9,0 (indicador, anúncios, foco); depois @dev Red-first |
| FT-30 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Infra/CI | Planejamento @architect | 16 | ST-17, OW-13 (evidência de CI) | @architect fixa a configuração e o texto do `AGENTS.md`; prova Red por gate; canário `credential-fingerprint.mjs` |
| FT-31 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-24 | Após a FT-24: medir erros do strict na pasta; depois Red com instâncias reais do Twurple |
| FT-32 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | Twitch/worker | Planejamento @architect | 16 | FT-30, FT-25, FT-26 | Após FT-25 e FT-26; testes de outbox em PostgreSQL sem alteração |
| FT-33 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @architect | API | Planejamento @architect | 16 | FT-30, FT-27, FT-11, FT-12 | @architect escolhe as 5 rotas com schema e a ordem em relação à FT-27 |
| FT-34 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | G | @data-engineer | Banco de dados | Planejamento @data-engineer | 16 | FT-30, FT-26, FT-14 | Contagem de erros do strict pelo @qa; decidir a divisão do repositório com @data-engineer |
| FT-35 | rascunho | Bloqueado | OPS-24 TypeScript e Biome | P2 | M | @architect | API | Planejamento @architect | 16 | FT-31..FT-34 | Após as fatias de pasta: `strict: true` global e troca da entrada |
| FT-36 | rascunho | Bloqueado | OPS-22 Recuperação financeira | P1 | G | @architect | Twitch/worker | Planejamento @architect | 8 | FT-26 | Cancelar exclusão pendente (decisão do proprietário 2026-10-27): @architect redesenha estados; @data-engineer transições e testes; texto no plano @ux da FT-23; @po revalida o escopo da OPS-22 |
| FT-37 | rascunho | Em revisão | OPS-15 Migração Next | P0 | P | @qa | Painel Next | Gate @qa | 4.1 | — (FT-23, ST-15, ST-16 bloqueiam a conclusão da OPS-15, não a onda) | Onda 0 (código morto) implementada pelo @dev; @qa emite o veredito e libera o grupo; @devops comita. Absorve TS-01 e o script da FT-04 |
| FT-38 | rascunho | Pronto | OPS-15 Migração Next | P0 | M | @dev | Painel Next | Implementação @dev | 4.2 | FT-37 (veredito do @qa) | Onda 1: Red invertendo `next-dev-proxy` e `compose-runtime`; remover os 3 rewrites e `registerWebRoutes`; @qa com classe C (Compose) obrigatória; 3-6 h @dev, 2-3 h @qa |
| FT-39 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | P | @dev | Overlay/OBS | Implementação @dev | 4.3 | FT-38 | Onda 3: @po reescreve CA 3/CA 8; depois @dev remove overlay vanilla e aliases de `/overlay.html` (URL do OBS passa à rota do Next); 1-2 h @dev, 1 h @qa. Absorve os aliases da FT-04 |
| FT-40 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Implementação @dev | 5 | FT-39 (mesmo `server.mjs` da onda 1), FT-05, TS-04 | Onda 2: executa FT-05 e TS-04; `git mv` dos catálogos para `apps/shared/localization/catalogs/` (DP-3 do proprietário); `build:frontend` isolado e imagem; 3-5 h @dev, 1,5-2,5 h @qa |
| FT-41 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @data-engineer | API | Planejamento @data-engineer | 5.1 | FT-40 | Onda 5: @data-engineer confirma linhas vivas `archiveAfterConfirm`; @po aceita a FR-10; depois @dev Red do 404 JSON e remove a rota e `archiveQueue`; 2-4 h @dev, 1,5-2 h @qa |
| FT-42 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | @dev | Painel Next | Implementação @dev | 8.1 | FT-41, TS-10 (6 ports provados não vazios) | Onda 4: remover painel vanilla e `apps/web`, reapontar o job `web`; antes do commit do Biome (FT-30); absorve TS-12; 3-5 h @dev, 3-4 h @qa |
| FT-43 | rascunho | Bloqueado | OPS-15 Migração Next | P2 | P | @dev | Infra/CI | Implementação @dev | 8.2 | FT-38, FT-42 | Onda 6: remover `API_ONLY` e `@fastify/static`; @po fecha CA 9/15; 1-2 h @dev, 1 h @qa |
| GV-01 | rascunho | Pronto | Governança | P0 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Reescrever "nunca comentar"; @dev atualiza o teste; @qa valida |
| GV-02 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Escrever as exceções de `/tmp` em AGENTS.md e CLAUDE.md |
| GV-03 | rascunho | Pronto | Governança | P1 | P | @architect | Docs/processo | Planejamento @architect | 2 | GV-01 | Definir Ready; @po reclassifica OPS-21 e OPS-20 (en e pt-BR) |
| GV-04 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Registrar Done = após PR integrada (override do projeto) |
| GV-05 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | GV-01 | Escrever a isenção bilíngue e reacentuar AGENTS.md |
| GV-06 | rascunho | Pronto | Governança | P2 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Definir `boundary.frameworkProtection: true` e documentar |
| GV-07 | rascunho | Pronto | Governança | P1 | P | @architect | Docs/processo | Planejamento @architect | 1 | — | Registrar a autorização permanente de commit em AGENTS.md |
| GV-08 | rascunho | Pronto | Governança | P1 | P | @qa | Docs/processo | Gate @qa | 1 | — | @qa libera os grupos; @devops commita com pathspec |
| GV-09 | rascunho | Pronto | Governança | P2 | P | @devops | Infra/CI | Commit/PR @devops | 11 | — | Adicionar `validate:port-denylist` ao workflow; reexecutar actionlint |
| GV-10 | rascunho | Bloqueado | Governança | P1 | M | @qa | Docs/processo | Gate @qa | 1 | GV-01..GV-07 | Revisão de conteúdo do commit `89c67b8` após as regras finais |
| GV-11 | rascunho | Pronto | Governança | P2 | P | @devops | Infra/CI | Commit/PR @devops | 11 | — | Confirmar a ausência do hook e instalar ou corrigir o README |
| GV-12 | rascunho | Pronto | Governança | P2 | P | @po | Docs/processo | Planejamento @po | 1 | — | Confirmar origem com o proprietário; corrigir índice de stories |
| GV-13 | #94 | Backlog | Documentação | P2 | P | @sm | Docs/processo | Nenhum | 16 | — | Issue-mãe do roadmap Documentação e chat; @devops vincula as sub-issues #40, #73, #65, #48 (ST-12, ST-11, ST-06/OPS-14, ST-13/DOC-3); OPS-14 sem arquivo de story: lacuna de rastreabilidade |
| TS-01 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Painel Next | Aceite do proprietário | 11 | OW-12 | Decidir remoção; depois issue e @dev; executada pela FT-37 (onda 0) sob a autorização do cutover incremental |
| TS-02 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Docs/processo | Aceite do proprietário | 11 | OW-12 | Decidir reescrita ou remoção dos 3 testes |
| TS-03 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Banco de dados | Aceite do proprietário | 11 | OW-12 | Decidir mover o teste com Prisma mockado para unit |
| TS-04 | rascunho | Bloqueado | Qualidade e testes | P1 | P | @dev | Painel Next | Implementação @dev | 5 | FT-05 | Mesclar teste de fronteira e checar caminhos em string; executada pela FT-40 (onda 2) |
| TS-05 | rascunho | Aguardando decisão | Qualidade e testes | P2 | M | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, TS-11 | Decidir evitar o segundo `next build` |
| TS-06 | rascunho | Aguardando decisão | Qualidade e testes | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, OW-13 | Decidir cortar entradas redundantes do CI |
| TS-07 | rascunho | Aguardando decisão | Qualidade e testes | P2 | G | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12, TS-11 | Decidir um contêiner PostgreSQL por execução |
| TS-08 | rascunho | Bloqueado | Qualidade e testes | P3 | M | @dev | Infra/CI | Implementação @dev | 14 | TS-11 | Avaliar `isolate: false` com prova de ausência de vazamento |
| TS-09 | rascunho | Aguardando decisão | Qualidade e testes | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 14 | OW-12 | Decidir gerar o CA/cert TLS uma vez por arquivo |
| TS-10 | rascunho | Bloqueado | Qualidade e testes | P1 | M | @dev | Painel Next | Implementação @dev | 8 | FT-01 | Portar contratos classe B para testes Next test-first; bloqueia a FT-42 (onda 4) |
| TS-11 | rascunho | Bloqueado | Qualidade e testes | P2 | P | @dev | Infra/CI | Implementação @dev | 11 | OW-13 | Medir tempos e a primeira execução de CI da branch |
| TS-12 | rascunho | Bloqueado | Qualidade e testes | P1 | M | @dev | Painel Next | Implementação @dev | 13 | FT-10 | Remover testes classe C e ajustar asserções acopladas no mesmo change |
| TS-13 | rascunho | Bloqueado | Chat e mensagens | P2 | P | @dev | Twitch/worker | Implementação @dev | 16 | ST-19 | Teste obrigatório do D-8 (LB-23): o ping do chat falha sem o valor em ms havendo medição; casos presente, ausente e Twitch com falha |
| TS-14 | rascunho | Bloqueado | Chat e mensagens | P2 | M | @dev | Twitch/worker | Implementação @dev | 16 | ST-19, TS-13 | Testes do `status`: permissão do streamer, allowlist de campos, limite do chat por idioma, taxa com fake timers |
| TS-15 | rascunho | Backlog | Qualidade e testes | P2 | P | @dev | Infra/CI | Implementação @dev | 11 | — | Teste instável de exclusão de fila no Chromium (`compose-runtime.test.js:1216-1222`, achado M-1): o seletor casa resposta de polling anterior ao reload e perde o corpo (falhou 1 de 4); corrigir test-first; issue pelo @devops antes |
| OW-01 | rascunho | Pronto | OPS-15 Migração Next | P1 | M | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Agendar ciclo do instalador Windows em Docker real |
| OW-02 | rascunho | Pronto | OPS-15 Migração Next | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Agendar `npm run dev` e `dev:start`/`dev:stop` no Windows |
| OW-03 | rascunho | Pronto | Estabilização | P1 | P | Proprietário | Overlay/OBS | Aceite do proprietário | 3 | — | Retestar o OBS nativo (certificado, transparência, recarga) |
| OW-04 | rascunho | Aguardando decisão | Estabilização | P1 | M | Proprietário | Twitch/worker | Aceite do proprietário | 10 | autorização explícita | Autorizar e agendar a operação Twitch real |
| OW-05 | rascunho | Aguardando decisão | OPS-20 Elegibilidade de devolução | P2 | M | Proprietário | Twitch/worker | Aceite do proprietário | 14 | canal afiliado de teste | Fornecer canal de teste ou definir regra própria para as 3 lacunas |
| OW-06 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | M | Proprietário | Painel Next | Aceite do proprietário | 10 | FT-01 | Verificar NVDA/VoiceOver, foco e layout 390x844 |
| OW-07 | rascunho | Aguardando decisão | OPS-15 Migração Next | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 10 | — | Aceitar macOS sem validação ou arrumar um Mac |
| OW-08 | rascunho | Aguardando decisão | OPS-15 Migração Next | P2 | P | Proprietário | Docs/processo | Aceite do proprietário | 6 | — | Confirmar que OWN-19 fica superado |
| OW-09 | rascunho | Concluído | OPS-15 Migração Next | P1 | P | Proprietário | Overlay/OBS | Nenhum | 6 | — | Decidida (2026-10-27): alias não é necessário (sem usuários ativos); sai com o overlay vanilla na FT-39 |
| OW-10 | rascunho | Aguardando decisão | OPS-15 Migração Next | P2 | P | Proprietário | Painel Next | Aceite do proprietário | 6 | — | Decidir se o seletor de idioma vai para Configurações |
| OW-11 | rascunho | Bloqueado | OPS-15 Migração Next | P1 | P | Proprietário | Painel Next | Aceite do proprietário | 13 | FT-09, OW-01..OW-10 | Autorizar corte e remoção do vanilla (explícito, nunca implícito) |
| OW-12 | rascunho | Aguardando decisão | Qualidade e testes | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 6 | GV-08 | Decidir TS-01..TS-09 em pop-ups |
| OW-13 | rascunho | Aguardando decisão | Governança | P2 | P | Proprietário | Infra/CI | Aceite do proprietário | 11 | GV-07 | Autorizar push e PR para a primeira execução de CI |
| OW-14 | rascunho | Aguardando decisão | Governança | P3 | P | Proprietário | Infra/CI | Aceite do proprietário | 15 | — | Dizer quando `backup/ops-15-before-history-fix` pode ser apagada |
| OW-15 | rascunho | Aguardando decisão | OPS-21 Contrato da API | P2 | P | Proprietário | API | Aceite do proprietário | 6 | — | Decidir fechar com a fatia 7 aberta, ordem das fatias 3-4 e timeout |
| OW-16 | rascunho | Aguardando decisão | OPS-22 Recuperação financeira | P1 | M | Proprietário | Twitch/worker | Aceite do proprietário | 10 | ST-15, FT-24, OW-04 | Autorizar e agendar a checagem ao vivo de resgate real (4 checagens do analista) |
| OW-17 | rascunho | Bloqueado | Chat e mensagens | P2 | P | Proprietário | Twitch/worker | Aceite do proprietário | 16 | ST-19, OW-04 | Checagem ao vivo do `ping` e do `status` no canal, depois da OPS-26 implementada |

**Contagem (atualizada em 2026-10-28):** 107 itens do inventário (19 ST, 43 FT, 13 GV, 15 TS, 17 OW) = 27 issues + 80 rascunhos (109 cards com os 2 legados). Por Situação: Backlog 5 (TS-15 acrescentado), Rascunho 3, Aguardando decisão 18, Pronto 25, Em andamento 5, Em revisão 2, Bloqueado 48, Concluído 1 (OW-09). Quinta atualização: ST-18, ST-19, TS-13, TS-14 e OW-17 acrescentados como Bloqueado, GV-13 (#94) acrescentada como Backlog, ST-04 passou de Em revisão para Rascunho (validação pendente, P2), ST-07 (#74) incorporada à OPS-22 (Fase OPS-22, sem story própria). Mudanças desta atualização: FT-37..FT-43 acrescentadas (Em revisão 1, Pronto 1, Bloqueado 5) e OW-09 passou de Aguardando decisão para Concluído. Antes: ST-15, ST-16, ST-17 e FT-24 passaram a Pronto após o GO do @po (terceira atualização). Dependências nativas a acrescentar: as issues da OPS-22 e da OPS-23 bloqueiam o item de corte (FT-10); a FT-23 é bloqueada pela FT-28 e pela FT-26.

## 6. Regras de manutenção

**Princípio:** o repositório manda; o quadro espelha. Em divergência, vale a story/gate no repositório e o `@devops` corrige o quadro. O quadro nunca é fonte de status. Nada é escrito como comentário de issue; o `@devops` edita sempre o corpo principal da issue (ou do rascunho) e os campos do Project.

### 6.1 `@devops` atualiza (eventos)

| Evento | O que o `@devops` atualiza |
|---|---|
| Story muda de status (`@po` Ready, `@dev` InProgress/InReview) | Situação, Gate atual, Responsável, Próximo passo, Atualizado em |
| Veredito `@qa` (PASS/CONCERNS/FAIL/WAIVED) | Evidência (link do gate), Gate atual, Situação, Próximo passo |
| Issue criada | Adicionar ao Project (auto-add), definir Situação inicial, vínculo de pai/sub-issue e "bloqueada por"; preencher os campos do `@sm` a partir do desenho |
| Rascunho converte em issue | Converter pela interface, vincular ao pai, manter os campos |
| PR aberta / integrada | Evidência (link); ao integrar: Situação = Concluído (só após veredito `@qa`) |
| Decisão do proprietário | Mover Situação (de Aguardando decisão para Pronto/Bloqueado/Concluído), registrar a decisão em Por quê / decisão |
| Fim de sessão | Rodar a verificação (`gh project item-list -L 200 --format json`), corrigir desvios, atualizar Atualizado em; publicar o resumo do handoff como status update do Project (não é comentário de issue; ver D7) |

### 6.2 `@sm` reorganiza (eventos)

- Nova story ou issue: definir Fase, Área, Tipo, Prioridade, Dificuldade, Depende de, Ordem e Story.
- Após decisão do proprietário que altere dependências ou prioridades (ex.: OW-09, OW-12, OW-15, OW-11).
- Após veredito `@qa` CONCERNS/FAIL que crie trabalho novo ou mude bloqueios.
- Quando uma dependência fecha: reavaliar `Bloqueado` e a Ordem; entregar ao `@devops` a lista de mudanças.
- No início de cada sessão e a cada 5 itens concluídos: reconciliar o inventário (`docs/process/backlog-inventory.md`, novo snapshot datado) com o quadro. O inventário continua sendo a lista independente de ferramenta.
- Mudança dos critérios de Prioridade/Dificuldade é decisão do `@sm` com `@po` e é registrada no inventário primeiro.

### 6.3 Separação de campos

`@sm`: Fase, Prioridade, Dificuldade, Área, Tipo, Story, Por quê / decisão (texto), Depende de, Ordem. `@devops`: Situação, Responsável, Gate atual, Próximo passo, Evidência, Atualizado em, e toda a hierarquia no GitHub. Ninguém além do `@devops` escreve no GitHub.

### 6.4 Limites

- O `@devops` precisa do escopo `project` no `gh` (hoje a pesquisa registrou que faltava `project`/`read:project`); a autorização é do proprietário, via `gh auth refresh -s project`, e dá escrita em todos os Projects da conta.
- Atualizar um card inteiro exige várias chamadas `gh project item-edit` (uma por campo); o `@devops` deve guardar os IDs de `field-list --format json`. Um script `board:sync` seria código do repositório e exigiria story própria (fora deste desenho).
- Evidências de outras máquinas ou do navegador/OBS real não podem ser inferidas pelo quadro; o campo Evidência só recebe o que existe no repositório.

## 7. Decisões que precisam do proprietário

| # | Decisão | Recomendação do `@sm` |
|---|---|---|
| D1 | Renomear o `Status` padrão para **Situação** com as 8 opções da seção 1.1 (em vez de criar um segundo campo)? | Sim: um só campo, workflows nativos continuam funcionando |
| D2 | Governança, testes e ações do proprietário (40 itens) ficam como **rascunhos** até virarem issue? | Sim: não são stories novas; viram issue só quando ganharem story ou trabalho de código |
| D3 | Criar já **13 issues novas** (OPS-21 + 6 fatias de OPS-15 em curso + OPS-22, OPS-23, OPS-24, FT-21, FT-22, FT-24; atualizado em 2026-10-27) e as demais fatias just-in-time? | Sim: cumpre "issue antes da implementação" sem poluir o repositório com 14 issues paradas |
| D4 | #77 (OPS-18) e #78 (OPS-19) como sub-issues de #69, ou independentes? | Sub-issues de #69: o corpo delas já as trata como parte da migração; #57 fica independente |
| D5 | Autorizar o escopo `project` no `gh` para o `@devops` (`gh auth refresh -s project`) | Sim, é o pré-requisito de qualquer escrita no quadro; ciente de que vale para todos os Projects da conta |
| D6 | Usar datas/iteração e o layout Roadmap? | Não agora: sem datas planejadas, a view 3 por issue-mãe basta; reavaliar se você quiser prazos |
| D7 | Publicar o resumo do handoff como **status update do Project** (não comentário de issue) a cada fim de sessão? | Sim, mas só se você entender que isso não conta como comentar em issue; caso contrário, o resumo fica só em `docs/session-handoff.md` |
| D8 | Concluído após **PR integrada** (GV-04): o workflow "PR integrada → Concluído" fica ligado? | Sim, consistente com GV-04; fatias sem PR própria o `@devops` move à mão |
| D9 | Manter #17 e #18 (legado, Done) no quadro? | Sim, só como histórico; arquivar quando o quadro passar de 100 cards |
| D10 | Aceitar o mapeamento "Bloqueado/Aguardando decisão sobrepõem o status da story"? | Sim; o status oficial continua na story |

### 7.1 Resolvidas pelo proprietário em 2026-10-27 (plano de cutover)

Registradas na seção 5 do [plano de cutover](../stories/OPS-15/cutover-plan.md). Estas não aguardam mais resposta.

| ID | Decisão | Resolução |
|---|---|---|
| DP-0 | OPS-22, OPS-23 e FT-23 bloqueiam a **remoção** do vanilla ou só a **conclusão** da OPS-15? | **RESOLVIDA:** só a conclusão da OPS-15 (registrada no CA 15). O quadro as mostra em `Depende de` da ST-01 e da FT-10, não das ondas do cutover |
| DP-1 | Aceitar a Visão geral atual do Next como página inicial de produção antes do polimento da FT-01 | **RESOLVIDA: aceita.** A diferença do primeiro uso vai no changelog beta (DP-7) |
| DP-2 | Onda 1: apagar `registerWebRoutes` (A) ou `API_ONLY=true` no Compose (B) | **RESOLVIDA: opção A** (FT-38) |
| DP-6 | Apagar `repository.archiveQueue` junto com a rota | **RESOLVIDA: sim** (FT-41); `@data-engineer` e `@po` ainda confirmam antes da onda |
| OW-09 | Manter os aliases de `/overlay.html` | **RESOLVIDA: não é necessário** (sem usuários ativos, sem shims de compatibilidade até `rc`/`stable`); o card está Concluído e os aliases saem na FT-39 depois que o `@po` reescrever o CA 3/CA 8 |

| DP-3 | Caminho dos catálogos | **RESOLVIDA (2026-10-27):** `apps/shared/localization/catalogs/` (onda 2, FT-40) |
| DP-4 | Quem valida foco/layout no celular | **RESOLVIDA:** `@ux-design-expert` + `@qa` (onda 4, FT-42) |
| DP-5 | Job de CI `web` | **RESOLVIDA:** renomeado para `frontend` (onda 4) |
| DP-7 | Frase do changelog beta sobre a diferença de primeiro uso | **RESOLVIDA:** já aplicada |
| OD-23-2 | Metas do SSE | **RESOLVIDA:** p95 <= 2 s ao vivo; polling de reserva 2 s por 60 s; keep-alive 15 s; agregação 100-250 ms (a story OPS-23 é do `@po`) |
| OD-24-1 / OD-24-2 | Biome nos gates / formatação | **RESOLVIDAS:** Biome pelo `lint` (`biome check`); commit de formatação depois da onda 4 |
| OD-22-3 | A OPS-22 pode chegar a Done sem a checagem ao vivo | **RESOLVIDA: sim** (aceite à parte; OW-16 autorizada, execução ao vivo automatizada depois da FT-25/FT-26) |
| OW-13 | Push da branch | **RESOLVIDA:** feito; a CI não roda em push de branch, então PR ou dispatch é decisão à parte |
| Issues de onda | FT-39..FT-43 | **RESOLVIDA:** issue só quando cada onda ficar pronta; a onda 3 (FT-39) está pronta para o `@dev` e validada manualmente pelo proprietário; a onda 1 (FT-38) está em `bfff2f1`; a onda 0 em `0eb4fd2` |
| #74 / #57 | Issue #74 e issue #57 | **RESOLVIDA:** #74 incorporada à OPS-22 (sub-issue da #80); #57 continua aberta, ST-04 aguarda a ST-18 (OPS-25) |
