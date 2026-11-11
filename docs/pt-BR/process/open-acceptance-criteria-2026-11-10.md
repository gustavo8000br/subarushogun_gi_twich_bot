# Ledger dos critérios de aceitação abertos e o caminho mais curto até o lançamento beta (regra dos 80%)

**Data:** 2026-11-10. **Autor:** `@po` (Pax). **Base:** `main` em `dcfe3da`, release `v0.3.0-0d0b595-beta`. **Escopo:** somente documentação; nada foi criado, editado nem fechado no GitHub.
**English:** [Ledger of open acceptance criteria](../../process/open-acceptance-criteria-2026-11-10.md)

**Objetivo.** Correção do dono (2026-11-10): o alvo é **lançar o estágio beta (`v1.0.0-beta`)** a um amigo streamer que usa **Windows**, com pelo menos **80% das funcionalidades planejadas do lançamento testadas e funcionais** (a seção 0 define e mede). O trabalho segue em ciclos contínuos (próximo critério aberto, implementar, validar, atualizar story e handoff, seguir). Este ledger lista o que ainda está aberto, classifica e fixa a ordem dos ciclos.

**Fontes lidas:** caixas abertas das stories OPS-15, OPS-22, OPS-23, OPS-24, OPS-25, OPS-26, OPS-31 e OPS-32 (`grep -n '- \[ \]'`); linhas do [inventário](backlog-inventory.md); topo do [handoff](../session-handoff.md); [VERSIONING](../VERSIONING.md). As contagens de caixas estão nas stories; este ledger as agrupa em 47 linhas. Nada aqui é escopo novo (Artigo IV): toda linha aponta para um ID existente.

**Classes.** **A** = possível neste ambiente (Docker, PostgreSQL descartável, Chromium, OBS Flatpak local, canal de testes SubaruShogun com as autorizações vigentes). **B** = bloqueado (dono, plataforma, dado externo). **C** = fora do que o lançamento beta exige (pode ficar para depois). Coluna Ciclo: C1..C12 = ciclo do caminho da seção 4; R = ressalva declarada (fora do caminho). Esforço: P pequeno, M médio, G grande. Risco = risco para o streamer se continuar aberto.

## 0. Meta, medida e percentual atual

