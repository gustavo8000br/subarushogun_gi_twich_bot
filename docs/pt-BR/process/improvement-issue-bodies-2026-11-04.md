# Corpos de issue do levantamento de melhorias — 2026-11-04

[English](../../process/improvement-issue-bodies-2026-11-04.md)

**Data:** 2026-11-04. **Autor:** `@sm` (River). **Escopo:** somente documentação; o `@devops` cria as issues e edita os corpos existentes (somente o corpo principal, nunca comentários). Layout: [modelo de corpo de issue](issue-body-template.md). Os links relativos devem virar links do GitHub ao colar. Passos de registro: ação AÇ-00 de [improvement-actions-2026-11-04.md](improvement-actions-2026-11-04.md).

**Ordem de criação (issues-mãe, uma por story; as fatias viram sub-issues na hora certa):** OPS-27 primeiro, depois OPS-30, OPS-29 e OPS-28 (a ordem do quadro 8.3, 8.4, 8.5, 8.6). Formato do título: `OPS-NN — <título da story>`. Nenhuma tem decisão pendente do proprietário; as seções `## Decisões do dono` trazem a linha única `Nenhuma decisão pendente.` Os gates ficam sem marca: o `@po` confirma na validação os que não se aplicam (UX, dados), e então o `@devops` os marca com o motivo.

**Nota de escrita:** os padrões de vazamento aparecem de forma desarmada (`claude\.ai/`; o nome `Claude-Session` sem os dois-pontos) para que a verificação da OPS-27 não acuse este arquivo.

## 1. Issue nova: OPS-27

````markdown
## Português

**OPS-27 — Guarda automática contra vazamento de dados sensíveis.** Hoje a única proteção contra expor uma URL de sessão, um token ou uma chave em um repositório público é uma frase no `AGENTS.md`. Esta issue cria uma verificação automática (hook local e job de CI) que reprova o host de sessão `claude\.ai/`, o trailer `Claude-Session` e textos com formato de credencial em mensagens de commit, arquivos versionados e corpos de PR e de issue.

**Escopo:** FT-45 (núcleo da verificação e hook local) e FT-46 (job de CI e verificação dos corpos). Fora do escopo: reescrever histórico, rotacionar credenciais, serviços de terceiros, regras de código do OpenGrep (OPS-28).
**Aceite (resumo):** hook rejeita sem repetir o valor; lista de exceções por caminho com motivo (texto da regra no `AGENTS.md`, handoffs e gates que citam o padrão, documentos do framework); teste positivo e negativo por padrão; uma mutação à mão por regra falha um teste; o CI reprova mesmo com `--no-verify`; o job só falha, nunca comenta.
**Meta 9,5:** nota atual 5,0 (estimativa do Orion); o `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md) (ideia nº 5). Nenhuma parte depende do proprietário.
**Links:** [story OPS-27](../stories/OPS-27/story.md), [levantamento](../process/improvement-ideas-2026-11-04.md), itens ST-20, FT-45 e FT-46 do [inventário](../process/backlog-inventory.md). Começa depois do pacote da OPS-22; edições de workflow em série com a OPS-29 e a OPS-30.

## English

**OPS-27 — Automatic guard against leaks of sensitive data.** Today the only protection against exposing a session URL, a token or a key in a public repository is a sentence in `AGENTS.md`. This issue adds an automatic check (local hook and CI job) that rejects the session host `claude\.ai/`, the `Claude-Session` trailer and credential-shaped strings in commit messages, versioned files and PR and issue bodies.

**Scope:** FT-45 (check core and local hook) and FT-46 (CI job and body checks). Out of scope: history rewrite, credential rotation, third-party services, OpenGrep code rules (OPS-28).
**Acceptance (summary):** the hook rejects without echoing the value; path-scoped allowlist with a reason (rule text in `AGENTS.md`, handoffs and gates that cite the pattern, framework documents); a positive and a negative test per pattern; one hand mutation per rule fails a test; CI still rejects with `--no-verify`; the job only fails, never comments.
**Goal 9.5:** current score 5.0 (Orion's estimate); `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md) (idea #5). No part depends on the owner.
**Links:** [OPS-27 story](../stories/OPS-27/story.md), [survey](../process/improvement-ideas-2026-11-04.md), items ST-20, FT-45 and FT-46 of the [inventory](../process/backlog-inventory.md). Starts after the OPS-22 package; workflow edits are serialized with OPS-29 and OPS-30.

### Owner decisions (read-only mirror, no checkboxes)

- No pending decision.

## Decisões do dono

Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer` (provável: não se aplica, sem banco; o `@po` confirma)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) (provável: não se aplica, sem texto visível; o `@po` confirma)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## 2. Issue nova: OPS-30

````markdown
## Português

**OPS-30 — Job de CI para os scripts E2E de navegador.** Nenhum workflow roda os scripts `*-browser-only`; o `queue-lifecycle` ficou quebrado em 4 de 4 execuções sem alerta. Esta issue cria um job de CI (Next dev em HTTPS e Chrome) que roda todos os scripts e reprova o build quando um quebra; um script instável é investigado e nunca repetido até passar. Entrega o item TS-17 do inventário.

**Escopo:** FT-51 (job e teste de contrato do workflow) e FT-52 (prova de estabilidade e política de instabilidade). Fora do escopo: cenários novos, OBS nativo, Twitch real, tornar o job um check obrigatório do repositório.
**Aceite (resumo):** a lista de scripts vem da pasta (13 arquivos em 2026-11-04; o levantamento dizia 12) e um teste de divergência falha se um ficar de fora; uma quebra plantada deixa o job vermelho; nenhuma repetição ou falha tolerada; estabilidade sem reexecução (propostas: 10 execuções locais e 5 de CI, o `@architect` confirma); artefatos sem segredos.
**Regra:** nenhuma mudança de workflow sem o desenho do `@architect` e a revisão do `@devops`.
**Meta 9,5:** nota atual 4,0 (estimativa do Orion); o `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md) (ideia nº 1). Nenhuma parte depende do proprietário.
**Links:** [story OPS-30](../stories/OPS-30/story.md), [levantamento](../process/improvement-ideas-2026-11-04.md), itens ST-23, TS-17, FT-51 e FT-52 do [inventário](../process/backlog-inventory.md).

