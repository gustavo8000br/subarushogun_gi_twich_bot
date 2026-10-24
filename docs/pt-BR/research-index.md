# Índice de pesquisas

[English](../research-index.md)

- Responsável: `@analyst` (Atlas). Criado em: 2026-10-22. Montado a partir das notas que já existem no repositório; nenhuma pesquisa web nova foi feita para este índice.
- Rótulos usados nas notas: **VERIFIED** (fonte oficial ou código do repositório), **PARTIAL** (fonte incompleta ou secundária), **UNVERIFIED** (inferência, não confirmada).

## Regra de ouro do proprietário (2026-10-22)

Se o `@analyst` já pesquisou um tema e concluiu que não é preciso pesquisar mais, ninguém gasta tokens pesquisando de novo. Este índice torna a regra utilizável.

## Como usar

1. Antes de pedir pesquisa, o agente ou o coordenador consulta este índice.
2. Só se pede pesquisa para um **GAP** ou para um **REFRESH IF** cujo gatilho disparou. O pedido cita a linha e o gatilho.
3. Quando a linha é **SUFFICIENT**, quem consome lê a nota (e a cópia pt-BR) e a cita. Não pede pesquisa nova.
4. Agentes sem ferramentas web (`@po`, `@data-engineer`, `@dev`, `@qa`, `@ux-design-expert`) leem as notas em vez de pedir pesquisa nova. Se uma nota não responde à dúvida, levam a pergunta exata ao coordenador. O coordenador decide se é um GAP real.
5. O `@analyst` atualiza este índice (en e pt-BR) sempre que uma nota de pesquisa é criada, atualizada ou aposentada.
6. Uma nota é pesquisa documental. Ela nunca substitui teste no ambiente do projeto (PostgreSQL, navegador, Twitch real, OBS/CEF). Um GAP que só um teste ao vivo fecha vai para `@qa`/`@dev` como tarefa de teste, não como pesquisa web.

## Vereditos

- **SUFFICIENT**: não é preciso pesquisar mais.
- **REFRESH IF**: vale até um gatilho explícito disparar.
- **GAP**: itens UNVERIFIED ainda bloqueiam uma decisão.

## Registro

