# OPS-6 — Estado de runtime claro e orientação no painel

[English](../../../stories/OPS-6/story.md)

**Prioridade:** Alta — confiança operacional e orientação na primeira execução.
**Status:** Done — QA independente PASS, 100/100.
**Tipo:** Frontend / acessibilidade / usabilidade do produto.
**Executor:** @dev
**Gate de qualidade:** @qa
**Pesquisa:** [`ux-research.md`](ux-research.md) e [equivalente em inglês](../../../stories/OPS-6/ux-research.md).
**Issue GitHub:** [#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32) (fechada após o merge da [PR #33](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/pull/33), commit `487f822`).

## História

**Como** streamer que opera o painel local,
**quero** que a versão em execução e o estado real das conexões continuem visíveis, com próximos passos claros para estados incompletos e vazios,
**para que** eu confie no painel e saiba o que fazer durante a configuração e a live.

## Contexto e escopo

A auditoria no Chrome em 2026-10-07 mostrou que `/health` retornava `v0.6.0-b6ccd0f-alpha`, banco conectado e API Twitch não configurada, enquanto o painel mostrava apenas “VERSÃO LOCAL”, “Verificando” e “Conectando”. `refresh()` aplica traduções depois de atribuir esses valores, e os placeholders estáticos traduzidos os sobrescrevem. A auditoria também encontrou instrução enganosa no estado vazio de filas, ação genérica de primeira execução, seletor de idioma duplicado e textos auxiliares operacionais pequenos.

Esta story melhora somente o painel local existente do streamer. Não altera contratos da API, Twitch/OAuth, política de filas ou pontos, texto escrito pelo streamer, nem introduz novo framework visual.

## Critérios de aceite

1. **Dado que** `/api/state` retorna uma versão do produto, **quando** o painel carrega, atualiza ou muda de idioma, **então** o cabeçalho mostra exatamente esse `product_version` e as traduções estáticas não o substituem.
2. **Dado que** `/health` retorna os estados do banco e da Twitch, **quando** a visão geral é exibida ou atualizada em qualquer idioma suportado, **então** mostra esses estados localizados; ping nulo aparece como “Sem medição” ou equivalente no idioma selecionado, e não como estado de conexão.
3. **Dado que** a instalação não está conectada, **quando** o streamer abre a visão geral, **então** a ação principal abre a conexão Twitch. **Dada uma instalação elegível e conectada, sem filas, quando** a visão geral é exibida, **então** a ação abre a criação de fila. **Dado que** há filas, **quando** a visão geral é exibida, **então** a ação abre as operações de fila. A interface não afirma que a live está pronta enquanto a configuração estiver incompleta.
4. **Dado que** não há filas, **quando** o streamer abre operações de fila, **então** o estado vazio oferece uma ação adequada à configuração e não menciona um formulário “acima” em outra página.
5. **Dado que** as credenciais Twitch não foram validadas, **quando** o streamer visita a configuração de conexão, **então** a ação desabilitada tem explicação próxima e caminho claro para configurar credenciais. Secrets continuam mascarados e não aparecem em textos de ajuda.
6. **Dado que** o streamer edita o idioma do produto, **quando** usa Configurações, **então** esse é o único controle de idioma e o painel/textos próprios do produto continuam sendo atualizados como antes.
7. **Dado que** o streamer consulta rótulos operacionais, textos auxiliares ou controles de cargo, **quando** usa layout desktop ou mobile e navegação por teclado, **então** os textos são legíveis, a identidade atual é preservada e os controles focados continuam identificáveis visualmente.
8. **Dado que** não há operações financeiras, **quando** o streamer abre a página, **então** o estado vazio explica o que será exibido e diferencia pendência/desconhecido de resultado confirmado sem afirmar que pontos foram devolvidos ou consumidos.
9. **Dadas as larguras de viewport 320 px, 768 px e 1280 px, quando** o streamer abre cada página afetada, **então** não ocorre rolagem horizontal involuntária e as ações principais permanecem acessíveis.
10. **Dados os catálogos** em inglês, espanhol e português brasileiro, **quando** a validação atualizada dos catálogos é executada, **então** todo texto próprio do produto alterado tem equivalentes válidos e nenhum erro de backend, status Twitch bruto, Secret ou detalhe da API é renderizado como texto da interface.

## Tarefas / subtarefas

- [x] Adicionar primeiro testes de regressão para versão e saúde dinâmicas sobreviverem à localização.
- [x] Adicionar testes focados para navegação dependente da configuração e rótulos seguros de estado.
- [x] Implementar as menores mudanças de apresentação e texto que façam os testes passarem.
- [x] Remover o editor de idioma duplicado no cabeçalho e manter o editor de Configurações funcional.
- [x] Ajustar tipografia, espaçamento, foco e estilos responsivos necessários às páginas auditadas.
- [x] Atualizar stories, textos de catálogo, documentação de versão e changelogs afetados em inglês e pt-BR.
- [x] Inspecionar o painel conectado/inelegível no navegador nas larguras 320/768/1280 px e verificar versão, estados e próxima ação.
- [x] Executar os gates relevantes e a suíte completa; revisão independente de QA fica registrada abaixo.
- [x] Adicionar primeiro um teste de regressão do foco por teclado, corrigir o contorno da navegação e verificar o estilo computado no navegador.
- [x] Adicionar primeiro o teste de regressão do grid da página Comandos em 320 px encontrado pelo QA e verificar Red e Green.

## Pesquisa UX

Consulte o artefato de pesquisa vinculado. As evidências vêm do pedido do streamer, inspeção no Chrome das oito páginas, resposta somente leitura de `/health` e inspeção do código. Não se afirma estudo com vários usuários ou operação Twitch ao vivo.

## Plano de gate de qualidade

**Tipo principal:** Frontend / comportamento de UI.
**Complexidade:** Média; painel estático, fluxo de idioma, navegação por estado e estilo responsivo.
**Agentes obrigatórios:** @dev implementação; @ux-design-expert revisão visual; @qa revisão independente de aceite; @devops para issue/PR no GitHub.

- [x] Testes de regressão demonstram Red antes da implementação e Green depois.
- [x] `npm run lint:web`
- [x] `npm run typecheck:web`
- [x] `npm run validate:localization`
- [x] `npm run review:static`
- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run validate:version`
- [x] `docker compose config --quiet`
- [x] `git diff --check`
- [x] Verificação manual no navegador nas três larguras em todos os idiomas de produto suportados.
- [x] Revisão independente de @qa registra nota e veredito antes do merge.

## Evidência TDD

1. **Regressão de runtime e navegação — Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/integration/panel-localization-contract.test.js` falhou em 5 testes (2 helpers de navegação por estado ausentes; 3 contratos do painel ausentes para o editor de idioma duplicado, a ordem do pré-requisito de credenciais e textos de estados vazios). Os outros 18 testes passaram. Eram falhas de comportamento/contrato, não erros de sintaxe ou ambiente.
2. **Green/refatoração:** adicionamos decisões puras de navegação, renderização dinâmica de estado depois da localização, orientação catalogada para estados vazios, um editor de idioma em Configurações e orientação de credenciais antes da conexão. A primeira execução posterior revelou duas asserções de contrato antigas que esperavam rótulos estáticos/dinâmicos no HTML; os testes foram ajustados para verificar que elementos alimentados pelo runtime não recebem localização estática e que os textos dinâmicos existem nos três catálogos. O comando focado final `npm test -- --run tests/unit/panel-navigation.test.js tests/integration/panel-localization-contract.test.js tests/unit/health-status.test.js` passou 27/27. A suíte completa `npm test` passou 644/644 em 87 arquivos.
3. **Refatoração/verificação no navegador:** reconstruímos a imagem local do bot no Compose e reiniciamos apenas o serviço do bot, preservando os volumes de banco e segredos existentes. Antes do incremento de versão, o Chrome mostrou `v0.6.0-0000000-alpha`, banco conectado, canal Twitch inelegível e ping de 197 ms. Em 320, 768 e 1280 px, `document.documentElement.scrollWidth` foi igual a `innerWidth`; a ação principal para canal inelegível sem filas levou aos detalhes da conexão. Nenhuma escrita de recompensa, chat ou OAuth foi feita.
4. **Regressão responsiva de QA — Red:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'stacks command policy content at narrow mobile widths'` falhou porque o breakpoint estreito não substituía a coluna mínima de 280 px do cartão de permissões. Isso reproduziu a falha de QA como contrato de estilo/comportamento.
5. **Correção responsiva — Green/refatoração:** adicionamos o override de uma coluna para telas móveis em `apps/web/styles.css`; o mesmo comando focado passou (1 aprovado, 17 ignorados). Reconstruímos e reiniciamos somente o serviço ativo do bot, sem apagar nem recriar volumes de banco/segredos. O Chrome confirmou que as oito páginas cabem sem overflow em 320, 768 e 1280 px (24/24 verificações). O painel em execução mostrou `v0.7.0-0000000-alpha`, banco conectado, Twitch `ineligible` localizado como “Canal não elegível” e ping de 193 ms. `npm test` passou 645/645 em 87 arquivos; lint, typecheck, localização, OpenGrep, versão, Compose e diff passaram. Nenhuma escrita na Twitch foi feita.
6. **Regressão de foco por teclado encontrada pelo QA — Red/Green:** a navegação por teclado no Chrome mostrou `:focus-visible` em um botão, mas `outline-style` computado era `none`, pois uma regra mais específica de hover/foco o desativava. Adicionamos uma asserção de regressão em `tests/integration/panel-localization-contract.test.js`; o Red falhou porque o override visível estava ausente. Separamos o estilo de hover e de foco e demos aos botões focados um contorno de destaque de 2 px; o teste focado passou (1 aprovado, 18 ignorados), e o Chrome computou `outline-style: solid` para o botão navegado pelo teclado.
7. **Verificação final de navegador/build:** verificamos as oito páginas em 320, 768 e 1280 px em pt-BR, inglês e espanhol (72/72 verificações tiveram `scrollWidth <= innerWidth`) e restauramos o idioma salvo para pt-BR. Após incluir a regressão de foco, `npm test` final passou 646/646 em 87 arquivos; lint, typecheck, lint/typecheck web, validação de localização, OpenGrep (0 achados), versão, Compose e diff passaram. A imagem/runtime Compose final continua informando `v0.7.0-0000000-alpha`; nenhuma operação de escrita na Twitch foi feita.

## Resultados QA

### Data da revisão: 2026-10-07

### Revisado por: Quinn (Test Architect)

**Gate:** FAIL — 80/100. A verificação responsiva manual confirmou versão, estado Twitch conectado/inelegível, próxima ação contextual e estados vazios de filas/operações em desktop. Porém, `document.documentElement.scrollWidth` mede 538 px na página Comandos com viewport de 320 px; portanto, AC-9 não foi atendido. As outras 23 combinações de páginas/larguras cabem na viewport. Análise estática, suíte completa (644/644), lint, typecheck, localização, versão, Compose e diff passaram. Nenhuma escrita na Twitch foi feita.

### Estado do gate

Gate: FAIL → `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`

### Data da revisão: 2026-10-07 — Revisão final

### Revisado por: Quinn (Test Architect)

### Revisão avaliada: `working-tree-sha256:884d6ba5b20faeff08430feaede5d8e3b94b9636cfc0249b3700c8b245c6f70c`

### Avaliação da qualidade do código

**PASS — 100/100 (10/10).** As mudanças do painel mantêm valores de runtime/API separados dos textos de catálogo, colocam a navegação por estado em helpers puros e renderizam conteúdo dinâmico como texto. O overflow mobile e a falha de foco por teclado encontrados pelo QA foram reproduzidos por testes de regressão antes das correções. Os 10 critérios de aceite têm cobertura; a suíte completa final passou 646/646 testes em 87 arquivos.

### Rastreabilidade dos requisitos

- **AC-1:** O contrato de localização impede que a versão da API seja sobrescrita por `data-i18n` estático; o navegador mostrou `v0.7.0-0000000-alpha` após trocar o idioma.
- **AC-2:** `tests/unit/health-status.test.js` cobre rótulos localizados; `/health` real retornou banco `connected`, Twitch `ineligible` e 201 ms. O painel exibe esses valores localizados nos três idiomas.
- **AC-3:** `tests/unit/panel-navigation.test.js` cobre ações para desconectado, elegível, inelegível e fila existente; o Chrome confirmou a orientação do canal conectado/inelegível para os detalhes da conexão.
- **AC-4:** O contrato de integração dos catálogos cobre a orientação da fila vazia; as oito páginas foram inspecionadas em cada idioma de produto.
- **AC-5:** O contrato do painel verifica a ordem do formulário e o texto do pré-requisito; o estado Chrome do canal conectado foi somente leitura. O assistente real desconectado não foi alterado para esta revisão.
- **AC-6:** Contratos confirmam um único controle de idioma; o navegador mudou pt-BR → inglês → espanhol → pt-BR e confirmou os textos localizados, restaurando o idioma original do usuário.
- **AC-7:** A verificação responsiva cobriu 24 combinações de página/largura por idioma; navegação por teclado computou `:focus-visible`, `outline-style: solid` e largura de 2 px.
- **AC-8:** O contrato do catálogo exige a explicação do estado financeiro vazio; a página exibiu o estado localizado sem operações.
- **AC-9:** Oito páginas × três larguras × três idiomas passaram (72/72, `scrollWidth <= innerWidth`).
- **AC-10:** `npm run validate:localization` passou nos cinco módulos de catálogo e locales `en`, `es` e `pt-BR`; contratos de integração exigem as chaves alteradas nos três catálogos.

### Refatoração realizada

QA não editou código. O desenvolvimento corrigiu os dois achados test-first: o grid da página Comandos empilha no breakpoint estreito, e o foco da navegação agora tem contorno de destaque visível.

### Verificação de conformidade

- Padrões de código: ✓ ESM/JSDoc, renderização segura de texto e sem mudanças de escopo em API/domínio.
- Estrutura do projeto: ✓ Mudanças permanecem em `apps/web`, testes e documentação bilíngue.
- Estratégia de testes: ✓ As duas correções de QA registraram Red/Green comportamental; `npm test` passou 646/646.
- Todos os critérios de aceite: ✓ Evidências manuais, unitárias, de integração e de validação de catálogos cobrem AC-1 a AC-10.

### Revisão de segurança

PASS. OpenGrep analisou 70 arquivos JavaScript da aplicação e encontrou 0 problemas. As mudanças não criaram rotas, alteraram OAuth, expuseram segredos nem fizeram escritas na Twitch. O Chrome registrou um erro não relacionado em `share-modal.js`, de uma extensão instalada; não foram observados erros originados pela aplicação.

### Considerações de desempenho

PASS. As mudanças do painel não adicionaram chamadas de rede, ciclos de polling ou gravações persistentes. A latência de saúde permaneceu no intervalo local somente leitura observado durante a revisão (193–201 ms).

### Arquivos modificados durante a revisão

- `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`
- `docs/stories/OPS-6/story.md`
- `docs/pt-BR/stories/OPS-6/story.md`

### Estado do gate

Gate: PASS — 100/100 → `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`
Perfil de risco: `docs/qa/assessments/OPS-6-risk-20261007.md` e equivalente pt-BR
Avaliação NFR: `docs/qa/assessments/OPS-6-nfr-20261007.md` e equivalente pt-BR

### Transição de ciclo de vida

PASS: InReview → Done.

## Lista de arquivos

- [x] `apps/web/app.js`
- [x] `apps/web/index.html`
- [x] `apps/web/styles.css`
- [x] `apps/web/panel-navigation.mjs`
- [x] `apps/web/localization/catalogs/panel/en.tsv`
- [x] `apps/web/localization/catalogs/panel/es.tsv`
- [x] `apps/web/localization/catalogs/panel/pt-BR.tsv`
- [x] `tests/unit/panel-navigation.test.js`
- [x] `tests/integration/panel-localization-contract.test.js`
- [x] `docs/stories/OPS-6/story.md` e `docs/pt-BR/stories/OPS-6/story.md`
- [x] `docs/stories/OPS-6/ux-research.md` e `docs/pt-BR/stories/OPS-6/ux-research.md`
- [x] `docs/stories.md` e `docs/pt-BR/stories.md`
- [x] Arquivos de versão, documentação bilíngue de versão e changelogs
- [x] `docs/qa/assessments/OPS-6-{risk,nfr}-20261007.md` e equivalentes pt-BR
- [x] `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`

## Histórico de mudanças

| Data | Mudança | Agente |
| --- | --- | --- |
| 2026-10-07 | Rascunho de story prioritária a partir da auditoria UX no Chrome; sem evidência de implementação registrada | @sm |
| 2026-10-07 | Implementação e testes de versão/saúde dinâmica, próximas ações contextuais, textos localizados dos estados vazios e legibilidade responsiva; QA independente pendente | @dev |
| 2026-10-07 | QA Gate FAIL — InReview → InProgress — página de comandos transborda em 320 px (AC-9) | @qa |
| 2026-10-07 | Gate QA final PASS — 100/100 — InReview → Done — layout responsivo e foco por teclado verificados nos idiomas suportados | @qa |