## English

**OPS-30 — CI job for the browser E2E scripts.** No workflow runs the `*-browser-only` scripts; `queue-lifecycle` stayed broken in 4 of 4 runs with no alert. This issue adds a CI job (Next dev over HTTPS and Chrome) that runs every script and fails the build when one breaks; an unstable script is investigated and never rerun until it passes. It delivers inventory item TS-17.

**Scope:** FT-51 (job and workflow-contract test) and FT-52 (stability proof and flake policy). Out of scope: new scenarios, native OBS, real Twitch, making the job a required repository check.
**Acceptance (summary):** the script list comes from the folder (13 files on 2026-11-04; the survey said 12) and a drift test fails if one is left out; a planted break turns the job red; no retry or tolerated failure; stability without rerun (proposals: 10 local runs and 5 CI runs, `@architect` confirms); artifacts without secrets.
**Rule:** no workflow change without the `@architect` design and the `@devops` review.
**Goal 9.5:** current score 4.0 (Orion's estimate); `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md) (idea #1). No part depends on the owner.
**Links:** [OPS-30 story](../stories/OPS-30/story.md), [survey](../process/improvement-ideas-2026-11-04.md), items ST-23, TS-17, FT-51 and FT-52 of the [inventory](../process/backlog-inventory.md).

### Owner decisions (read-only mirror, no checkboxes)

- No pending decision.

## Decisões do dono

Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer` (provável: não se aplica, sem banco; o `@po` confirma)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) (provável: não se aplica, sem texto visível; o `@po` confirma)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## 3. Issue nova: OPS-29

````markdown
## Português

**OPS-29 — Instalação limpa no CI.** O bug `create_host_path` do Compose só apareceu em um runner novo, porque toda execução anterior acontecia com a pasta já criada. Esta issue cria jobs de CI que partem de um clone limpo, sem nenhuma pasta preexistente, e percorrem o primeiro uso (instalar, iniciar, abrir, atualizar) em Linux, macOS e Windows.

**Escopo:** FT-49 (Linux com Docker real) e FT-50 (macOS e Windows, cada passo rotulado "Docker real" ou "falso isolado"). Fora do escopo: máquina Windows ou macOS real (OW-01, D-05), OBS nativo, Twitch real, mudar o comportamento do instalador.
**Aceite (resumo):** asserção de estado limpo no início de cada job; fluxo completo no Linux com dados preservados na atualização; uma regressão plantada que depende de pasta preexistente deixa o job vermelho; teste de contrato do workflow; documentação das classes de evidência e dos limites.
**Dependência:** serialização de workflow com a OPS-27 e a OPS-30; se os runners hospedados de macOS e Windows rodam contêineres Linux é uma verificação de LACUNA (research-index primeiro).
**Meta 9,5:** nota atual 6,0 (estimativa do Orion); o `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md) (ideia nº 10) sobre o que o runner consegue provar; o resíduo fica declarado e com o proprietário.
**Links:** [story OPS-29](../stories/OPS-29/story.md), [levantamento](../process/improvement-ideas-2026-11-04.md), itens ST-22, FT-49 e FT-50 do [inventário](../process/backlog-inventory.md).

