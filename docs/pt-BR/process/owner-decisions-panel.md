# Painel de decisões do proprietário

**Data:** 2026-10-30. **Autor:** `@sm` (River). **Branch:** `feat/ops-15-next-panel`. **Escopo:** somente documentação. Nada foi criado ou editado no GitHub; o `@devops` cola os blocos abaixo.
**English:** [Owner decisions panel](../../process/owner-decisions-panel.md)

## 1. Por que existe

O quadro mostrava cards "Aguardando decisão" com recomendação, mas o proprietário não tinha como decidir. Desenho aprovado (proprietário, 2026-10-30; regra normativa no `AGENTS.md`, bullet "Toda issue nasce com checklist"):

- A checklist de decisões vive no **corpo de cada issue** (`## Decisões do dono`), ao lado da seção `## Gates`. O proprietário marca uma caixa por decisão.
- Uma **issue índice** "Decisões do dono" guarda só as decisões sem issue de origem (governança, arrumação do quadro, ações do proprietário).
- O `@devops` lê todas as issues abertas a cada sincronização do quadro (seção 6), registra a decisão, move o card e avisa o orquestrador.
- Só entram as decisões que o orquestrador não pode tomar pela regra de autonomia: sem recomendação clara, ou reservadas ao proprietário (merge na `main`, tag/release, bumps de `rc` em diante, apagar dados, credenciais, escrita fora do projeto). Decisões já registradas em [decisões de projeto registradas](../../decisoes_humanas/concluidas/decisoes-de-projeto-registradas.md) ou no [inventário](backlog-inventory.md) não se repetem.

Os blocos da seção 5 estão em português, idioma dos corpos das issues e do que o proprietário lê e marca. O `@devops` acrescenta o espelho em inglês sem caixas (ver o [modelo de corpo de issue](issue-body-template.md)). Links relativos viram links do GitHub ao colar.

## 2. Mapa D-NN para issue (15 decisões)

| ID | Issue | Origem | Pergunta |
|---|---|---|---|
| D-01 | #73 | ST-11 / OPS-17 | Política de idioma do viewer nos comandos de chat |
| D-02 | #65 | ST-06 / OPS-14 | Story bilíngue da OPS-14 ausente: recriar ou localizar |
| D-03 | #72 | ST-06 / ST-08 (OPS-16) | Fechar a #72 (OPS-16), absorvida pela OPS-14? |
| D-04 | #69 | HD-03 / OW-03 | Aceite nativo do overlay no OBS/CEF (HD-03) |
| D-05 | #69 | OW-07 | macOS fica sem validação manual? |
| D-06 | #69 | PR #101 / OW-13 | Merge do PR #101 na `main` |
| D-07 | #69 | política de bump / release | Tag e release da `v0.3.0-beta` |
| D-08 | #83 | OW-10 | Seletor de idioma vai para Configurações? |
| D-09 | #79 | OW-15 | Fechar a OPS-21 com a fatia 7 aberta? |
| D-10 | #79 | OW-15 | Valor do timeout das chamadas Twitch (OPS-21) |
| D-11 | #79 | OW-15 | Fatias 3 e 4 da OPS-21 precisam anteceder o corte do OPS-15? |
| D-12 | issue índice | TS-02 / OW-12 | Remover ou reescrever 3 testes de status histórico |
| D-13 | issue índice | TS-07 / OW-12 | Um contêiner PostgreSQL por execução da suíte |
| D-14 | issue índice | D9 do desenho do quadro | Arquivar os cards legados #17 e #18 |
| D-15 | issue índice | OW-14 | Quando apagar a branch de backup `backup/ops-15-before-history-fix` |

Issues abertas sem decisão pendente: #19, #40, #48, #57, #60, #74, #76, #77, #78, #80, #81, #82, #84, #85, #86, #87, #88, #89, #90, #91, #92, #93, #94, #95, #96, #98, #99, #100. Cada uma recebe mesmo assim a linha `Nenhuma decisão pendente.` e a lista `## Gates`.

## 3. Ações do proprietário sem decisão (8 ações)

Ações são o que só o proprietário pode fazer (testes ao vivo, infraestrutura). Usam o mesmo formato de bloco com uma única caixa "Feito", para o mesmo leitor tratá-las.