**Correções do dono (2026-11-10).** (1) O alvo **não é a versão estável**: é **lançar o estágio beta** (`v1.0.0-beta`) ao amigo streamer, com **pelo menos 80% das funcionalidades planejadas do lançamento testadas e funcionais**. Isso substitui a regra antiga "`v1.0.0-beta` só quando tudo estiver validado". `rc` e `stable` vêm depois, cada um com OK expresso do dono. (2) **Q1 respondida: o amigo usa Windows**; portanto o instalador, a atualização, a desinstalação e o fluxo de OBS no Windows são caminho crítico do beta, não risco aceito. (3) **Q2 respondida: a devolução de pontos por grupo (OPS-31, #115) entra no lançamento beta.** OPS-32, SSE, TypeScript e `status` ficam fora, salvo se a fórmula abaixo os exigir (não exige). A Q3 (`legacy` e commits antigos) fica com o dono e não bloqueia.

### (a) Conjunto planejado do lançamento: 32 funcionalidades

Crédito: Y = testada e funcional pelo critério de (b); N = ainda não. Classes de evidência: **FX** fixture/unitário; **PG** PostgreSQL descartável com migrations reais; **BR** navegador real pelo servidor real; **OBS** OBS nativo no Linux; **TW** Twitch real no canal de testes SubaruShogun; **WIN** execução real no Windows pelo dono. Os créditos são documentais (tirados de gates, stories e roadmap; nada foi reexecutado para este ledger); o `@qa` os recalcula no gate final.

| # | Funcionalidade (origem) | Crédito | Evidência, ou o que está aberto |
|---|---|---|---|
| 1 | Runtime local, instalação e ciclo de vida no Linux (FND-1, OPS-5) | Y | QA PASS 100/100; Compose real no Linux (PG) |
| 2 | Conexão OAuth da Twitch e status (FND-4, OPS-2) | Y | TW 2026-11-05, gate 9,2 |
| 3 | Domínio da fila e ordenação (FND-2) | Y | PG |
| 4 | Filas manuais (FND-9) | Y | TW/BR: `teste-a` criada e aberta |
| 5 | Filas com recompensa: criar, abrir, sincronizar (FND-4, FND-9) | Y | TW: `teste-r`, outbox confirmada |
| 6 | Resgate até entrada, chamada, conclusão, fulfill (FND-4, OPS-11) | Y | TW: resgate real de 50 pontos, cumprido |
| 7 | Caminhos de devolução, cancelamento, rejeição e remoção (OPS-22) | N | PG existe; ao vivo aberto: TS-25, TS-27 (LA-07, LA-08) |
| 8 | Outbox financeira durável e recuperação de `unknown` (FND-3, OPS-22) | Y | PG; gate 9,2 |
| 9 | Reconciliação com a Twitch (FND-4) | N | Defeito FT-69 (LA-02) |
| 10 | Exclusão de fila com cancelamento verificado (OPS-22) | Y | TW exclusão ao vivo; PG; gate 9,2 (cancelamento ao vivo é a 7) |
| 11 | Comandos de chat dos espectadores (FND-5) | Y | PG/FX; TW só para `ping` e `conta` (declarado) |
| 12 | Permissões e papéis dos comandos (OPS-3, OPS-7, OPS-9) | Y | QA 10/10 (FX) |
| 13 | Latência real do `ping` (OPS-26 fatia A) | Y | TW resposta de 222 ms; igualdade na janela de 30 s não provada (TS-24, classe C) |
| 14 | Reconexão automática com a Twitch (OPS-8) | Y | QA 9,5 (PG/FX) |
| 15 | Painel: configuração, visão geral, saúde (OPS-6, OPS-15) | Y | BR; gate 9,2 |
| 16 | Painel: gestão de filas e ações de ciclo de vida (OPS-15) | Y | BR mais operações de fila em TW |
| 17 | Painel: configurações, editor de permissões, operações de pontos; paridade rota/ação (FT-06, FT-09) | N | LA-01, LA-23; E2E E1 a E8 pendentes |
| 18 | Localização en/es/pt-BR (FND-8) | Y | QA 9,2 |
| 19 | Widget da conta renderiza no OBS nativo Linux (subconjunto OPS-13/25) | Y | OBS e2e, gate 9,2 |
| 20 | Resiliência do widget: reinício da API, build de produção, legibilidade (OPS-25) | N | LA-09 a LA-13 |
| 21 | Links e capacidades do widget (FND-7) | Y | QA 9,2; OBS |
| 22 | Chamadas da fila, presença, recompensas removidas (OPS-11) | Y | QA 10/10 |
| 23 | Confirmação da recompensa no início do atendimento (OPS-19) | N | Story Em andamento; o `@qa` confere no gate e pode convertê-la em Y |
| 24 | Identidade da Conta atual (OPS-18) | Y | TW `conta` igual ao widget |
| 25 | Primeiro uso e atualização em máquina Linux limpa (FT-49) | N | LA-20 |
| 26 | Resiliência do painel e atrito de configuração (FT-44, FT-66, FT-67) | N | LA-16, LA-17, LA-19 |
| 27 | Docs e runbooks do operador (runbook do OBS, nunca `dev:start`, nota de devolução duplicada) | N | LA-12, LA-14, LA-15, LA-18 |
| 28 | **Windows:** instalar, atualizar, desinstalar (OPS-5, OWN-01..04) | N | Execução do dono (LB-01); o smoke do CI usa Docker falso |
| 29 | **Windows:** smoke do painel, persistência, canal de testes da Twitch (OWN-05/06 e checklist) | N | Execução do dono (LB-02) |
| 30 | **Windows:** widget como Browser Source no OBS (checklist OWN) | N | Execução do dono (LB-04) |
| 31 | OPS-31 avisos no chat, no-show/pular/reordenar, "próximo" no widget (FT-71..73) | N | Não construída (LA-27) |
| 32 | OPS-31 devolução por grupo: `settlement`, consulta de grupo, devolução ao fim do atendimento (FT-74..77; a FT-78 é a evidência) | N | Não construída (LA-28, LA-29) |

**Futuro, fora do denominador:** SSE (OPS-23), TypeScript/Biome (OPS-24), `status` (OPS-26), calendário (OPS-32), OPS-27 a OPS-30, OPS-14, OPS-16, OPS-17, DOC-2/DOC-3, UX do instalador (OPS-12, no `rc`), macOS (antes do `rc`), leitor de tela (risco aceito).

### (b) Critério "testada e funcional"

Uma funcionalidade recebe crédito (binário, sem meio crédito) só se as três condições valem:
1. Um veredito independente do `@qa` de pelo menos 9,0 cobre o escopo, ou um teste real da classe abaixo rodou sem falha.
2. A classe de evidência combina com a natureza da funcionalidade: dinheiro e estado da fila exigem **PG**; ações visíveis na Twitch exigem **TW** ao menos uma vez para a família; funcionalidades do painel exigem **BR**; as do widget exigem **OBS**; as do Windows exigem somente **WIN** (evidência de Linux nunca vale para o Windows).
3. Nenhum defeito aberto conhecido na funcionalidade (exemplo: a FT-69 mantém a 9 em N).

Sem execução real no Windows, as funcionalidades 28 a 30 ficam **N** na fórmula. Se o dono devolver o kit de evidência com todos os itens Pass de uma funcionalidade, ela vira Y; qualquer Fail a mantém em N e reabre o critério correspondente da OPS-15.

### (c) Fórmula e percentual atual

`P = funcionalidades com crédito / funcionalidades planejadas`. Planejadas = 32. 80% de 32 = 25,6; logo são necessárias **26 funcionalidades**. **Atual: 19 / 32 = 59,4%** (Y: 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 24).

**Trava (regra proposta aqui, visível ao dono):** o percentual sozinho não libera o rótulo. As funcionalidades 7 a 10 (dinheiro) e 28 e 30 (instalação e OBS no Windows) precisam estar em Y; não podem ficar no conjunto de ressalvas declaradas. Meta no gate: **pelo menos 28 / 32 (87,5%)**, para que uma falha tardia não derrube o lançamento abaixo de 80%.

| Etapa | Com crédito | Percentual | Nota |
|---|---|---|---|
| Agora | 19 | 59,4% | |
| Após os ciclos só de agentes C2 a C5 (+ funcionalidades 7, 9, 20, 25, 26, 27) | 25 | 78,1% | Ainda abaixo de 80%: só agentes não chegam lá sem a OPS-31 ou o Windows |
| + OPS-31 (funcionalidades 31, 32) | 27 | 84,4% | A fórmula passa; a trava ainda falha sem o Windows |
| + execução do dono no Windows (funcionalidades 28, 29, 30) | 30 | 93,8% | Ressalvas declaradas: funcionalidades 17 e 23 (6,3%) |

**Por que SSE, TypeScript, `status` e OPS-32 ficam fora:** a fórmula passa com 84,4% sem eles, nenhum é funcionalidade de dinheiro nem da trava, e cada um soma risco de mudança antes da entrega. Não são funcionalidades planejadas do lançamento (ver "Futuro"). Qualquer funcionalidade nova no conjunto do lançamento aumenta o denominador e o número necessário.

## 1. Classe A — possível aqui (29 linhas)

"Ciclo" = faz parte do caminho mínimo (seção 4).

| ID | Origem | Critério aberto (curto) | Dono (agente) | Esforço | Risco | Ciclo |
|---|---|---|---|---|---|---|
| LA-01 | FT-06 / FT-03, OPS-15, TODO-01/02 | Rastreabilidade rota/ação do catálogo de endpoints, linhas de paridade reconciliadas e os 8 E2E de navegador (E1 a E8) | `@qa` mapeia, `@dev` fecha lacunas | G | Médio | R |
| LA-02 | FT-69 (OPS-22) | A reconciliação devolve `partial` / `reward_verification_failed` (404) para uma recompensa que o próprio produto apagou | `@dev`, `@data-engineer` | M | Médio (alarme financeiro falso) | C2 |
| LA-03 | TS-22 (M-2b) | Estabilizar `compose-runtime.test.js:1022` (instável após `page.reload`) | `@dev`, `@qa` | M | Baixo (confiabilidade do gate) | C2 |
| LA-04 | TS-18 (OPS-22) | PG36-16: afirmar o `isOpen` local após DELETE tardio (`open_unknown`) ou documentar a semântica | `@dev` | P | Baixo | C2 |
| LA-05 | TS-19 (OPS-22) | Reproduzir as 9 mutações não executadas (M2, M3, M5, M7, M8, M11, M15, M16, M19) | `@qa` | M | Médio (confiança financeira) | C2 |
| LA-06 | FT-55 (D-6) | Logs estruturados `twitch_integration_degraded` em toda transição para `degraded` (só diagnóstico) | `@dev` | P | Baixo | C2 |
| LA-07 | TS-25 (OPS-22) | Verificação ao vivo de um cancelamento de exclusão bem-sucedido com resgate ainda aguardando reembolso (canal de testes) | `@qa` | M | Médio | C3 |
| LA-08 | TS-27 (OWN-13) | Rejeição de resgate pela pessoa criadora na fila da Twitch; reembolso ao remover entrada chamada | `@qa` | M | Médio | C3 |
| LA-09 | FT-64 (N-4) | Conferir um build de produção (`next build`) no OBS nativo, sem o selo de dev do Next | `@qa` | M | Alto (o que o streamer mostra na live) | C4 |
| LA-10 | TS-23 (AC-W-3) | Reiniciar a API no mesmo banco; o widget se recupera | `@qa` | M | Médio | C4 |
| LA-11 | TS-26 (AC-W-6, DP-4) | Cenas escura e clara (legibilidade da linha de status em pixels) e checklist móvel; teste por teclado (leitor de tela fora, ver LB-05) | `@ux-design-expert`, `@qa` | M | Médio | C4 |
| LA-12 | FT-61 (N-1) | Informar a altura mínima da Browser Source no formulário do widget e no runbook; linha de status dentro da caixa | `@ux-design-expert`, `@dev` | P | Baixo | C4 |
| LA-13 | FT-62 (N-2) | Sombra de texto ou fundo na linha de status do widget (exige OK do dono para o estilo; propõe-se um padrão) | `@ux-design-expert`, `@dev` | P | Baixo | C4 |
| LA-14 | FT-63 (N-3) | Listar a URL legada `/overlay.html` no runbook e verificar se existe widget "nome da fila" | `@dev` | P | Baixo | C4 |
| LA-15 | FT-65 (N-5) | Nota no runbook: nunca transmitir com `dev:start` | `@dev` | P | Alto se ignorada | C4 |
| LA-16 | FT-66 | O banner do `dev:start` mostra `https://localhost:3000`, não `127.0.0.1` | `@dev` | P | Médio (atrito na instalação) | C5 |
| LA-17 | FT-67 | O painel diz que a sessão não vale em `127.0.0.1` em vez do texto genérico | `@dev`, `@ux-design-expert` | P | Médio | C5 |
| LA-18 | FT-70 | Documentar que o segundo resgate de quem já tem entrada ativa é reembolsado automaticamente (`duplicate_active_entry`) | `@dev` | P | Baixo | C5 |
| LA-19 | FT-44 (OPS-23) | Timeout de leitura e `AbortSignal` nas leituras do painel | `@dev` | M | Médio (painel travado) | C5 |
| LA-20 | FT-49 / AC "ciclo do dev" da OPS-15, parte Linux | Clone limpo e primeiro uso no Linux com Docker real: instalar, iniciar, abrir, atualizar | `@qa` (`@dev` se quebrar) | M | Alto (instalação) | C5 |
| LA-21 | AC "catálogo da comunidade" da OPS-15 | Instalar catálogo completo da comunidade após o build da imagem em ambiente descartável; descoberta em runtime sem rebuild; precedência, plurais, cache de 5 s do overlay | `@qa`, `@dev` | M | Baixo | R |
| LA-22 | TODO-04 (S-13) | Revisão de UX da S-13 com `@ux-design-expert` | `@ux-design-expert` | P | Baixo | R |
| LA-23 | FT-09, OWN-16..18, TODO-03/05/06/07 | Revisões finais independentes de `@qa` e `@architect`, repetição da auditoria de testes legados, checagens no navegador (foco após salvar a fila, 390x844, diálogo do link único do widget), builds do AC 10/axe/es-pt-BR, reconciliar as caixas desmarcadas da #69 | `@qa`, `@architect`, `@devops` (caixas) | M | Médio | C6, C12 |
| LA-24 | Kit do Windows (OWN-01..06, OW-01) | Kit de evidência e roteiro para o dono executar no Windows: comandos exatos, o que capturar, tabela de aprovado/reprovado mapeada para as funcionalidades 28 a 30; corrigir o que os agentes provarem errado sem Windows | `@dev`, `@qa`, `@ux-design-expert` (textos) | M | Alto (o amigo usa Windows) | C1 |
| LA-25 | CI do Windows (windows-native-plan, risco 4) | Job `windows-latest` (`npm ci`, lint, typecheck, `tests/unit`); testes de contrato do `.bat` (script embutido decodifica, CRLF preservado, sem caminhos fixos); o smoke do instalador nativo com Docker falso já existe | `@devops`, `@dev` | M | Médio | C1 |
| LA-26 | Caixas de planejamento da OPS-31 | Desenho (`@architect`, `@data-engineer`), plano de UX >= 9,0, plano de testes do `@qa` | `@architect`, `@data-engineer`, `@ux-design-expert`, `@qa` | M | Alto (financeiro) | C7, C8 |
| LA-27 | FT-71, FT-72, FT-73 | Avisos no chat, no-show/pular/reordenar, "próximo" no widget | `@dev` | G | Médio | C9 |
| LA-28 | FT-74..FT-77 | Configuração `settlement` e grupos de devolução, consulta de grupo e escopos com reautorização, devolução ao fim do atendimento, estado "conferir grupo" | `@dev`, `@data-engineer` | G | Alto (financeiro) | C10, C11 |
| LA-29 | FT-78 | Testes da OPS-31 no canal real de testes | `@qa` | M | Alto | C12 |

## 2. Classe B — bloqueado (9 abertas, 1 fechada)

| ID | Origem | Critério | Bloqueado por | Desbloqueia |
|---|---|---|---|---|
| LB-01 | AC instalador Windows da OPS-15, OW-01, OWN-01..04 | **Crítico para o lançamento (funcionalidade 28).** Instalador do Windows contra Docker real (instalação limpa, atualização, desinstalação, dados preservados) | Execução do dono no Windows | O dono executa o kit da LA-24 e devolve a tabela |
| LB-02 | OWN-05/06 e o checklist do Windows | **Crítico para o lançamento (funcionalidade 29).** Smoke do painel, persistência após reinício, canal de testes da Twitch no Windows (o caminho de desenvolvedor `npm run dev` é opcional e fica fora da fórmula) | Execução do dono no Windows | Igual a LB-01 |
| LB-03 | AC ciclo do dev da OPS-15, D-05, OW-07, FT-50 | Ciclo do `dev`, painel e OBS no macOS | Plataforma (sem Mac) | Um Mac antes do `rc` (D-05 = B) |
| LB-04 | AC OBS/CEF nativo da OPS-15, OPS-25 | **O widget no OBS do Windows é crítico (funcionalidade 30).** O OBS no macOS continua antes do `rc` | Execução do dono no Windows | Igual a LB-01; macOS: um Mac antes do `rc` |
| LB-05 | OWN-15 / OW-06 | Leitor de tela nas peças novas de UX | Sem tecnologia assistiva | Risco aceito (dono, 2026-11-05); fica registrado, não é gate |
| LB-06 | OW-16, OW-17 | Verificação ao vivo no canal real do dono (resgate, `ping`) | Ação do dono | O dono roda o checklist; a versão em canal de testes é LA-07/LA-08 |
| LB-07 | VERSIONING | OK para `v1.0.0-rc` | Dono | OK expresso no bump |
| LB-08 | VERSIONING | OK para `v1.0.0-stable` | Dono | OK expresso no bump |
| LB-09 | Pergunta Q1 ao dono | **Fechada em 2026-11-10:** o amigo usa Windows; portanto LB-01, LB-02 e LB-04 são caminho crítico | — | — |
| LB-10 | Pendências do dono no handoff | Apagar a branch `legacy` (desativar o ruleset); GitHub Support remover commits antigos por SHA; apagar revisões antigas de edição do PR #97 e da issue #76 | Dono | Ações do dono; higiene antes de compartilhar o repositório com o amigo |

## 3. Classe C — fora do que o lançamento beta exige (13 linhas)

| ID | Origem | Critério | Por que pode esperar |
|---|---|---|---|
| LC-01 | OPS-23 (D-7 SSE), sem a FT-44 | Fluxo de eventos no lugar do polling (4 caixas de planejamento abertas) | O polling funciona; SSE melhora latência, não correção. A FT-44 (timeouts) está na LA-19 |
| LC-02 | OPS-24, TS-16, OW-13 | Migração para TypeScript/Biome, typecheck do JSX | Qualidade interna, diff grande, risco de regressão às vésperas da entrega; nenhum comportamento visível ao streamer |
| LC-03 | OPS-26 `status`, TS-24, OW-17 | Comando `status` do streamer e sonda ao vivo do `ping` | O `ping` com latência real já saiu na 0.3.0; `status` é conveniência |
| LC-05 | OPS-32 (#117) | Calendário de ciclos da fila, aba "Filas antigas" (Rascunho, 7 caixas) | Conveniência; o dono já a marcou como candidata à 0.4.0-beta |
| LC-06 | OPS-27 (#104), FT-45/46 | Guarda automática contra vazamento de dados sensíveis | Endurecimento; recomendada em breve (repositório público), não é requisito do streamer. Ver também a nota de auditoria de vazamento de credenciais (pesquisa, sem commit) |
| LC-07 | OPS-28 (#107), FT-47/48 | Regras mais amplas do OpenGrep | Endurecimento |
| LC-08 | OPS-30 (#105), TS-17, FT-51/52 | Job de CI para os scripts E2E de navegador | O `@qa` já os roda localmente; o CI só confirma |
| LC-09 | TS-20 | Sonda de deadlock da inversão aceita da ordem de locks | O modo de falha é um 5xx genérico, sem travamento encontrado |
| LC-10 | TS-21 | `queue: max` nos workflows | Higiene de workflow |
| LC-11 | FT-53 | Manter ou melhorar o 409 após leitura 401; escrever o limite da pausa restaurada | Caso de borda, sem defeito conhecido |
| LC-12 | FT-54 | Aceite de UX dos textos singulares de exclusão | Redação |
| LC-13 | FT-56..FT-60 | UX P3: cor `--danger`, texto de 10 px, foco ao desabilitar, palavra "reward", redação em es | Polimento (FT-56 e FT-57 pedem OK do dono) |
| LC-14 | FT-68 | Desligamento da API sob `node --watch` trava (só dev) | Só desenvolvedores |

**Totais:** classe A 29, classe B 9 abertas (LB-05 é risco aceito) mais 1 fechada (LB-09), classe C 13; 51 linhas. A OPS-31 passou da classe C para a A em 2026-11-10 (decisão do dono).

## 4. Caminho mínimo até 80% e o lançamento beta

Princípio: primeiro o que protege o dinheiro; o kit do Windows antes de tudo, porque a execução do dono é o gargalo e roda em paralelo aos agentes; depois o OBS; depois a instalação; depois a OPS-31; dois gates do `@qa` (o G1 congela a linha de base antes de a OPS-31 mexer no código financeiro, para que os créditos já obtidos não regridam em silêncio; o G2 é o gate de lançamento). Um agente por vez; sem commit antes de cada gate. "R" na coluna Ciclo da seção 1 = ressalva declarada (fora do caminho).

| Ciclo | Linhas | Conteúdo | Agentes | Efeito em P |
|---|---|---|---|---|
| C1 | LA-24, LA-25 | Kit do Windows (comandos, o que capturar, tabela de aprovado/reprovado), job de CI `windows-latest`, testes de contrato do `.bat`. Depois **o dono executa no Windows (bloqueio, em paralelo)** | `@dev`, `@qa`, `@devops` | 0 agora; libera as funcionalidades 28 a 30 (+3) |
| C2 | LA-02, LA-04, LA-06, LA-03, LA-05 | Reconciliação FT-69, confiabilidade dos testes, mutações | `@dev`, `@data-engineer`, `@qa` | +1 (funcionalidade 9) |
| C3 | LA-07, LA-08 | Devolução, cancelamento, rejeição e remoção ao vivo no canal de testes | `@qa` | +1 (funcionalidade 7) |
| C4 | LA-09 a LA-15 | Widget no OBS nativo: build de produção, recuperação após reinício, legibilidade, runbook | `@qa`, `@ux-design-expert`, `@dev` | +1 (funcionalidade 20) |
| C5 | LA-20, LA-16, LA-17, LA-18, LA-19 | Instalação limpa e atualização no Linux, mensagem de sessão, timeouts, docs | `@qa`, `@dev` | +3 (funcionalidades 25, 26, 27) |
| C6 | **Gate G1** (parte da LA-23) | Um gate do `@qa` com nota >= 9,0 sobre os ciclos C2 a C5; recalcula a tabela; esperado 25/32 | `@qa` | confirma 78,1% |
| C7 | LA-26 | Desenho da OPS-31: `@architect` e `@data-engineer` (modelo, escopos, momento da devolução) | `@architect`, `@data-engineer` | 0 |
| C8 | LA-26 | Plano de UX da OPS-31 (>= 9,0) e plano de testes do `@qa` | `@ux-design-expert`, `@qa` | 0 |
| C9 | LA-27 | FT-71, FT-72, FT-73 (avisos no chat, no-show/pular/reordenar, "próximo" no widget) | `@dev`, `@qa` nos testes | +1 (funcionalidade 31) |
| C10 | LA-28 | FT-74, FT-75 (`settlement`, grupos, consulta, escopos, reautorização) | `@dev` (candidato a Opus: financeiro), `@data-engineer` | 0 |
| C11 | LA-28 | FT-76, FT-77 (devolução ao fim do atendimento, estado "conferir grupo") | `@dev` | +1 (funcionalidade 32, após a prova da C12) |
| C12 | LA-29, LA-23 | FT-78 testes reais no canal de testes; depois **Gate G2** (gate de lançamento) | `@qa`, `@architect` | recálculo final |

**Esforço:** 12 ciclos (10 de construção/teste, 2 gates; C7 e C8 são planejamento). Após a C6 a conta só de agentes é 25/32 (78,1%); após a C12, 27/32 (84,4%); com a execução do dono no Windows, 30/32 (93,8%). Os ciclos C9 a C12 acrescentam duas funcionalidades; esse é o preço da decisão do dono sobre a OPS-31, e é também o que leva a fórmula além de 80% sem o Windows. A ordem dentro da OPS-31 vem dos grupos da story (A a H).

**Windows: o que os agentes preparam sem Windows (C1, LA-24 e LA-25).**
1. Um kit de evidência em `docs/stories/OPS-15/` (en e pt-BR), construído sobre o [plano e checklist do Windows](../stories/OPS-15/windows-native-plan.md) existente: comandos PowerShell exatos para cada item (build do Windows e versão do Docker Desktop, hash do `.bat` do instalador contra a release, `docker ps` e a lista de volumes do produto antes e depois da atualização e da desinstalação, checagem de saúde do painel, passos da Browser Source no OBS), o que capturar (versões, capturas de tela do painel e de `health` `ok`, saída dos comandos com tokens, UID e texto de chat mascarados) e uma tabela Aprovado/Reprovado mapeada para as funcionalidades 28, 29 e 30.
2. Um job de CI `windows-latest` (`npm ci`, lint, typecheck, `tests/unit`), adiado no plano do Windows até a preparação do beta e agora devido; o smoke do instalador nativo com Docker falso já existe no CI e no Main CD.
3. Testes de contrato do `.bat` (o `installer.ps1` embutido decodifica, CRLF preservado, sem caminhos fixos) sobre `tests/unit/windows-native-contract.test.js`; análise estática opcional do script PowerShell, só depois de consultar o índice de pesquisa.
4. Correção de tudo o que essas checagens provarem errado, sem máquina Windows.

**C1 entregue (2026-11-10, sem máquina Windows; sem commit).** Kit: [`windows-validation-kit.md`](../stories/OPS-15/windows-validation-kit.md) (comandos, o que capturar, tabela PASS/FAIL OWN-01..06, LB-02, LB-04). CI: novo job `windows-quality` em `quality-gates.yml` (`npm ci`, typecheck e testes de contrato do Windows no `windows-latest`), **ainda fora do agregado obrigatório** (`quality-gate`) até uma execução real provar que é estável; o smoke nativo do instalador já cobria instalar, atualizar e as duas políticas de desinstalação no `windows-latest` com Docker falso (sem mudança). Testes: `tests/unit/windows-installer-contract.test.js` (22: `.bat` ASCII/CRLF/payload, idioma, porta, menu, callback, sem segredos, códigos de saída, preservação de dados) e um bloco de contrato do workflow em `tests/unit/ci-workflow-contract.test.js` (sem expansão bash em passos Windows, shell explícito). Nenhum defeito do instalador foi encontrado. Crédito: as funcionalidades 28 a 30 continuam N até o dono devolver a tabela (28 = OWN-01..04, 29 = LB-02-a..c, 30 = LB-04-a..b).

**O que só o dono pode fazer (bloqueio LB-01, LB-02, LB-04):** executar o kit em um Windows 10/11 limpo com Docker Desktop (WSL 2) e OBS, usando o instalador exato do workflow de release, e devolver a tabela preenchida. A funcionalidade 28 precisa dos itens de instalar/atualizar/desinstalar; a 29 dos itens de painel, persistência e canal de testes; a 30 dos itens de OBS. Sem a execução real, ficam em N.

## 5. Marco de versão, critérios de saída e o que muda nos documentos

**Rótulo proposto: `v1.0.0-beta`** (o estágio continua `beta`; o MAJOR sobe dentro do beta, como a política já permite). O dono substitui a regra antiga ("só quando tudo estiver validado") por "pelo menos 80% testado e funcional, funcionalidades da trava com crédito, ressalvas declaradas". O Orion decide o bump e o `@devops` o executa após o veredito do `@qa` (autoridade de alpha/beta); `rc` e `stable` seguem com OK expresso do dono em cada um.

**O que muda nos documentos (decisão do dono a ser aplicada por `@po`/`@dev`, depois `@qa`, depois `@devops`):**
- `docs/VERSIONING.md` e `docs/pt-BR/VERSIONING.md`: trocar a frase que reserva a `v1.0.0-beta` para "tudo validado e funcional (incluindo Windows, macOS, OBS nativo e evidência de Twitch ao vivo)" pela regra dos 80% com link para este ledger; atualizar "Current release plan" para o alvo `1.0.0` com a justificativa do MAJOR (marco de lançamento escolhido pelo dono); manter: bumps de rc/stable exigem OK expresso do dono, macOS antes do `rc`.
- `AGENTS.md`, seção "Política de bumps de versão" (autoritativa; prevalece): mesma troca. Os testes de contrato que citam a frase antiga (`documentation-contract`, testes da política de versão) são atualizados na mesma mudança.
- No bump o `@devops` define `1.0.0` em `package.json`, `package-lock.json` e no `VERSION` versionado; `.release-stage` continua `beta`.
- `CHANGELOG-beta.md` e `docs/pt-BR/CHANGELOG-beta.md`: novo título `## v1.0.0-beta` no topo (mais recente primeiro), espelhado, categorias com quadrado colorido; lista "Limites conhecidos" que publica as ressalvas declaradas (funcionalidades sem crédito, macOS, leitor de tela, sem SSE, sem `status`, sem calendário) e o percentual medido; bloco `> [!WARNING]` só se a OPS-31 mudar um comportamento padrão já lançado (decidido no G2). As notas da release reutilizam essa seção.

**O que o `@qa` valida no gate de lançamento (G2):**
1. Recalcular a tabela de 32 linhas com evidência por funcionalidade; `P >= 80%` e meta >= 87,5%; as funcionalidades da trava (7 a 10, 28, 30) em Y; separar a evidência por classe (FX, PG, BR, OBS, TW, WIN) e listar os checks não executados.
2. Teste real da OPS-31 no canal de testes (devolução por grupo, no-show/pular/reordenar, "próximo" no widget) e nenhuma regressão nas funcionalidades financeiras (reexecução da bateria PG e das mutações da OPS-22).
3. Nota >= 9,0; quality gates verdes (`npm run lint`, `typecheck`, `npm test`, `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static`).
4. VERSIONING, AGENTS.md e os dois changelogs em paridade e coerentes com os testes de contrato; nenhum segredo, nenhuma URL de sessão, nenhum outro projeto citado.
5. Prévia e dados ativos preservados (nada de `dev:stop` sem `--keep-data`; PostgreSQL descartável nos testes).

**Depende do dono:** a execução no Windows (LB-01, LB-02, LB-04); o OK para `v1.0.0-rc` e `v1.0.0-stable`; o resultado no macOS antes do `rc` (D-05) ou dispensa explícita; a verificação ao vivo no canal real antes da `stable` (LB-06); o estilo padrão da LA-13, se quiser outro. Se a execução no Windows não voltar, a fórmula ainda pode passar (84,4%), mas a trava falha: o lançamento precisa de dispensa explícita do dono registrada na story, e o changelog deve dizer que o Windows não foi testado.

## 6. Perguntas ao dono

- **Q1:** respondida em 2026-11-10 (Windows).
- **Q2:** respondida em 2026-11-10 (a OPS-31 entra no beta).
- **Q3:** a limpeza da `legacy` e dos commits antigos fica com o dono; não bloqueia (LB-10).
- **Q4 (nova, opcional):** aceitar o plano de dois gates (G1 e G2)? Recomendado, porque a OPS-31 mexe no código financeiro depois que a linha de base recebe crédito; com um gate só, os ciclos caem em um, mas uma regressão só apareceria no fim.

## 7. Dependências e notas

- C1 primeiro, para o dono executar o Windows enquanto os agentes trabalham; a C6 depende de C2 a C5; C7 a C12 dependem da C6; o G2 depende da C12 e da execução no Windows (ou dispensa).
- A OPS-31 (#115) está Pronta (`@po` GO 8,7); suas caixas de planejamento (`@architect`, `@data-engineer`, `@ux-design-expert`, `@qa`) estão abertas e formam a C7 e a C8. A FT-75 pode exigir novos escopos da Twitch e reautorização pelo streamer: o plano de UX precisa cobrir isso.
- Autorizações usadas: OBS nativo e canal de testes SubaruShogun (2026-11-05); sem Windows (execução do dono), sem macOS, sem leitor de tela.
- Este ledger é um plano; nenhum veredito é alegado. `@qa` e `@architect` executam as próprias verificações.