## English

**OPS-29 — Clean install in CI.** The Compose `create_host_path` bug showed only on a fresh runner, because every earlier run happened with the folder already created. This issue adds CI jobs that start from a clean clone, with no pre-existing folder, and walk first use (install, start, open, update) on Linux, macOS and Windows.

**Scope:** FT-49 (Linux with real Docker) and FT-50 (macOS and Windows, every step labeled "real Docker" or "isolated fake"). Out of scope: a real Windows or macOS machine (OW-01, D-05), native OBS, real Twitch, changing installer behavior.
**Acceptance (summary):** a clean-state assertion at the start of each job; full flow on Linux with data kept across the update; a planted regression that depends on a pre-existing folder turns the job red; workflow-contract test; documentation of the evidence classes and limits.
**Dependency:** workflow serialization with OPS-27 and OPS-30; whether the hosted macOS and Windows runners run Linux containers is a GAP check (research index first).
**Goal 9.5:** current score 6.0 (Orion's estimate); `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md) (idea #10) on what the runner can prove; the residual stays declared and with the owner.
**Links:** [OPS-29 story](../stories/OPS-29/story.md), [survey](../process/improvement-ideas-2026-11-04.md), items ST-22, FT-49 and FT-50 of the [inventory](../process/backlog-inventory.md).

### Owner decisions (read-only mirror, no checkboxes)

- No pending decision.

## Decisões do dono

Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer` (confirmar que "a atualização preserva os dados" não muda schema, ou não se aplica; o `@po` confirma)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) (provável: não se aplica, sem texto visível; o `@po` confirma)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## 4. Issue nova: OPS-28

````markdown
## Português

**OPS-28 — Regras de varredura estática.** O OpenGrep é o único revisor estático e hoje tem só duas regras (HTML inseguro e credencial em log). Esta issue amplia a varredura para SQL cru, `eval`/`Function`, SSRF, segredo em código, `dangerouslySetInnerHTML` (regra estruturada de JSX) e cabeçalhos e cookies, cada regra com teste positivo e negativo. O nome do provedor de revisão antigo continua bloqueado.

**Escopo:** FT-47 (injeção e execução) e FT-48 (segredos, HTML e transporte). Fora do escopo: varredura de dependências, DAST, segundo scanner, correções automáticas.
**Aceite (resumo):** por regra, um caso positivo, um negativo e uma variante de evasão; a varredura da árvore completa sai com zero, sem exceção ampla; uma mutação à mão por regra falha um teste; regras para `javascript` e `typescript`; uma página de regras nos dois idiomas.
**Dependência:** o desenho da FT-45 (OPS-27) fixa quem é dono dos segredos; a ordem em `.opengrep/rules.yml` com a FT-30 da OPS-24 é serializada pelo `@architect`.
**Meta 9,5:** nota atual 4,0 (estimativa do Orion); o `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md) (ideia nº 4). Nenhuma parte depende do proprietário.
**Links:** [story OPS-28](../stories/OPS-28/story.md), [levantamento](../process/improvement-ideas-2026-11-04.md), itens ST-21, FT-47 e FT-48 do [inventário](../process/backlog-inventory.md).

## English

**OPS-28 — Static-scan rules.** OpenGrep is the only static reviewer and has only two rules today (unsafe HTML and credentials in logs). This issue widens the scan to raw SQL, `eval`/`Function`, SSRF, secrets in code, `dangerouslySetInnerHTML` (a structured JSX rule) and headers and cookies, each rule with a positive and a negative test. The name of the former review provider stays blocked.