| ID | Issue | Ação (sem decisão) |
|---|---|---|
| A-01 | #69 | Instalador Windows em Docker real e fluxo `npm run dev` (OW-01 e OW-02) |
| A-02 | #57 | Retestar o OBS nativo: certificado, transparência e recarga (OW-03) |
| A-03 | #19 | Aceite do FND-9: Windows e Twitch real autorizado (OW-04) |
| A-04 | #76 | Testes ao vivo com canal afiliado para as 3 lacunas da OPS-20 (OW-05) |
| A-05 | #83 | Verificações visuais e de tecnologia assistiva das peças novas de UX (OW-06) |
| A-06 | #80 | Rodar o teste ao vivo de resgate real da OPS-22 (OW-16) |
| A-07 | #89 | Verificação ao vivo LB-35 da confirmação `limpar` (FT-21) |
| A-08 | issue índice | Desligar o workflow do Project "Close issues when status changes" |

## 4. Fora da lista de propósito

| Item | Por que não é decisão agora |
|---|---|
| OW-11 autorizar o corte e a remoção do vanilla | Espera a FT-09; o corte incremental já está autorizado onda a onda (decisão de 2026-10-27) |
| Governança G-02..G-13 (GV-01..GV-12) | O proprietário decidiu em 2026-10-22; a aplicação está pendente na passada única de regras |
| OD-22-1..3, OD-23-1/2, OD-24-1..3, DP-0..DP-7, OW-08, OW-09, OW-13, HD-01, HD-02 | Já decididas e registradas |
| OW-17 teste ao vivo de `ping`/`status` | Depende da ST-19 (OPS-26), ainda não iniciada |

## 5. Blocos prontos (um por issue aberta)

### #19 — FND-9: Modos de fila local e com Custom Reward

````markdown
## Decisões do dono

### A-03 — Aceite do FND-9: Windows e Twitch real autorizado (OW-04)
**Contexto:** [Story FND-9](../stories/FND-9/story.md); operações ao vivo só com autorização expressa.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@po` reconcilia os critérios; `@devops` ajusta o quadro.
Efeito no quadro: ST-05 sai de Em revisão.

## Gates
- [ ] Story Ready (`@po`)
- [x] Parecer do `@architect` — @architect 10/10 (story FND-9)
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — @qa 10/10 na re-revisão corretiva; falta o aceite do proprietário
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #40 — DOC-2: Capturas de tela bilíngues

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #48 — DOC-3: Auditoria de consistência documental

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #57 — Regressões: chamada de fila, overlay de conta e permissões

````markdown
## Decisões do dono

### A-02 — Retestar o OBS nativo: certificado, transparência e recarga (OW-03)
**Contexto:** [Story OPS-15](../stories/OPS-15/story.md) e [OPS-13](../stories/OPS-13/story.md); alimenta a HD-03 (D-04) e a OPS-25.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@qa` registra; `@devops` ajusta o quadro.
Efeito no quadro: OW-03 vai a Concluído.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — OPS-13: `docs/qa/gates/OPS-13-overlay-capability-reload.yml`; a validação nativa acompanha a OPS-25 (Draft)
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #60 — OPS-12: UX do instalador (fase RC)

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #65 — OPS-14: Mensagens localizadas de chamada

````markdown
## Decisões do dono

