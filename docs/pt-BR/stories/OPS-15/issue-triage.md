# OPS-15 — Triagem de issues do GitHub para a validação completa do fluxo do painel Next

[English](../../../stories/OPS-15/issue-triage.md)

- **Data:** 2026-10-21
- **Autor:** `@devops` (Gage), inspeção somente leitura do GitHub (`gh issue list --state all`, `gh issue view`, `gh pr list`). Nada foi criado, editado, comentado, rotulado ou fechado.
- **Fontes:** corpos das issues; `docs/stories/OPS-15/story.md` (CA 1–18, exclusões de escopo); `docs/session-handoff.md`; `docs/stories.md`; `docs/project-completion-roadmap.md`.
- **PRs abertos:** nenhum.
- **Status:** apenas recomendações. O proprietário decide o que entra na OPS-15. As exclusões de escopo da OPS-15 dizem que ela "não é guarda-chuva para toda funcionalidade inacabada do repositório"; incorporar algo exige que o proprietário altere a story.

## Itens "cabem agora" em ordem de prioridade

| Ordem | Issue | Motivo |
|---|---|---|
| 1 | #74 | Atua diretamente em página Next (`/operations/` e tela de sincronização Twitch); o corpo diz que "Complementa OPS-15 / issue #69". Encaixa na validação de fluxo (CA 1, CA 7 "estado remoto pendente versus confirmado", "recuperação de operações"). |
| 2 | #72 | Apenas texto/orientação do painel nos formulários Nova fila e Configurações da fila, já migrados no Next; sem mudança de API/chat (CA 5, CA 13). Pequena e delimitada. |
| 3 | #57 | Regressão de recarga do overlay de conta atual; a própria #57 diz que a OPS-15 deve incluir a regressão. O aceite nativo OBS se sobrepõe ao CA 8. |
| 4 | #40 | Capturas do painel; só fazem sentido quando a UI Next for a UI aceita. Encaixa na parte "docs/READMEs" da validação, mas após o cutover. |

## Tabela completa

