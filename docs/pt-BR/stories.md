# Stories de desenvolvimento — índice

[English](../stories.md) · [Voltar ao README](../../README.pt-BR.md)

**Atualizado:** 2026-11-05 (versão `0.3.0-beta`). Esta página é só um **índice**: ID, título, issue, status e link. Cada story em `docs/pt-BR/stories/<ID>/story.md` é a fonte de critérios de aceite, evidências e lista de arquivos. Isto não fecha stories nem autoriza release. O texto longo que ficava aqui (evidências de TDD das FND-1 a FND-7, notas de planejamento e lista de arquivos do planejamento) está em [histórico de stories](archive/stories-history.md).

Veja também: [roteiro atual](project-completion-roadmap.md) · [inventário do backlog](process/backlog-inventory.md) (seção 2.1: escopo da 0.4.0-beta) · [handoff da sessão](session-handoff.md). A OPS-14 (#65, instruções de chamada localizadas) ainda não tem arquivo de story: veja o [roteiro](project-completion-roadmap.md). A análise [TWITCH-CAPABILITY-GAP-ANALYSIS](stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md) cruza os recursos oficiais da Twitch com as stories. O planejamento original (FND-0) está em [spec](stories/FND-0/spec/spec.md).

## Em andamento, em revisão ou aguardando o proprietário

| ID | Título | Issue | Status | Story |
|---|---|---|---|---|
| OPS-15 | Painel Next.js e overlay do OBS (cutover mergeado no PR #101) | [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) | Em andamento (gates de fechamento) | [OPS-15](stories/OPS-15/story.md) |
| OPS-18 | Conta atual como overlay único de identidade do jogador | [#77](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/77) | Em andamento | [OPS-18](stories/OPS-18/story.md) |
| OPS-19 | Confirmar o resgate da Twitch quando o atendimento começa | [#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78) | Em andamento | [OPS-19](stories/OPS-19/story.md) |
| OPS-22 | Recuperar o estado financeiro `unknown` e excluir filas com segurança | [#80](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/80) | Em revisão | [OPS-22](stories/OPS-22/story.md) |
| FND-9 | Modos de fila manual e por resgate | [#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19) | Pronta para revisão; aceitação do proprietário pendente | [FND-9](stories/FND-9/story.md) |
| OPS-13 | Widget de conta do OBS utilizável após recarregar | [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) | Pronta para revisão; aceitação no OBS nativo pendente (veja OPS-25) | [OPS-13](stories/OPS-13/story.md) |

## Prontas (validadas, aguardando início)

| ID | Título | Issue | Status | Story |
|---|---|---|---|---|
| OPS-21 | Endurecer o contrato da API do painel (idempotência, recuperação de sessão, códigos de erro) | — | Pronta | [OPS-21](stories/OPS-21/story.md) |
| OPS-23 | Atualizações do painel em tempo real (SSE) e estado compartilhado (0.4.0-beta) | [#81](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/81) | Pronta | [OPS-23](stories/OPS-23/story.md) |
| OPS-24 | Backend em TypeScript e Biome no lugar do ESLint (0.4.0-beta) | [#91](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/91) | Pronta | [OPS-24](stories/OPS-24/story.md) |
| OPS-27 | Guarda automática contra vazamento de dados sensíveis (fora da 0.4.0-beta) | [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) | Pronta | [OPS-27](stories/OPS-27/story.md) |

## Feitas

| ID | Título | Issue | Status | Story |
|---|---|---|---|---|
| FND-1 | Identidade de versão e base do runtime local | [#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3) | Feita | [FND-1](stories/FND-1/story.md) |
| FND-2 | Domínio da fila, validação, ordenação e parser | [#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2) | Feita | [FND-2](stories/FND-2/story.md) |
| FND-3 | Outbox durável e recuperação financeira | [#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5) | Feita | [FND-3](stories/FND-3/story.md) |
| FND-4 | OAuth da Twitch, adaptadores e reconciliação | [#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4) | Feita | [FND-4](stories/FND-4/story.md) |
| FND-5 | Comandos de chat, chamadas, ciclo de atendimento e posse da conta | [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1) | Feita | [FND-5](stories/FND-5/story.md) |
| FND-6 | Painel local, API protegida e documentação do operador | [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6) | Feita | [FND-6](stories/FND-6/story.md) |
| FND-7 | Widgets configuráveis do overlay local do OBS | [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7) | Feita | [FND-7](stories/FND-7/story.md) |
| FND-8 | Localização de todo o produto | [#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18) | Feita | [FND-8](stories/FND-8/story.md) |
| OPS-1 | CI para API, infraestrutura e web | [#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20) | Feita | [OPS-1](stories/OPS-1/story.md) |
| OPS-2 | Localizar o status de configuração da Twitch no painel | [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21) | Feita | [OPS-2](stories/OPS-2/story.md) |
| OPS-3 | Catálogo de comandos e permissões por papel | [#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17) | Feita | [OPS-3](stories/OPS-3/story.md) |
| OPS-4 | Licença MIT | [#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29) | Feita | [OPS-4](stories/OPS-4/story.md) |
| OPS-5 | Instalador unificado de ciclo de vida multiplataforma | [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30) | Feita | [OPS-5](stories/OPS-5/story.md) |
| OPS-6 | Status de execução claro e estados guiados do painel | [#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32) | Feita | [OPS-6](stories/OPS-6/story.md) |
| OPS-7 | Permissões hierárquicas de comandos de chat | [#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39) | Feita | [OPS-7](stories/OPS-7/story.md) |
| OPS-8 | Recuperação automática da Twitch após interrupções de rede | [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41) | Feita | [OPS-8](stories/OPS-8/story.md) |
| OPS-9 | Regras unificadas de acesso a comandos | — | Feita | [OPS-9](stories/OPS-9/story.md) |
| OPS-10 | Separar o CI do PR da entrega da imagem da main | [#45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45) | Feita | [OPS-10](stories/OPS-10/story.md) |
| OPS-11 | Chamadas da fila, permissões, presença e resgates removidos | [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) | Feita | [OPS-11](stories/OPS-11/story.md) |
| DOC-1 | README conciso e navegação focada da documentação | — | Feita | [DOC-1](stories/DOC-1/story.md) |

## Planejadas (rascunho, backlog, adiadas)

| ID | Título | Issue | Status | Story |
|---|---|---|---|---|
| OPS-25 | Validar o widget de conta no overlay Next (OBS nativo) | [#109](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/109) | Rascunho | [OPS-25](stories/OPS-25/story.md) |
| OPS-26 | Comandos de sistema no chat: `ping` com latência real, depois `status` (0.4.0-beta) | [#108](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/108) | Rascunho | [OPS-26](stories/OPS-26/story.md) |
| OPS-17 | Comandos de chat multilíngues para espectadores | [#73](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73) | Rascunho | [OPS-17](stories/OPS-17/story.md) |
| OPS-20 | Escolher quem é elegível a reembolso de pontos | [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76) | Rascunho (refinada) | [OPS-20](stories/OPS-20/story.md) |
| OPS-28 | Ampliar as regras de varredura estática do OpenGrep | [#107](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/107) | Rascunho | [OPS-28](stories/OPS-28/story.md) |
| OPS-29 | Instalação limpa no CI em Linux, macOS e Windows | [#106](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/106) | Rascunho | [OPS-29](stories/OPS-29/story.md) |
| OPS-30 | Job de CI para os scripts E2E de navegador (0.4.0-beta) | [#105](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/105) | Rascunho | [OPS-30](stories/OPS-30/story.md) |
| OPS-31 | Fila natural e devolução de pontos do canal por grupo (proposta do dono, 0.4.0-beta+) | [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) | Pronta | [OPS-31](stories/OPS-31/story.md) |
| OPS-16 | Explicar as variáveis da mensagem de chamada personalizada | [#72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72) | Backlog | [OPS-16](stories/OPS-16/story.md) |
| OPS-12 | Planejamento da UX do instalador para o release candidate | [#60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60) | Pronta para revisão; adiada até o `rc` | [OPS-12](stories/OPS-12/story.md) |
| DOC-2 | Capturas de tela do produto e pré-voo visual de UX | [#40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40) | Planejada | [DOC-2](stories/DOC-2/story.md) |
| DOC-3 | Auditoria completa de consistência da documentação | [#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48) | Planejada | [DOC-3](stories/DOC-3/story.md) |