### D-02 — Story bilíngue da OPS-14 ausente: recriar ou localizar
**Por que importa:** A issue #65 não tem story no repositório (lacuna de rastreabilidade); sem story não há validação do `@po` nem implementação. Nada é inventado: a story só pode nascer do corpo da issue ou do arquivo original.
**Contexto:** [Inventário, ST-06](backlog-inventory.md); [handoff da sessão](../session-handoff.md). A ST-06 também absorve a OPS-16 (#72).
- [ ] **A — Recriar a story a partir da issue (recomendado)**: o `@sm` redige em inglês e português usando só o corpo da #65; o `@po` valida.
- [ ] **B — Localizar o arquivo original**: você devolve o arquivo ao repositório e o `@sm` apenas o reconcilia.
- [ ] **C — Adiar**: a ST-06 segue em Backlog sem story.
Observação (opcional):
Quem executa depois: `@sm` (A ou B), depois `@po`.
Efeito no quadro: A ou B: ST-06 vai de Backlog a Rascunho com a story em Draft; C: sem mudança.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

## Gates
- [ ] Story Ready (`@po`) — sem story no repositório (D-02)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #69 — OPS-15: Painel Next.js e overlay OBS

````markdown
## Decisões do dono

### D-04 — Aceite nativo do overlay no OBS/CEF (HD-03)
**Por que importa:** O corte do painel vanilla só é proposto depois do aceite nativo; teste em Chromium não substitui o OBS. A HD-03 está pendente e nenhuma execução nativa está registrada.
**Contexto:** [HD-03](../../decisoes_humanas/aguardando/HD-03-aceite-nativo-obs-cef.md); [documentação do OBS Browser Source](https://obsproject.com/kb/browser-source). Letras da HD-03: A aqui = C lá; B aqui = A lá; C aqui = B lá.
- [ ] **A — Adiar o aceite (recomendado)**: a HD-03 segue pendente até existir uma sessão real de OBS (ação A-02).
- [ ] **B — Aceitar após teste nativo bem-sucedido**: marque só depois de rodar a matriz do overlay; informe versões do OBS/CEF em Observação.
- [ ] **C — Rejeitar com achado reproduzível**: informe plataforma, versões e o caso que falhou em Observação.
Observação (opcional):
Quem executa depois: Você executa o teste (A-02); `@qa` prepara a matriz; `@devops` registra.
Efeito no quadro: A: sem mudança. B: HD-03 vai para done, só para a revisão testada. C: o achado volta ao `@dev` e o gate segue aberto. B e C trazem texto em Observação e voltam ao Orion para interpretação.
Tipo: Reservada (sem marca, espera o dono)

### D-05 — macOS fica sem validação manual?
**Por que importa:** Você não tem um Mac; só o smoke do instalador roda em `macos-15`. Sem decisão, o macOS pode ser confundido com validado. A limitação precisa ficar escrita.
**Contexto:** [Story OPS-15](../stories/OPS-15/story.md), item de validação multiplataforma (macOS marcado como NÃO validado por pessoa).
- [ ] **A — Aceitar sem validação manual (recomendado)**: a limitação é registrada na story e nas notas da versão; nenhum resultado de macOS é afirmado.
- [ ] **B — Conseguir um Mac e validar antes do `rc`**: o item fica bloqueado até haver acesso.
- [ ] **C — Adiar**: o item continua aguardando.
Observação (opcional):
Quem executa depois: `@po` registra na story; `@devops` ajusta o quadro.
Efeito no quadro: OW-07: A vai a Concluído (limitação documentada); B vai a Bloqueado (depende de um Mac); C fica em Aguardando decisão.
Tipo: Reservada (sem marca, espera o dono)

### D-06 — Merge do PR #101 na `main`
**Por que importa:** Merge na `main` é reservado a você. O PR #101 está aberto e o `@qa` deve emitir o veredito final sobre o estado do PR. Na redação deste documento todos os checks da CI estavam verdes.
**Contexto:** [Handoff da sessão](../session-handoff.md); [PR #101](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/pull/101); [plano do cutover](../stories/OPS-15/cutover-plan.md).
- [ ] **A — Aguardar (recomendado)**: nenhuma autorização agora; o Orion volta a perguntar quando o veredito final do `@qa` e a CI estiverem verdes.
- [ ] **B — Autorizar o merge assim que o `@qa` liberar e a CI estiver verde**: o `@devops` executa e avisa.
- [ ] **C — Autorizar só depois das ondas restantes do cutover**: o merge espera as ondas 5, 4 e 6.
Observação (opcional):
Quem executa depois: `@qa` (veredito), depois `@devops`.
Efeito no quadro: A: sem mudança. B ou C: a autorização é registrada em `recorded-project-decisions.md` e o card de merge (se houver) vai a Pronto.
Tipo: Reservada (sem marca, espera o dono)

### D-07 — Tag e release da `v0.3.0-beta`
**Por que importa:** Tag e release exigem autorização expressa sua; a `v0.3.0-beta` está prevista para o fim do cutover. O bump alpha/beta é do Orion, mas a tag e o release são seus.
**Contexto:** `AGENTS.md`, política de bump; [plano do cutover](../stories/OPS-15/cutover-plan.md).
- [ ] **A — Adiar até o fim do cutover e o merge (recomendado)**: nenhuma tag agora.
- [ ] **B — Autorizar tag e release logo após o merge do PR #101**: o `@devops` executa.
Observação (opcional):
Quem executa depois: `@devops`.
Efeito no quadro: A: sem mudança. B: autorização registrada e o `@devops` cria tag e release depois do merge.
Tipo: Reservada (sem marca, espera o dono)

### A-01 — Instalador Windows em Docker real e fluxo `npm run dev` (OW-01 e OW-02)
**Contexto:** [Plano Windows nativo](../stories/OPS-15/windows-native-plan.md): instalação nova, atualização, desinstalação mantendo e removendo dados, `dev:start` e `dev:stop`.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@qa` recebe as evidências.
Efeito no quadro: OW-01 vai a Concluído.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [x] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — plano 9,5/10 (planejamento)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa` — gates parciais por fatia (CONCERNS); revisão final em aberto (FT-09)
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #72 — OPS-16: Variáveis personalizadas da mensagem de chamada

````markdown
## Decisões do dono

### D-03 — Fechar a #72 (OPS-16), absorvida pela OPS-14?
**Por que importa:** A OPS-16 foi incorporada à ST-06; nenhuma issue é fechada sem o seu OK. Deixar aberta evita perder o rastro, fechar reduz o ruído do quadro.
**Contexto:** [Inventário, ST-06](backlog-inventory.md): a #72 segue aberta até o seu OK e o corpo da #65 deve citar a junção.
- [ ] **A — Manter aberta (recomendado)**: a #72 só fecha quando a OPS-14 for entregue.
- [ ] **B — Fechar agora**: o `@devops` registra a junção no corpo da #65 e fecha a #72.
Observação (opcional):
Quem executa depois: `@devops` (apenas em B).
Efeito no quadro: A: nada muda; B: o `@devops` atualiza o corpo da #65, fecha a #72 e ajusta o quadro.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #73 — OPS-17: Comandos de chat multilíngues

````markdown
## Decisões do dono

### D-01 — Política de idioma do viewer nos comandos de chat
**Por que importa:** A história OPS-17 não começa sem decidir como as variantes de idioma dos comandos são configuradas e resolvidas (AC 1). Sem a decisão, o card ST-11 fica parado em Aguardando decisão.
**Contexto:** [Story OPS-17](../stories/OPS-17/story.md), AC 1: decidir de forma explícita, sem inferir o idioma do viewer. O card ST-11 (P3) depende da ST-06 (OPS-14) e da ST-01 (OPS-15).
- [ ] **A — Adiar (recomendado)**: mantém os comandos atuais e reabre a decisão depois da OPS-14 e da migração OPS-15.
- [ ] **B — Palavras fixas por idioma suportado**: lista fechada mantida pelo projeto, sem configuração da pessoa streamer.
- [ ] **C — Aliases configurados pela pessoa streamer**: cada fila define as palavras; o sistema detecta colisões.
Observação (opcional):
Quem executa depois: `@po` refina a story; depois `@sm`/`@dev`.
Efeito no quadro: ST-11 sai de Aguardando decisão: A volta a Backlog; B ou C vai a Rascunho com a política registrada em `docs/human_decisions/`.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #74 — Diagnosticar reconciliação (incorporada à OPS-22)

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
Sem gates próprios: esta issue acompanha outra (ver o corpo e o quadro).
````

### #76 — OPS-20: Elegibilidade de devolução de pontos

````markdown
## Decisões do dono

### A-04 — Testes ao vivo com canal afiliado para as 3 lacunas da OPS-20 (OW-05)
**Contexto:** [Pesquisa da OPS-20](../stories/OPS-20/research.md): expiração/limite de UNFULFILLED, assinantes Prime, broadcaster na própria lista.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@analyst` interpreta o resultado.
Efeito no quadro: As lacunas são fechadas; ST-10 segue o plano.

## Gates
- [ ] Story Ready (`@po`) — GO do `@po` registrado; o status da story ainda é Draft refined
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [x] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — 9,1/10, só revisão estática
- [ ] Plano de testes do `@qa` — CONCERNS a resolver
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #77 — OPS-18: Conta atual como overlay do jogador

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa` — o `@qa` mapeia os critérios e emite o veredito
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #78 — OPS-19: Confirmar recompensa ao iniciar atendimento

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa` — o `@qa` reexecuta a suíte e emite o veredito
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #79 — OPS-21: Contrato da API do painel

````markdown
## Decisões do dono

### D-09 — Fechar a OPS-21 com a fatia 7 aberta?
**Por que importa:** A fatia 7 (remover o campo `error`) só pode sair junto da remoção do painel vanilla. Sem a decisão, a story não tem critério de fechamento.
**Contexto:** [Story OPS-21](../stories/OPS-21/story.md), fatia 7 e riscos; [inventário, FT-17](backlog-inventory.md).
- [ ] **A — Fechar a OPS-21 sem a fatia 7 (recomendado)**: a fatia 7 (FT-17) vira acompanhamento junto da remoção do vanilla.
- [ ] **B — Manter a OPS-21 aberta até a remoção do vanilla**: a story só fecha com as 7 fatias.
- [ ] **C — Adiar**: decidir quando as fatias 1 a 6 terminarem.
Observação (opcional):
Quem executa depois: `@po` ajusta a story.
Efeito no quadro: A: FT-17 permanece Bloqueado e a OPS-21 pode fechar sem ela; B e C: a OPS-21 permanece aberta.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### D-10 — Valor do timeout das chamadas Twitch (OPS-21)
**Por que importa:** O AC 25 exige timeouts explícitos nas chamadas Twitch dos caminhos de requisição; o valor está só proposto. Sem valor fechado, o teste do AC não pode ser escrito.
**Contexto:** [Story OPS-21](../stories/OPS-21/story.md), AC 25 ("proposto até 15 s").
- [ ] **A — Até 15 s (recomendado)**: valor proposto pela story.
- [ ] **B — Adiar até o `@architect` medir a latência real**: o valor volta aqui com a medição.
Observação (opcional):
Quem executa depois: `@po` fixa o valor na story; `@architect` confirma.
Efeito no quadro: A: AC 25 deixa de ser "proposto". B: sem mudança.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### D-11 — Fatias 3 e 4 da OPS-21 precisam anteceder o corte do OPS-15?
**Por que importa:** As fatias 3 e 4 (S-05 e S-04) mexem na API e no banco; a ordem em relação ao corte muda o ciclo. O `@architect` precisa de uma regra para fixar a ordem.
**Contexto:** [Story OPS-21](../stories/OPS-21/story.md); [inventário, FT-13 e FT-14](backlog-inventory.md).
- [ ] **A — Deixar o `@architect` fixar a ordem (recomendado)**: ele decide no ciclo das FT-13/FT-14 e registra.
- [ ] **B — Devem anteceder o corte**: o corte espera essas fatias.
- [ ] **C — Não precisam anteceder o corte**: seguem depois da migração.
Observação (opcional):
Quem executa depois: `@architect`.
Efeito no quadro: FT-13 e FT-14 recebem a ordem definida; nenhum card muda de coluna.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

## Gates
- [x] Story Ready (`@po`) — GO 9/10 em 2026-10-22
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #80 — OPS-22: Recuperar o estado financeiro `unknown`

````markdown
## Decisões do dono

### A-06 — Rodar o teste ao vivo de resgate real da OPS-22 (OW-16)
**Contexto:** [Pesquisa de sincronização de resgates](../stories/OPS-15/redemption-sync-research.md), "o que só um teste ao vivo confirma"; já autorizado, execução automatizada após FT-25/FT-26.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@analyst`/`@dev` preparam a captura.
Efeito no quadro: AC 19 da OPS-22 recebe a aceitação separada.

## Gates
- [x] Story Ready (`@po`) — GO 9,5/10; revalidação do escopo alterado (FT-36) em aberto
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa` — só a FT-24: CONCERNS 8,6/10
- [ ] Commit (`@devops`) — só a FT-24 (`95c15d4`)
- [ ] CI verde
````

### #81 — OPS-23: Tempo real (SSE)

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`) — GO 9,0/10
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #82 — OPS-22/FT-24: Status de resgate Helix

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [x] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — não se aplica: a fatia não tem texto visível
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS 8,6/10, 0 bloqueantes
- [x] Commit (`@devops`) — `95c15d4`
- [ ] CI verde
````

### #83 — OPS-15/FT-01: Polimento das páginas

````markdown
## Decisões do dono

### D-08 — Seletor de idioma vai para Configurações?
**Por que importa:** Decisão de UX pendente desde a revisão de páginas; afeta a navegação do painel Next. O plano de UX da FT-01 precisa dela para fechar a nota 9,0.
**Contexto:** [Handoff da sessão](../session-handoff.md), pendências do proprietário; [FT-01 (#83)](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/83).
- [ ] **A — Delegar ao plano de UX da FT-01 (recomendado)**: o `@ux-design-expert` compara as opções e propõe com nota mínima 9,0.
- [ ] **B — Mover o seletor para Configurações**: decisão direta sua.
- [ ] **C — Manter onde está**: sem mudança de UI.
Observação (opcional):
Quem executa depois: `@ux-design-expert` (plano), depois `@dev`.
Efeito no quadro: OW-10 sai de Aguardando decisão para Concluído; A leva a escolha ao plano da FT-01, B e C a registram como decisão.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### A-05 — Verificações visuais e de tecnologia assistiva das peças novas de UX (OW-06)
**Contexto:** NVDA/VoiceOver na linha de prazo da chamada, foco ao salvar a fila, layout 390x844 e diálogo do link do widget; depende da FT-01.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@ux-design-expert` e `@qa` preparam o roteiro.
Efeito no quadro: OW-06 vai a Concluído.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #84 — OPS-15/FT-02: Placeholders na criação de fila

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #85 — OPS-15/FT-05: Catálogos para local neutro

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — junto da FT-40 (#96)
- [x] Commit (`@devops`) — `ec12ae0` (FT-40)
- [ ] CI verde
````

### #86 — OPS-15/FT-06: Rastreabilidade rota/ação

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #87 — OPS-15/FT-07: Catálogo de comunidade após o build

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [x] Commit (`@devops`) — `2f854c7`
- [ ] CI verde
````

### #88 — OPS-15/FT-08: Achados QRA-13 e QRA-02

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #89 — OPS-15/FT-21: Confirmação `clear CONFIRM`

````markdown
## Decisões do dono

### A-07 — Verificação ao vivo LB-35 da confirmação `limpar` (FT-21)
**Contexto:** [Story OPS-15](../stories/OPS-15/story.md), FT-21 (D-1).
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@qa` registra como evidência ao vivo.
Efeito no quadro: FT-21 recebe a evidência de classe ao vivo.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS 9,0 e 9,2 (qa-gate-2026-10-29c e 29d)
- [x] Commit (`@devops`) — `214db00`
- [ ] CI verde
````

### #90 — OPS-15/FT-22: Posição da chamada via outbox

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [x] Parecer do `@data-engineer` — `ft-22-data-engineer-confirmation.md`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS 9,3 (qa-gate-2026-10-29e)
- [x] Commit (`@devops`) — `e01fce3`
- [ ] CI verde
````

### #91 — OPS-24: TypeScript e Biome

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`) — GO 9,0/10
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [x] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — não se aplica: o `@po` confirmou que não há gate de UX
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #92 — OPS-15/FT-37: Onda 0, código morto

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS (qa-gate-2026-10-27c)
- [x] Commit (`@devops`) — `08e84cb`
- [ ] CI verde
````

### #93 — OPS-15/FT-38: Onda 1, servir `/` pelo Next

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS (qa-gate-2026-10-27d)
- [x] Commit (`@devops`) — `384a7e7`
- [ ] CI verde
````

### #94 — ROADMAP: Documentação e chat

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
Sem gates próprios: esta issue acompanha outra (ver o corpo e o quadro).
````

### #95 — OPS-15/FT-39: Onda 3, remover overlay vanilla

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — qa-gate-2026-10-29b
- [x] Commit (`@devops`) — `906fd5c`..`0e5f1c9`
- [ ] CI verde
````

### #96 — OPS-15/FT-40: Onda 2, catálogos

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [x] Veredito do `@qa` — CONCERNS 9,3 (qa-gate-2026-10-29b e 29c)
- [x] Commit (`@devops`) — `ec12ae0`
- [ ] CI verde
````

### #98 — OPS-22/FT-25: Retry limitado e resolução manual

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — plano compartilhado com FT-23 e FT-36 (>= 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #99 — OPS-22/FT-26: Ordem e estados da exclusão de fila

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [x] Story Ready (`@po`)
- [x] Parecer do `@architect`
- [x] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — plano compartilhado com FT-23 e FT-36 (>= 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### #100 — OPS-22/FT-36: Cancelar exclusão pendente

````markdown
## Decisões do dono
Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`) — revalidação do `@po` em aberto
- [x] Parecer do `@architect` — `architect-review-ft36.md`
- [x] Parecer do `@data-engineer` — `ft-36-data-engineer-confirmation.md`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) — plano compartilhado com FT-23 (>= 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

### Índice — Decisões do dono (issue a criar pelo `@devops`)

````markdown
## Decisões do dono

### D-12 — Remover ou reescrever 3 testes de status histórico
**Por que importa:** Três testes de `fnd7-documentation-contract` congelam texto histórico de histórias fechadas; não protegem regra atual e quebram edições legítimas. Pela regra do projeto, nenhum teste sai sem história, issue e sua decisão.
**Contexto:** [Auditoria da suíte](../stories/OPS-15/test-suite-audit-2026-10-23.md), classe D. TS-02 vai no ciclo único de testes junto de TS-03, TS-05, TS-06 e TS-09.
- [ ] **A — Remover os 3 testes (recomendado)**: a auditoria os classifica como sem regra atual.
- [ ] **B — Reescrever para checar a regra atual**: mantém a cobertura sem congelar texto de status.
- [ ] **C — Adiar**: nada muda.
Observação (opcional):
Quem executa depois: `@devops` cria a issue; `@dev` test-first; `@qa` valida.
Efeito no quadro: TS-02 sai de Aguardando decisão: A ou B vai a Pronto; C fica.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### D-13 — Um contêiner PostgreSQL por execução da suíte
**Por que importa:** Hoje são 7 contêineres com migrate cada; a auditoria estima 20 a 60 s dos 105 s, sem medição. A mudança toca infra de teste e a limpeza de Docker.
**Contexto:** [Auditoria da suíte](../stories/OPS-15/test-suite-audit-2026-10-23.md), item de aceleração. Ciclo único: TS-07, TS-08 e TS-11 (medições primeiro).
- [ ] **A — Sim, com as medições primeiro (recomendado)**: a TS-11 mede e a TS-07 implementa se o ganho se confirmar.
- [ ] **B — Não, manter os 7 contêineres**: o isolamento atual fica como está.
- [ ] **C — Adiar**: nenhuma medição agora.
Observação (opcional):
Quem executa depois: `@devops` cria a issue; `@dev` test-first; `@qa` valida.
Efeito no quadro: TS-07 sai de Aguardando decisão: A vai a Pronto (medições primeiro); B é arquivada; C fica.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### D-14 — Arquivar os cards legados #17 e #18
**Por que importa:** As issues #17 e #18 estão concluídas e ocupam 2 dos 112 cards; o desenho prevê arquivar acima de 100 cards. Arquivar não apaga o histórico.
**Contexto:** [Desenho do quadro](kanban-board-design.md), decisão D9 e seção 5.1.
- [ ] **A — Arquivar os dois cards agora (recomendado)**: histórico preservado no arquivo do Project.
- [ ] **B — Manter os dois no quadro**: nada muda.
- [ ] **C — Adiar**: decidir quando o quadro crescer.
Observação (opcional):
Quem executa depois: `@devops`.
Efeito no quadro: A: ativos 66 → 64 e arquivados 46 → 48 (os 110 itens do inventário não mudam); B e C: sem mudança.
Tipo: Padrão (sem marca, aplica-se a opção recomendada)

### D-15 — Quando apagar a branch de backup `backup/ops-15-before-history-fix`
**Por que importa:** Apagar branch é remoção de dados e só você autoriza; a branch guarda o histórico anterior à correção. Ela fica até você dizer o contrário.
**Contexto:** [Handoff da sessão](../session-handoff.md); [inventário, OW-14](backlog-inventory.md): só existe a referência remota.
- [ ] **A — Manter (recomendado)**: até o merge do PR #101 e a validação do cutover.
- [ ] **B — Apagar depois do merge do PR #101**: o `@devops` remove a referência remota.
Observação (opcional):
Quem executa depois: `@devops` (apenas em B).
Efeito no quadro: A: sem mudança. B: autorização registrada e o `@devops` apaga a branch após o merge.
Tipo: Reservada (sem marca, espera o dono)

### A-08 — Desligar o workflow do Project "Close issues when status changes"
**Contexto:** [Desenho do quadro](kanban-board-design.md), seção 6; [handoff](../session-handoff.md). Configuração do Project no GitHub, só você.
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: `@devops` confirma depois.
Efeito no quadro: Nenhuma issue fecha por mudança de Situação.

## Gates
Sem gates próprios: issue índice, sem story.
````

## 6. Protocolo de leitura do `@devops`

1. **Varrer TODAS as issues abertas** (`gh issue list --state open --limit 100`, depois `gh issue view N --json body`) a **cada sincronização do quadro**, não só as que mudaram.
2. **Reler o corpo ANTES de qualquer edição.** Nunca editar a partir de cópia antiga.
3. **Fazer o parse de `- [x]`** dentro de `## Decisões do dono`, um bloco (`### D-NN` ou `### A-NN`) por vez. As caixas de `## Gates` são suas; as do proprietário nunca são tocadas.
4. **Exatamente uma opção marcada no bloco e `Observação (opcional):` vazia** (ou só espaços):
   - registrar em `docs/human_decisions/` (o HD correspondente; senão uma linha datada em `done/recorded-project-decisions.md`, em inglês e português) com a data, o D-NN e a letra da opção;
   - ajustar o inventário e mover o card como diz o `Efeito no quadro` do bloco;
   - avisar o orquestrador (relatório final da sincronização);
   - marcar o bloco como processado acrescentando ` ✅ registrado em AAAA-MM-DD (opção X), commit <hash>` ao título `### D-NN`, **sem desmarcar nada**;
   - em bloco de ação, um `Feito` marcado é registrado do mesmo modo.
5. **Zero marcas, duas ou mais marcas, ou texto em `Observação`** significa "precisa de interpretação": não registrar, não mover o card, devolver o bloco (issue, D-NN, o que foi encontrado) ao orquestrador.
6. **Reler imediatamente antes de gravar** o corpo. Se o corpo mudou desde o passo 2, repetir do passo 2 e preservar todas as marcas do proprietário.
7. **Nunca comentar** na issue; editar só o corpo principal. **Nunca desmarcar** uma caixa do proprietário, nem depois de processar.
8. Gates: marcar uma caixa de `## Gates` só quando o gate passou e a evidência (story, parecer ou gate do `@qa`) está registrada; acrescentar a evidência como nota curta na mesma linha.
9. A issue índice "Decisões do dono" segue o mesmo protocolo. Criá-la uma vez, com o bloco da seção 5, antes da primeira sincronização que a leia.

## 7. Contagens

15 decisões (D-01..D-15) e 8 ações do proprietário (A-01..A-08) em 34 issues abertas mais a issue índice. As contagens do quadro não mudam: 66 ativos, 46 arquivados, 110 itens do inventário; a D-14, se aprovada, moveria #17 e #18 para arquivados (64 ativos, 48 arquivados).

## Decisões reservadas e decisões padrão (regra do dono, 2026-10-30)

Cada bloco de decisão leva uma linha `Tipo:`.
- **Reservada (espera o dono; sem marca significa "esperar"):** D-04 (aceite nativo de OBS/CEF), D-05 (aceitar o macOS sem validação), D-06 (merge do PR #101 na `main`), D-07 (tag e release da `v0.3.0-beta`), D-15 (apagar a branch de backup).
- **Padrão (sem marca significa "aplicar a opção recomendada"):** D-01 a D-03 e D-08 a D-14. Quando o item chega à frente da fila de implementação sem marca, o orquestrador aplica a opção recomendada, registra em `docs/human_decisions/` com a nota "aplicada por padrão", e o dono pode reverter marcando outra opção.
