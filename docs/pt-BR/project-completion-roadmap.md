# Roteiro do projeto — onde estamos e o que vem

[English](../project-completion-roadmap.md) · [Voltar ao README](../../README.pt-BR.md)

**Atualizado:** 2026-11-05, para a `0.3.0-beta` (`.release-stage` = `beta`). Esta é uma página de navegação: as stories e as issues continuam sendo a fonte dos critérios de aceite e do status, e esta página não fecha stories, não aprova gates nem autoriza release. A lista pública para quem usa o produto está no [roteiro do projeto](ROADMAP.md); o backlog completo está no [inventário do backlog](process/backlog-inventory.md); a versão anterior (densa) desta página está no [arquivo](archive/project-completion-roadmap-2026-10-21.md).

## 1. Onde estamos (v0.3.0-beta)

- **Painel Next.js e overlay do OBS.** O cutover da [OPS-15](stories/OPS-15/story.md) está mergeado na `main` (PR #101). O painel vanilla antigo foi removido; o painel é o `apps/frontend`. O `legacy` é só referência histórica, não é fallback: a recuperação é correção para frente ou reimplantar um digest de imagem anterior ([Versionamento](VERSIONING.md)).
- **Recuperação financeira.** [OPS-22](stories/OPS-22/story.md): o estado financeiro `unknown` pode ser resolvido e a exclusão de fila termina com segurança, com cancelamento verificado. Gate de QA independente de 2026-11-06: 9,2/10, CONCERNS aprovado ([gate](stories/OPS-15/qa-gate-2026-11-06.md)).
- **`ping` real.** O comando de chat `ping` informa a latência real da Twitch (primeira fatia da [OPS-26](stories/OPS-26/story.md)).
- **Teste ao vivo (gate de 2026-11-06):** OBS nativo, criação de fila e de resgate, resgate, atendimento, exclusão e parada, no canal de teste exclusivo do proprietário, sem falha.
- **Ainda sem prova:** execuções nativas no Windows e no macOS, e cancelamento financeiro ao vivo na Twitch em produção. O Linux (Ubuntu) é a única plataforma validada por uma pessoa.

## 2. O que falta para considerar a OPS-15 e as stories Prontas encerradas

| Item | Story | O que falta |
|---|---|---|
| Gates de fechamento do cutover Next | [OPS-15](stories/OPS-15/story.md) | Fechamento da story e do quadro após o merge; os acompanhamentos estão listados abaixo. |
| Aceitação do proprietário das filas locais | [FND-9](stories/FND-9/story.md) (#19) | O proprietário testa o Windows nativo e o ciclo ao vivo na Twitch explicitamente autorizado; registrar resultados sem inferir sucesso remoto a partir de mocks. |
| Widget de conta do OBS após recarregar | [OPS-13](stories/OPS-13/story.md) / [OPS-25](stories/OPS-25/story.md) | Evidência no OBS/CEF nativo com o overlay Next; execute o [roteiro de OBS nativo](stories/OPS-25/obs-native-runbook.md). Automação Chromium não substitui. |
| Instruções de chamada localizadas | OPS-14 (#65) | Ainda sem arquivo de story; a implementação segue o comportamento aceito do widget do OBS. Comportamento de chat separado. |
| Documentação | [DOC-2](stories/DOC-2/story.md), [DOC-3](stories/DOC-3/story.md) | Capturas e GIF com a UI estável; depois a auditoria completa da documentação. |
| UX do instalador | [OPS-12](stories/OPS-12/story.md) (#60) | Adiada até o `.release-stage` ser `rc`. |

## 3. A seguir: 0.4.0-beta

O proprietário escolheu este escopo em 2026-11-05 (fonte: [inventário do backlog, seção 2.1](process/backlog-inventory.md); a [OPS-27](stories/OPS-27/story.md) está **fora**). Nada aqui autoriza um bump: vale a política de versão do `AGENTS.md`.

| Tema | Itens |
|---|---|
| Painel em tempo real (SSE) | [OPS-23](stories/OPS-23/story.md) (#81) |
| Backend em TypeScript, JSX do painel tipado, Biome | [OPS-24](stories/OPS-24/story.md) (#91), TS-16 |
| Comandos de sistema no chat | comando `status` ([OPS-26](stories/OPS-26/story.md), #108), TS-14 |
| Robustez | timeout de leitura nas requisições do painel (FT-44); `retryOutboxManually` para linhas legadas (FT-41-L1); acompanhamentos da OPS-22 TS-19, TS-20 |
| CI | job para os 14 scripts `*-browser-only` ([OPS-30](stories/OPS-30/story.md), #105); instalação limpa ([OPS-29](stories/OPS-29/story.md), #106); regras de varredura estática ([OPS-28](stories/OPS-28/story.md), #107); `queue: max` nos workflows (TS-21) |
| Qualidade do gate de 2026-11-06 | TS-22 a TS-26, FT-64 |
| Achados de widget e painel (UX) | FT-61, FT-62 (OK do proprietário), FT-63, FT-67; notas de roteiro e de `dev:start` FT-65, FT-66 |

Ordem de dependência no escopo: primeiro as fatias iniciais da OPS-24, depois a OPS-23; o restante é independente e segue a ordem do quadro.

## 4. Pendências do proprietário

- **OW-18:** antes de transmitir com a cena de produção, trocar a fonte "Nome da fila" pelo novo link do widget (links nunca são escritos na documentação).
- **Tag e release da `v0.3.0-beta`:** o merge foi feito (D-06 atendida); a tag e o release continuam reservados ao proprietário (D-07).
- Sessões de aceitação nativa no Windows/macOS (o proprietário as fornecerá depois).
- Aceitação da FND-9 e decisão sobre a story da OPS-14 (veja a seção 2).
- Desativar o workflow do GitHub Project "Close issues when status changes".

## 5. Riscos

- **Cota e trabalho em série:** um agente por vez; um gate de `@qa` por pacote. Planeje por pacote, não por fatia.
- **Plataformas sem prova:** Windows, macOS e cancelamento de produção na Twitch ainda não têm evidência; as afirmações ficam limitadas ao que rodou.
- **Histórico denso:** a evidência longa fica nas stories e no [arquivo](archive/stories-history.md); mantenha esta página e o [índice de stories](stories.md) curtos.
- **Estabilidade de testes:** casos instáveis do Chromium estão como itens TS (veja a 0.4.0-beta).

## 6. Regras de proteção

- Sem merge de PR, tag, release, bump para rc/stable nem operação financeira ao vivo sem a autorização que as regras do repositório exigem.
- Mudanças voltadas à pessoa usuária passam pelo `@ux-design-expert` (mínimo 9,0/10); mudanças de banco pelo `@data-engineer`; o `@qa` independente valida uma vez por story ou pacote.
- Registre o trabalho na story responsável nos dois idiomas.