**Scope:** FT-47 (injection and execution) and FT-48 (secrets, HTML and transport). Out of scope: dependency scanning, DAST, a second scanner, automatic fixes.
**Acceptance (summary):** per rule, a positive, a negative and an evasion fixture; the full-tree scan exits zero with no blanket ignore; one hand mutation per rule fails a test; rules cover `javascript` and `typescript`; a rules page in both languages.
**Dependency:** the FT-45 design (OPS-27) fixes who owns secrets; the edit order on `.opengrep/rules.yml` with OPS-24 FT-30 is serialized by the `@architect`.
**Goal 9.5:** current score 4.0 (Orion's estimate); `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md) (idea #4). No part depends on the owner.
**Links:** [OPS-28 story](../stories/OPS-28/story.md), [survey](../process/improvement-ideas-2026-11-04.md), items ST-21, FT-47 and FT-48 of the [inventory](../process/backlog-inventory.md).

### Owner decisions (read-only mirror, no checkboxes)

- No pending decision.

## Decisões do dono

Nenhuma decisão pendente.

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer` (provável: não se aplica, sem banco; o `@po` confirma)
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0) (provável: não se aplica, sem texto visível; o `@po` confirma)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## 5. Issues existentes que recebem a nota "Meta 9,5" no corpo principal

O `@devops` acrescenta o bloco abaixo às seções `## Português` e `## English` de cada corpo (somente o corpo principal, nunca um comentário). Ele não muda escopo nem critério de aceite. Cada story já carrega a seção correspondente "Meta 9,5 (levantamento de 2026-11-04)".

| Issue | Story | Ideia | Hoje | Nota a acrescentar |
|---|---|---|---|---|
| [#81](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/81) | OPS-23 (ST-16) | nº 7 atualização ao vivo (e nº 2 pela FT-44) | 5,5 (nº 2: 5,0) | Bloco A abaixo |
| [#91](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/91) | OPS-24 (ST-17), TS-16 | nº 3 tipagem | 5,0 | Bloco B abaixo |
| [#79](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/79) | OPS-21 (ST-09) | nº 6 contrato da API do painel | 5,5 | Bloco C abaixo |
| Issue da FT-44 (ainda não existe) | escopo da OPS-23 | nº 2 timeout nas leituras | 5,0 | Bloco A (linha da ideia nº 2), quando a issue for criada |
| Issue da TS-16 (ainda não existe; a TS-16 vive dentro da #91) | OPS-24 | nº 3 tipagem | 5,0 | Bloco B, se uma sub-issue for criada |

Bloco A (#81, FT-44):

````markdown
**Meta 9,5 (levantamento de 2026-11-04):** ideia nº 7 (atualização ao vivo): nota atual 5,5; ideia nº 2 (FT-44, timeout nas leituras): nota atual 5,0 (estimativas do Orion). O `@qa` atesta 9,5 com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md) (cobertura, automação, prova, operação; média 9,5 e nenhuma abaixo de 9,0). Escopo e critérios de aceite não mudam.
**Goal 9.5 (survey of 2026-11-04):** idea #7 (live updates): current 5.5; idea #2 (FT-44, read timeouts): current 5.0 (Orion's estimates). `@qa` attests 9.5 with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md) (coverage, automation, proof, operation; average 9.5 and none below 9.0). Scope and acceptance criteria do not change.
````

Bloco B (#91, TS-16):

````markdown
**Meta 9,5 (levantamento de 2026-11-04):** ideia nº 3 (tipagem do painel e do backend): nota atual 5,0 (estimativa do Orion). O 9,5 só é atestável quando a OPS-24 fecha (TS-16 e FT-30..FT-35). O `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md). Escopo e critérios de aceite não mudam.
**Goal 9.5 (survey of 2026-11-04):** idea #3 (panel and backend typing): current 5.0 (Orion's estimate). 9.5 can be attested only when OPS-24 closes (TS-16 and FT-30..FT-35). `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md). Scope and acceptance criteria do not change.
````

Bloco C (#79):

````markdown
**Meta 9,5 (levantamento de 2026-11-04):** ideia nº 6 (contrato da API do painel): nota atual 5,5 (estimativa do Orion). O 9,5 exige a fatia 7 (FT-17) feita depois do cutover; fechar a story com a fatia 7 aberta é decisão do proprietário (D-09). O `@qa` atesta com a régua de [improvement-actions](../process/improvement-actions-2026-11-04.md). Escopo e critérios de aceite não mudam.
**Goal 9.5 (survey of 2026-11-04):** idea #6 (panel API contract): current 5.5 (Orion's estimate). 9.5 requires slice 7 (FT-17) done after the cutover; closing the story with slice 7 open is an owner decision (D-09). `@qa` attests with the ruler of [improvement-actions](../process/improvement-actions-2026-11-04.md). Scope and acceptance criteria do not change.
````

As ideias 8 e 9 não têm issue nova: as ações do proprietário delas já vivem nas #69, #80, #83 e #57 (A-02, A-05, D-05, OW-16); o `@devops` não acrescenta nota ali.