| # | Tema | Arquivo (en / pt-BR) | Data / autoria | Resumo das evidências | Responde | Veredito |
|---|---|---|---|---|---|---|
| 1 | Stack de base do FND-0 (Node, Docker, dependências) | `docs/stories/FND-0/spec/research.json` (só en, JSON) | 2026-10-02 / @aiox-master | Dependências marcadas `verified`, com fontes oficiais | Versões de runtime/imagem base e dependências centrais | **REFRESH IF** mudar o Node 24.20.0 ou a imagem base Docker |
| 2 | Brief de UX do painel do operador (FND-6) | `docs/stories/FND-6/ux-research.md` / `docs/pt-BR/stories/FND-6/ux-research.md` | 2026-10-03 / pesquisa documental de UX | Docs oficiais; a proto-persona é hipótese | Contexto do operador, brief de interação do painel | **SUFFICIENT** (as hipóteses são validadas nas revisões de UX, não com mais pesquisa) |
| 3 | Browser Source do OBS / overlay (FND-7) | `docs/stories/FND-7/spec/research.json` | 2026-10-06 / @analyst | Fontes oficiais conferidas em 2026-10-06 | Restrições do Browser Source (CEF) para o overlay | **REFRESH IF** mudar a versão-alvo do OBS/CEF |
| 4 | Localização (Intl ECMA-402) (FND-8) | `docs/stories/FND-8/spec/research.json` | 2026-10-06 / @aiox-master com @pm e @architect | Referências da especificação oficial | Formatação Intl, tratamento de locale | **SUFFICIENT** |
| 5 | Channel Points / recompensas personalizadas (FND-9) | `docs/stories/FND-9/spec/research.json` | 2026-10-07 / spec pipeline | Central de Ajuda e referência da API da Twitch | Comportamento das recompensas e requisitos FR-1/FR-5 | **REFRESH IF** a Twitch mudar a API de Custom Rewards |
| 6 | EventSub `channel.chat.message` (OPS-3) | `docs/stories/OPS-3/spec/research.json` | 2026-10-06 / @analyst | Docs oficiais, `verified: true` | Ingestão do chat via EventSub v1 | **REFRESH IF** mudar a versão da assinatura ou a major do Twurple |
| 7 | Matriz de CI / empacotamento (OPS-5) | `docs/stories/OPS-5/spec/research.json` | 2026-10-07 / @aiox-master | Rascunho de planejamento, docs oficiais do GitHub Actions | Jobs com matriz de SO, artefatos | **REFRESH IF** a OPS-5 sair de rascunho e o alvo de empacotamento for escolhido |
| 8 | Heurísticas de clareza do painel (OPS-6) | `docs/stories/OPS-6/ux-research.md` / `docs/pt-BR/stories/OPS-6/ux-research.md` | 2026-10-07 / revisão heurística de UX | Revisão heurística do painel local; não é estudo de usabilidade | Clareza do painel e orientação operacional | **SUFFICIENT** |
| 9 | Envio/recebimento de chat com Twurple (OPS-7) | `docs/stories/OPS-7/spec/research.json` | 2026-10-07 / @analyst | Twurple fixado em 8.2.0, docs oficiais de chat da Twitch | Envio de mensagens, limites | **REFRESH IF** o `@twurple/*` sair da 8.2.0 |
| 10 | Validação/renovação de token OAuth (OPS-8) | `docs/stories/OPS-8/spec/research.json` | 2026-10-07 / @analyst com @architect | Docs oficiais de OAuth da Twitch, `verified: true` | Fluxo de validação/renovação, validação a cada hora | **REFRESH IF** mudarem os docs de auth da Twitch ou a major do auth do Twurple |
| 11 | Relocação de módulos S-03 e limpeza S-12 (OPS-15) | `docs/stories/OPS-15/refactor-research.md` / `docs/pt-BR/stories/OPS-15/refactor-research.md` | 2026-10-21 / @analyst | Quase tudo VERIFIED (repo + docs do Next.js); 3 inferências UNVERIFIED a provar com testes | Raiz do Turbopack, sem shims de re-export, ordem de COPY no Docker, globals do ESLint | **SUFFICIENT** (já aplicada em `f440c16`); **REFRESH IF** mudar a major do Next.js |
| 12 | Diálogo do link de widget exibido uma vez (OPS-15) | `docs/stories/OPS-15/dialog-research.md` / `docs/pt-BR/stories/OPS-15/dialog-research.md` | 2026-10-22 / @analyst | Mistura de VERIFIED/PARTIAL; 5 itens de navegador UNVERIFIED (`preventDefault` no Escape, `autoFocus` no React 19, permissão de clipboard) | `<dialog>` nativo, close watcher, Clipboard API, mascaramento, casos E2E | **SUFFICIENT** para o design; os itens UNVERIFIED são fechados pelo E2E em navegador (`tests/e2e/widget-link-dialog-browser-only.mjs`), não por pesquisa |
| 13 | Contrato da API S-04/S-05/S-06/S-14 (OPS-15) | `docs/stories/OPS-15/api-contract-research.md` / `docs/pt-BR/stories/OPS-15/api-contract-research.md` | 2026-10-22 / @analyst | Draft IETF de idempotência e fontes do Fastify VERIFIED; práticas de fornecedores PARTIAL; 6 UNVERIFIED (comportamento do repo) | Status de idempotência (400/409/422), retry em 5xx, sessão, comparação de pathname | **SUFFICIENT**; **REFRESH IF** o draft IETF Idempotency-Key virar RFC |
| 14 | Decisão do contrato da API (seção de pesquisa) (OPS-15) | `docs/stories/OPS-15/api-contract-decision.md` / `docs/pt-BR/stories/OPS-15/api-contract-decision.md` | 2026-10-22 / @architect | Decisão baseada no #13; 4 itens UNVERIFIED pedem testes no projeto (N7: lacuna no commit, N8: timeouts) | Decisões da série D para S-04/S-05/S-06/S-14 | **SUFFICIENT** (o que falta são testes de PostgreSQL/API, não pesquisa) |
| 15 | Elegibilidade de reembolso por status de inscrito (OPS-20) | `docs/stories/OPS-20/research.md` / `docs/pt-BR/stories/OPS-20/research.md` | 2026-10-21 / @analyst | Get Broadcaster Subscriptions VERIFIED; Prime PARTIAL; 2 UNVERIFIED | Escopo `channel:read:subscriptions`, novo consentimento, consulta, atualização do status do resgate | **GAP** (ver abaixo) |
| 16 | UX de elegibilidade, override e novo consentimento (OPS-20) | `docs/stories/OPS-20/ux-research.md` / `docs/pt-BR/stories/OPS-20/ux-research.md` | 2026-10-21 / @analyst | 7 UNVERIFIED (quase todos ferramentas concorrentes sem docs) | Padrões do painel da Twitch e de bots de terceiros, restrições de texto | **SUFFICIENT** (as lacunas sobre concorrentes não bloqueiam; o texto não pode prometer comportamento de expiração) |
| 17 | Estratégia de testes (OPS-20) | `docs/stories/OPS-20/test-research.md` / `docs/pt-BR/stories/OPS-20/test-research.md` | 2026-10-21 / @analyst | Código do rate limiter do Twurple 8.2.0 VERIFIED; fast-check VERIFIED; 5 UNVERIFIED | Tratamento de 429, fakes vs. mock do Twitch CLI, testes de propriedade, PostgreSQL descartável | **SUFFICIENT**; **REFRESH IF** o `@twurple/api` sair da 8.2.0 |
| 18 | PostgreSQL descartável em Docker nos testes de integração do Vitest (pull da imagem, limpeza, contenção) | `docs/stories/OPS-15/docker-test-cleanup-research.md` / `docs/pt-BR/stories/OPS-15/docker-test-cleanup-research.md` | 2026-10-23 / @analyst | Docs do Docker CLI/Engine API, código do docker/cli e do moby, código do Vitest 5.0.3 instalado VERIFIED; padrão de retry PARTIAL; causa raiz da falha de limpeza paralela de 2026-10-22 UNVERIFIED (stderr não registrado) | Pré-pull + `--pull never`, órfãos `Created` e `--rm`, `rm -f` idempotente, `afterAll` incondicional, polling da remoção, Testcontainers (agora não) | **SUFFICIENT**; a causa raiz UNVERIFIED é fechada pela mensagem de erro melhorada do helper e por um `npm test` completo e paralelo do @qa, não por pesquisa. **REFRESH IF** for proposto o Testcontainers ou o Vitest sair da 5.x |

## GAPs em aberto (bloqueiam decisão)

Os três vêm da OPS-20 (#15). É pouco provável que mais pesquisa web os feche: as notas registram que não se achou declaração oficial nem da comunidade. Eles exigem um **teste ao vivo na Twitch** num canal afiliado de teste (já registrado como bloqueio documentado em `test-research.md`), ou uma regra explícita do proprietário que dispense depender deles.

1. **Resgates UNFULFILLED pendentes:** se a Twitch faz eles expirarem ou limita a quantidade na fila de pedidos. Isso decide se um resgate não elegível pode ficar UNFULFILLED.
2. **Inscritos Prime:** como o Get Broadcaster Subscriptions representa inscrições Prime (os docs oficiais confirmam só em parte). Isso decide se Prime conta como elegível.
3. **Broadcaster na própria lista de inscritos:** é desconhecido. A recomendação atual é tratar o broadcaster com uma regra explícita.