| Issue | Título (exato) | Estado | Relação com a OPS-15 | Motivo (CA / página) | Ação sugerida | Riscos |
|---|---|---|---|---|---|---|
| #76 | OPS-20 — Permitir que a pessoa streamer escolha quem tem direito à devolução de pontos | OPEN | Cabe após a migração | Restrição conhecida: só começa após a migração; nova regra de elegibilidade viola o CA 7 "nenhuma nova regra de negócio/domínio". | Manter separada. | Trabalho de schema/data-engineer; misturar bloquearia o cutover. |
| #75 | Avaliar diagnóstico e seleção de servidor de ingest da Twitch | CLOSED | Sem relação | Funcionalidade nova na página Conexão do canal; fechada. | Nenhuma. | — |
| #74 | OPS: Diagnosticar reconciliação e tornar operações Twitch acionáveis | OPEN | Cabe agora (parcial) | `/operations/` e tela de sincronização/devolução no Next; CA 1, CA 7. O link navegável do resumo até a operação pendente é UX do painel; a investigação de causa (por que a pendência permanece, origem de "Instável") pode tocar worker/outbox. | Incorporar a parte de painel (navegação, exibição segura de estado, texto localizado) na validação da OPS-15; manter a investigação de backend na #74. Obs.: não há arquivo de story para ela. | Expansão para semântica de outbox/reconciliação, que o CA 7 proíbe alterar; precisa de story e revisão UX ≥ 9,0 antes de mudar UI (CA 13). |
| #73 | [OPS-17] Comandos de chat multilíngues para viewers | OPEN | Cabe após a migração | Parsing/aliases de comandos de chat; o corpo diz que "é separada da paridade do painel OPS-15"; pode exigir schema. | Manter separada. | Nova regra de domínio e possível mudança de persistência. |
| #72 | OPS-16: Explicar variáveis personalizadas da mensagem de chamada da fila | OPEN | Cabe agora | Formulários Nova fila e Configurações da fila no Next; API/chat inalterados pelos próprios CA; alinhada ao CA 5 e CA 13. | Candidata a incorporar, ou entregar como incremento irmão na mesma branch; manter story própria (OPS-16) e QA. O corpo diz que suas revisões não aprovam a OPS-15 inteira. | Fazer também no vanilla duplicaria trabalho; combinar entrega só no Next. |
| #69 | OPS-15: Refatorar o painel local e o overlay OBS para Next.js modular | OPEN | Já coberta (é a OPS-15) | Issue-mãe. | Manter aberta até fechar os CA 1–18. | — |
| #65 | OPS-14: Mensagens localizadas de chamada da fila e início do atendimento | OPEN | Cabe após a migração (chat); parcialmente coberta (painel) | Corpo: a OPS-15 "não substitui os comportamentos de chat"; o roadmap a coloca após o aceite da OPS-13. A story já lista um incremento "Localized queue call-message default". | Manter separada; verificar que o incremento da OPS-15 não reivindica CA da #65 (respostas no chat Twitch, anúncio durável de início do atendimento). | Dupla reivindicação; entrega no chat exige evidência de outbox, não testes de painel. |
| #60 | OPS-12: Planejar UX do instalador para a fase RC | OPEN | Sem relação (adiada) | Depende de `.release-stage` = `rc`; estágio atual é beta. | Manter separada. | Começar antes viola o CA 1 dela. |
| #57 | Regressões: chamada de fila, overlay de conta e permissões | OPEN | Cabe agora (sobreposição de validação) | Recarga de conta atual em `/overlay.html`; CA 8. O handoff registra execuções OBS 32.2.2 nativas no Linux aprovadas; o ambiente de reprodução do proprietário ainda não foi retestado. | Manter aberta; incluir a reprodução como verificação OBS explícita da OPS-15 e pedir reteste do proprietário no overlay Next. Não fechar como coberta sem aceite nativo do proprietário. | Fechar só com evidência Linux/Chromium contradiz o corpo da issue. |
| #48 | DOC-3: Auditoria completa da consistência documental e revisão UX | OPEN | Cabe após a migração | Cobre READMEs, changelogs, stories, roadmaps — a metade documental da validação pedida; sequenciada após FND-9 e DOC-2. | Manter separada; a OPS-15 trata só das atualizações do CA 11. | Incorporar tornaria a OPS-15 um guarda-chuva. |
| #45 | OPS-10: Separate PR CI from main image delivery | CLOSED | Sem relação | CI. | Nenhuma. | — |
| #41 | OPS-8: Automatic Twitch reconnection after network interruption | CLOSED | Já coberta | Base para os estados de saúde exibidos na Visão geral (CA 7). | Nenhuma; usar como referência de regressão. | — |
| #40 | DOC-2: Capturas de tela bilíngues do produto | OPEN | Cabe após a migração | As capturas devem mostrar a UI atual aceita; o Next substitui o vanilla. | Manter separada; agendar após o cutover. | Capturar o vanilla agora gera mídia obsoleta. |
| #39 | OPS-7: Hierarchical chat command permissions and subscriber role model | CLOSED | Já coberta | Página Comandos de chat `/commands` (CA 14, 9,1/10). | Nenhuma. | — |
| #38 | DOC-1: Concise README and focused documentation navigation | CLOSED | Já coberta | Contratos de estrutura do README; CA 11. | Nenhuma. | — |
| #32 | OPS-6: Versão, conectividade e orientação visual no painel | CLOSED | Já coberta | Base visual citada no CA 7. | Nenhuma. | — |
| #30 | OPS-5: Instalador multiplataforma com progresso e remoção completa | CLOSED | Já coberta | Montagem do Compose do instalador (CA 5, CA 18). | Nenhuma. | — |
| #29 | OPS-4: Adotar a licença MIT | CLOSED | Sem relação | Licença. | Nenhuma. | — |
| #21 | OPS-2: Status Twitch em português claro no painel | CLOSED | Já coberta | Texto de status Twitch na Visão geral/Conexão (CA 5, CA 7). | Nenhuma. | — |
| #20 | OPS-1: CI para API, infraestrutura e web | CLOSED | Sem relação | CI (o CA 18 cita o workflow atual). | Nenhuma. | — |
| #19 | FND-9: Modos de fila local e com Custom Reward conforme capacidade Twitch | OPEN | Já coberta (painel); aceite do proprietário separado | Modos de fila estão na paridade Next (linhas QRA). Exclusões da story: "FND-9 continua pendente de aceite do proprietário". | Manter separada; o aceite do proprietário pode ser feito no painel Next. | Falta evidência de resgate real na Twitch. |
| #18 | FND-8: Internacionalização (i18n) com limites seguros entre backend e frontend | CLOSED | Já coberta | CA 5. | Nenhuma. | — |
| #17 | Painel: catálogo de comandos e permissões por cargo | CLOSED | Já coberta | Página `/commands`. | Nenhuma. | — |
| #7 | FND-7: Overlay OBS configurável por widget | CLOSED | Já coberta | `/widgets` e base do overlay (CA 7, CA 8). | Nenhuma. | — |
| #6 | FND-6: painel local, API protegida e segurança | CLOSED | Já coberta | CA 6. | Nenhuma. | — |
| #5 | FND-3: outbox financeira durável e recuperação | CLOSED | Já coberta | Semântica de recuperação de operações (CA 7). | Nenhuma. | — |
| #4 | FND-4: OAuth, recompensas e EventSub Twitch | CLOSED | Já coberta | Conexão do canal/callback OAuth (CA 3). | Nenhuma. | — |
| #3 | FND-1: completar documentação bilíngue e aceitação operacional | CLOSED | Sem relação | Documentação histórica. | Nenhuma. | — |
| #2 | FND-2: domínio de filas, UID, parser, autorização e ordenação | CLOSED | Já coberta | Domínio de filas (CA 6, filtragem de UID). | Nenhuma. | — |
| #1 | FND-5: comandos, chamadas, timeout e conta atual | CLOSED | Já coberta | Fluxos de chamada/conta atual (CA 7). | Nenhuma. | — |

## Lacunas encontradas (não são issues)

- OPS-18 (Conta atual como identidade única) e OPS-19 (confirmar reward Twitch ao iniciar atendimento) são stories In Progress **sem issue GitHub vinculada**, contrariando a regra "toda story nova exige issue GitHub". Ambas tocam fluxos visíveis no painel Next (chamada, conta atual, início do atendimento). Recomendação: o proprietário autoriza o `@devops` a criar as issues antes de continuar.
- A #74 não tem arquivo de story em `docs/stories/`.
