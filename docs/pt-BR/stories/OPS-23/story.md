# OPS-23 — Atualização do painel em tempo real (SSE) e estado compartilhado do painel

[English](../../../stories/OPS-23/story.md)

**Status:** Ready (Pronta; GO do `@po` em 2026-10-27, ver [po-validation.md](po-validation.md)). Implementação somente após GO do `@po`, os gates de planejamento abaixo (incluindo `@ux-design-expert` com 9,0 ou mais e a nota de SSE do `@analyst`), issue criada pelo `@devops` e a sequência da OPS-15. **Issue:** #81 (criada pelo `@devops`; sem comentários em issues).
**Origem:** Defeito D-7 da bateria ao vivo ("as páginas não atualizam dinamicamente"; [live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md)); revisão do `@architect`, seções 1 e 3 e fatias S-C, S-E, S-G ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md)); decisões do proprietário de 2026-10-27 (abaixo). Pesquisa de SSE do `@analyst` (2026-10-27): [sse-research.md](../OPS-15/sse-research.md) (LACUNA fechada; os achados entram nos CAs abaixo como insumos de desenho).
**Relacionadas:** OPS-15 (migração do painel Next — esta story é dependência do cutover; sua fatia FT-23 depende do estado compartilhado entregue aqui); OPS-21 (a recuperação de sessão no cliente Next mexe no mesmo código de cliente); OPS-22 (independente).
**Coordenação necessária:** `$aiox-po`, `$aiox-architect` (modelo de eventos, fronteira de processo, proxy e autenticação), `$aiox-analyst` (nota de SSE), `$aiox-ux-design-expert` (nota ≥ 9,0/10, registrada aqui antes da implementação), `$aiox-data-engineer` (somente se for escolhida notificação de mudança no nível do banco), `$aiox-qa` independente, `$aiox-devops` (issue).

## Problema

O painel Next não atualiza sozinho e não parece uma aplicação Next (D-7):

- **Paridade perdida (VERIFICADO):** o painel vanilla atualizava tudo a cada 5 s em todas as páginas, mais os catálogos a cada 30 s. O painel Next carrega o snapshot uma vez na montagem; só Visão geral (5 s) e Operações (timer próprio de 5 s) têm polling. Filas, Nova fila, Widgets, Comandos, Configurações e Conexão nunca atualizam sozinhas; assim, resgates, comandos de chat e resultados de workers vindos de fora do painel só aparecem após recarregar à mão. As mutações do próprio operador atualizam a projeção depois.
- **Sem estado compartilhado (VERIFICADO):** a navegação usa `<a href>` simples e o `PanelProvider` é montado dentro de cada página, não em `(panel)/layout.jsx`. Cada clique é um carregamento completo do documento que descarta o estado e recarrega o snapshot; não há nada compartilhado para manter atualizado.
- **Sem canal de push (VERIFICADO):** a API não tem `text/event-stream`/WebSocket. O próprio overlay faz polling a cada 1 s e está fora do escopo.
- **Conflito de story a reconciliar (VERIFICADO):** a story da OPS-15 exige paridade da cadência de polling existente e diz que não introduz WebSocket no painel (CA 7, linha 44). Server-Sent Events não são WebSocket, mas o proprietário agora escolheu um canal de push; o `@po` deve reconciliar esse texto da OPS-15 (esta story não edita a OPS-15).

## Decisões do proprietário (2026-10-27)

1. Atualizar o painel dinamicamente com **SSE agora**, não polling: story própria com **backend novo**.
2. O polling de 5 s (aba visível) e 2 s (enquanto algo está pendente) permanece **somente como fallback se a conexão SSE cair**. Confirmado no desenho abaixo (agendador do arquiteto, seção 3): mesma cadência, usada apenas enquanto o stream estiver indisponível.
3. Duas stories separadas, ambas dependências do cutover da OPS-15: OPS-22 e esta (tempo real mais estado compartilhado do painel). A fatia de navegação e mensagens (D-3/D-4, FT-23) permanece na OPS-15 e depende do estado compartilhado entregue aqui.

## Story

Como streamer que opera o painel durante a live,
quero que toda página mostre as mudanças feitas fora do painel (resgates, comandos de chat, resultados de workers) assim que acontecerem, que eu mantenha meu lugar e o que estou digitando enquanto isso ocorre, e que tudo continue funcionando com polling comum se a conexão ao vivo cair,
para que eu possa confiar no que a tela mostra sem recarregá-la.

## Escopo

**Dentro (três fatias):**

- Fatia 1 — backend SSE: um stream de eventos autenticado do painel na API que anuncia mudanças de estado.
- Fatia 2 — estado compartilhado do painel: subir `PanelProvider`/`PanelShell` para `app/(panel)/layout.jsx`, `activePage` por `usePathname()`, `<Link>` na barra lateral e nos links internos, grupo de rotas do overlay intocado.
- Fatia 3 — atualização ao vivo no cliente: consumidor SSE, ressincronização, fallback por polling e remoção dos timers privados.

**Fora do escopo:**

- A mensagem, o redirecionamento e o foco após criar ou excluir uma fila (fatia FT-23 da OPS-15); esta story só entrega o provider compartilhado de que ela precisa.
- Recuperação financeira e exclusão de fila (OPS-22).
- WebSocket, nova dependência de busca de dados (SWR/TanStack Query) e qualquer mudança no polling de 1 s do overlay.
- Novas funcionalidades visíveis além do que o `@ux-design-expert` aprovar no plano (por exemplo, um indicador "ao vivo/atualizado há n s" é decisão de UX, não um dado).
- Comportamento do painel vanilla (mantém seu polling até a remoção autorizada), bump de versão, commit, push, release, cutover.

## Critérios de aceite

As classes de evidência são separadas: fixtures/mocks, testes unitários, PostgreSQL isolado, navegador real pelo servidor Next real, Docker/Compose. Todo comportamento começa com um teste que falha (Red primeiro). Metas numéricas, fixadas pelo `@sm` a partir da nota de SSE e da revisão do arquiteto antes da FT-29 (todos os valores APROVADOS pelo proprietário em 2026-10-27, decisão OD-23-2; `@architect`/`@qa` ainda confirmam que são testáveis): keep-alive de **15 s** (abaixo do timeout ocioso de 30 s do proxy; nota de SSE, Q2); janela de agregação de **100 a 250 ms** (nota de SSE, Q4); **caminho ao vivo**: uma mudança externa fica visível em toda página do painel em até **2 s** (p95) após o commit [APROVADO, OD-23-2; base: a nota não dá número de ponta a ponta, 2 s é a janela de agregação mais um refetch single-flight com folga]; **caminho de fallback**: em até **6 s** (vinculante hoje); **janela de polling de 2 s** de **60 s**, depois 5 s [APROVADO, OD-23-2; base: "e.g. 60 s" na revisão do arquiteto, seção 3].

### Fatia 1 — Backend SSE

1. **Dado** um operador com sessão local válida, **quando** o painel abre o stream de eventos, **então** a API responde `text/event-stream` e mantém a conexão aberta; **dado** ausência de sessão, Host inválido ou Origin inválido, **então** é recusado com o mesmo status e a mesma convenção de `code` enumerado das outras rotas do painel (OPS-21).
2. **Dado** uma mudança de estado confirmada por qualquer produtor (mutação do painel, comando de chat, resgate EventSub, worker de outbox, reconciliação), **quando** ela é confirmada, **então** o stream emite uma notificação de mudança para o tópico afetado (filas, entradas, operações, saúde/integração, configurações/widgets conforme o desenho listar). [AUTO-DECISION] as notificações são sinais de invalidação que carregam tópico e versão/hora, mas nenhum corpo de chat, corpo de resgate, UID, id/login de espectador, token ou cabeçalho → o cliente rebusca pelos endpoints sanitizados existentes (motivo: uma só fonte de verdade para os DTOs e para as regras de observabilidade e privacidade do projeto; o `@architect` confirma).
3. **Dado** produtores que podem rodar fora do processo da API, **quando** o desenho for fechado, **então** `@architect`/`@data-engineer` registram como uma notificação de um worker chega ao stream (mesmo processo ou mecanismo entre processos); o mecanismo escolhido é provado em PostgreSQL isolado se o banco estiver envolvido.
4. **Dado** conexões ociosas, **quando** o tempo passa, **então** o servidor envia quadros keep-alive em intervalo menor que o timeout ocioso de 30 s do proxy do Next (a nota sugere 15 s) para que o stream não seja cortado; **dado** desconexão do cliente ou desligamento da API, **então** o servidor libera a conexão e o desligamento fecha todos os streams na ordem da composição de runtime (testado).
5. **Dado** muitas abas abertas ou reconexões, **quando** o limite de conexões é atingido, **então** o comportamento é limitado e definido (limite, código de recusa, sem crescimento de recursos), e um chamador não autenticado não consegue aumentar o estado do servidor.
6. **Dado** que o stream passa pelo rewrite/proxy do Next e pelo stack Compose, **quando** um navegador o abre, **então** os eventos chegam sem buffer e sem compressão (a resposta leva `Cache-Control: no-cache, no-transform`) em navegador real pelo servidor Next real, em desenvolvimento e no servidor customizado de produção, inclusive com o stream ocioso por mais de 30 s; um teste unitário não pode alegar isso.
7. **Dado** logs e métricas do stream, **quando** eventos são produzidos, **então** contêm no máximo o tópico, contagens e o padrão da rota, nunca chaves, cookies, corpos, tokens ou segredos.

### Fatia 2 — Estado compartilhado do painel

8. **Dado** que o operador navega pela barra lateral ou pelos links internos, **quando** a página muda, **então** o documento não é recarregado (um marcador em `window` sobrevive; transições de cliente do `<Link>`) e o estado do provider, incluindo a conexão de stream/polling, persiste.
9. **Dado** uma página do painel, **quando** ela renderiza, **então** renderiza apenas seu conteúdo dentro do layout compartilhado, `activePage` vem de `usePathname()` e o carregamento do catálogo de fallback sai de cada `page.jsx` para o layout.
10. **Dado** o grupo de rotas do overlay, **quando** é requisitado, **então** não herda o provider do painel (o layout separado `(overlay)` permanece).
11. **Dado** os E2E existentes que assumiam recarga completa na navegação, **quando** esta fatia entrar, **então** são atualizados explicitamente para o novo comportamento, nunca afrouxados.

### Fatia 3 — Atualização ao vivo no cliente e fallback

12. **Dado** uma notificação de mudança, **quando** o provider a recebe, **então** atualiza os dados afetados com uma requisição single-flight (o `refreshInFlight` existente) e agrega rajadas; uma mudança externa (nova entrada de fila, resgate, resultado de worker) aparece em toda página do painel sem recarregar, em até 2 s (p95) após o commit no caminho ao vivo [APROVADO, OD-23-2, proprietário, 2026-10-27].
13. **Dado** que o stream conecta ou reconecta, **quando** é estabelecido, **então** o provider faz uma ressincronização completa para que notificações perdidas não deixem dados desatualizados; um identificador novo da instância do servidor significa recarga completa.
14. **Dado** que a conexão SSE está indisponível ou cai, **quando** o provider detecta, **então** recorre ao polling: 5 s com a aba visível, 2 s por uma janela limitada de **60 s** [APROVADO, OD-23-2, proprietário, 2026-10-27; revisão do arquiteto, seção 3] enquanto existir estado pendente (`pending_create`, `deleting`, `pending_*` ou operações não resolvidas), depois 5 s; falhas consecutivas aumentam a espera 5 → 10 → 30 s e voltam a 5 s no sucesso; e volta ao SSE automaticamente (com a ressincronização do CA 13) quando o stream retorna. No fallback uma mudança externa aparece em até 6 s.
15. **Dado** uma aba oculta que fica visível ou recebe foco, **quando** isso ocorre, **então** roda uma atualização imediata.
16. **Dado** que uma mutação está `saving` ou um diálogo de confirmação está aberto, **quando** chegam atualizações, **então** a atualização é pausada ou adiada; **dado** um campo com foco ou um formulário em rascunho, **então** uma atualização nunca sobrescreve o rascunho, move o foco ou reinicia a rolagem (formulários mantêm estado local de rascunho; projeções alimentam só as partes de leitura).
17. **Dado** que Visão geral e Operações têm timers próprios hoje, **quando** esta fatia entrar, **então** ambas usam o canal compartilhado, nenhum timer privado permanece e não há requisições duplicadas.
18. **Dado** a recuperação de sessão da OPS-21 (uma reinicialização transparente), **quando** a API reinicia, **então** o laço de reconexão do cliente (um `EventSource` fecha de vez em qualquer status diferente de 200) espera com backoff, renova a sessão, reabre o stream e ressincroniza, e não entra em laço diante de sessão recusada.
19. **Dado** que a UX aprova, **quando** o plano é implementado, **então** qualquer indicador ao vivo/fallback, texto "atualizado há n s" e política de anúncio para leitor de tela seguem o plano aprovado, e as atualizações ao vivo não inundam a tecnologia assistiva nem roubam o foco.

## Dependências

- **Depende de:** GO do `@po` e issue; nota de SSE do `@analyst`; desenho do `@architect`; plano de UX ≥ 9,0; para a fatia 1, uma decisão sobre como eventos de workers chegam ao processo da API.
- **É dependência de:** cutover da OPS-15; FT-23 (precisa da fatia 2); a reconciliação de resultados pendentes (mensagens "pendente → sincronizado"), entregue com a FT-23 sobre este estado.
- **Choque de conjunto de escrita:** as fatias 2 e 3 tocam `panel-shell.jsx`, `panel-provider.jsx`, todas as `page.jsx`, `panel-root.jsx`, `operations-page-content.jsx` e `app/(panel)/layout.jsx`, a mesma área do polimento de páginas da OPS-15 (FT-01); não rodar em paralelo — o `@architect` fixa a ordem (o provider compartilhado deve entrar antes ou junto do polimento, não por baixo dele). A fatia 3 da OPS-21 muda o cliente de API do Next; coordenar.

## Riscos

- **Buffer/compressão no proxy** do rewrite do Next ou do Docker/Compose quebra o stream (CA 6). Só um navegador real pelo servidor real prova.
- **Limite de conexões do navegador:** HTTP/1.1 permite 6 conexões por origem; várias abas mais as requisições normais podem travar o painel (CA 5); a mitigação é um stream por aba e, se preciso depois, um stream compartilhado entre abas ([sse-research.md](../OPS-15/sse-research.md), Q2).
- **Eventos entre processos:** se os workers rodam separados da API, o caminho de notificação é infraestrutura nova (CA 3).
- **Perda de rascunho/roubo de foco** ao atualizar (CA 16); requisições duplicadas se um timer privado sobreviver (CA 17).
- **Laços de reconexão ruins** após reinício da API ou sessão revogada (CA 18).
- **Conflito de texto com a OPS-15** (CA 7, "sem WebSocket no painel"): exige decisão do `@po` registrada no próprio change log da OPS-15.
- **E2E obsoletos** que dependiam de recarga completa (CA 11).
- **Autenticação de um `EventSource`:** ele não consegue adicionar cabeçalhos próprios; o desenho deve se apoiar no cookie de sessão de mesma origem e nas checagens de Host/Origin (conforme a nota de SSE: GET de mesma origem, cookie enviado, sem CSRF para um GET somente de leitura; confirmar `Origin`/`Host` em navegador real).

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 5, integração 3, infraestrutura 3, conhecimento 4, risco 3 = **18 → COMPLEXA (GG)**. Prioridade **P1** (regressão de paridade e dependência do cutover). Dificuldade **GG** no total; fatia 1 **G**, fatia 2 **M**, fatia 3 **M**.

## Valor de negócio

O operador vê resgates, comandos e resultados de workers à medida que acontecem, sem recarregar, e mantém o contexto ao navegar; o painel Next deixa de ser pior que o vanilla no ponto mais visível (D-7).

## Plano de testes (teste primeiro)

1. **Unitário (Vitest):** rota SSE (cabeçalhos, recusa de sessão/Host/Origin, keep-alive, liberação na desconexão, limite de conexões) sobre um listener HTTP real, já que `inject` não faz streaming (CAs 1, 4, 5); emissão de eventos por produtor (CA 2); agendador do cliente com timers falsos e `EventSource` falso (agregação, single-flight, ressincronização, cadência de fallback 5 s / janela de 2 s, backoff, pausa durante salvamento, atualização por visibilidade; CAs 12-16).
2. **PostgreSQL (descartável, migrations reais):** somente se for escolhida notificação no nível do banco (CA 3).
3. **E2E somente de navegador (Chromium, fixtures, pelo servidor Next real):** entrada externa aparece sem recarregar (CA 12); stream bloqueado → o fallback de polling mostra em até 6 s e volta ao SSE (CA 14); navegação pela barra lateral mantém um marcador em `window` (CA 8); digitar em Configurações não é sobrescrito por uma atualização (CA 16); eventos não ficam em buffer pelo proxy (CA 6); reconexão do stream após reinício da API (CA 18).
4. **Docker/Compose:** caminho do proxy verificado com o stack real, registrado como classe separada.
5. **Gates antes de fechar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (somente OpenGrep). O `@qa` executa os gates finais independentes e emite o veredito antes de o `@devops` commitar.

## Gates de planejamento antes da implementação

- [x] Revisão e opções de desenho do `@architect` ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md), 2026-10-26; SSE listado como fatia opcional S-G, agora promovida pelo proprietário).
- [x] Decisões do proprietário registradas (2026-10-27).
- [x] Nota de SSE do `@analyst`: [sse-research.md](../OPS-15/sse-research.md) (2026-10-27). Achados usados: os rewrites do Next 16.4.1 fazem streaming, mas têm timeout ocioso de proxy de 30 s, então o heartbeat deve ser menor que 30 s (a nota sugere 15 s); o gzip faz buffer do SSE a menos que a resposta tenha `Cache-Control: no-transform`; HTTP/1.1 permite 6 conexões por origem; um `EventSource` fecha de vez em qualquer status diferente de 200, então o cliente precisa de laço próprio de reconexão que renove `/api/session`; o fallback por polling mais lento (15-30 s) da nota difere do 5 s / 2 s do proprietário, e **a decisão do proprietário prevalece**. As verificações de ambiente que ela lista (seis itens) ficam para o `@qa`.
- [x] Validação do `@po` (10 pontos) e GO (9,0/10, 2026-10-27); a reconciliação do texto da OPS-15 (OD-23-1) foi decidida pelo proprietário e aplicada em 2026-10-27 (linha 44 e CA 7 da OPS-15; ver o Change Log), então esta condição de fechamento está cumprida.
- [ ] Desenho do `@architect`: modelo de eventos, fronteira de processo, proxy/autenticação, limite de conexões, metas de latência, janela de fallback, ordem em relação à FT-01 e à fatia 3 da OPS-21.
- [ ] Plano e revisão do `@ux-design-expert`, **nota ≥ 9,0/10**, registrados nesta story (revisão estática distinta de validação em navegador, visual e tecnologia assistiva): indicador ao vivo/fallback, "atualizado há n s", anúncios, regras de foco.
- [ ] `@data-engineer` somente se o desenho acrescentar um mecanismo de banco.
- [ ] Plano de testes do `@qa` (separação de evidências, navegador real pelo servidor real).
- [x] O `@devops` cria a issue no GitHub: a issue-mãe #81 existe (issue-mãe desta story; dependência nativa do cutover da OPS-15; fatias como sub-issues sob demanda); sem comentários em issues.

## Decisões do proprietário pendentes

- **OD-23-1 (DECIDIDA e APLICADA, proprietário, 2026-10-27):** o texto da OPS-15 que reconcilia o CA 7 com esta story (texto em [po-validation.md](po-validation.md)) foi aprovado e aplicado pelo `@po` na linha 44 e no CA 7 da OPS-15: atualização em tempo real por SSE entregue por esta story, polling de 5 s / 2 s apenas como fallback dela, sem WebSocket do painel.
- **OD-23-2 (DECIDIDA, proprietário, 2026-10-27):** aprovada como escrita — caminho ao vivo p95 ≤ 2 s; polling de reserva de 2 s por 60 s e depois 5 s; keep-alive de 15 s; agregação de 100 a 250 ms. Os marcadores [PROPOSTA] foram removidos da introdução, do CA 12 e do CA 14. Pergunta original (histórico): confirmar as metas numéricas marcadas [PROPOSTA] em "Critérios de aceite" (caminho ao vivo em até 2 s p95, janela de polling de 2 s de 60 s) ou informar outros valores. Deve ser fechada antes da FT-29 (correção exigida 1 da validação do `@po`). `@architect`/`@qa` confirmam que são testáveis.

## Definição de pronto

- CAs 1-19 com evidência Red-first registrada por classe; a evidência de navegador e de proxy no Compose é real, não inferida.
- Nota de UX registrada; todos os quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR.
- Texto da OPS-15 reconciliado pelo `@po`.

## Validação de rascunho do SM (story-draft-checklist, 2026-10-27)

1. Objetivo e contexto: claros (D-7, decisões do proprietário, fallback confirmado). PASSA.
2. Orientação técnica: arquivos, comportamento atual e restrições nomeados; o modelo de eventos deixado deliberadamente ao `@architect`. PASSA, com a nota de SSE pendente.
3. Referências: seções específicas da revisão do arquiteto; `sse-research.md` referenciado mas não criado. PASSA.
4. Autossuficiência: casos de borda (reconexão, rascunhos, reinício, limites) declarados. PASSA.
5. Testes: classes separadas; prova em navegador real exigida para o proxy. PASSA.
6. Análise estática registrada. PASSA.
- Resultado: pronta para o `@po`. Itens além das decisões do proprietário (evento como sinal de invalidação, limite de conexões, keep-alive) estão marcados como insumos de desenho para o `@architect`; nada foi inventado como definitivo.

## File List

- `docs/stories/OPS-23/story.md` (novo)
- `docs/pt-BR/stories/OPS-23/story.md` (novo)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

## Change Log

- 2026-10-27 — `@sm` (River): story redigida a partir do D-7, da revisão do `@architect` e das decisões do proprietário de 2026-10-27 (SSE agora, polling apenas como fallback). Status Rascunho.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 pontos = 9,0/10, **GO**. Issue #81 registrada. Status Rascunho → Ready (Pronta). A implementação ainda aguarda o desenho do `@architect` e o plano do `@ux-design-expert` (≥ 9,0); reconciliação do texto do CA 7 da OPS-15 proposta ao proprietário em [po-validation.md](po-validation.md).
- 2026-10-27 — `@sm` (River): metas numéricas fixadas no texto antes da FT-29 (keep-alive 15 s, agregação 100-250 ms, caminho ao vivo 2 s p95 [PROPOSTA], fallback 6 s, janela de polling de 2 s de 60 s [PROPOSTA]); CA 12 e CA 14 completados com esses valores; caixas dos gates de planejamento do GO do `@po` e da issue #81 marcadas; OD-23-1 e OD-23-2 registradas como decisões do proprietário pendentes. Nenhum título ou escopo alterado.
- 2026-10-27 — `@po` (Pax): OD-23-1 decidida pelo proprietário e aplicada — a linha 44 e o CA 7 (linha 105) da OPS-15 agora dizem atualização em tempo real por SSE entregue por esta story, polling de 5 s / 2 s só como fallback dela, sem WebSocket no painel (texto adaptado à decisão do proprietário: sem contrato de "polling existente"). A condição de fechamento "texto da OPS-15 reconciliado" está cumprida. Status continua Ready (Pronta; GO 9,0/10). Seguem pendentes: OD-23-2 (metas numéricas, antes da FT-29) e OD-24-3 (início da FT-27). A caixa do gate (linha 117) e o item da OD-23-1 (linha 126) ainda dizem "pendente" e são atualizados pelo `@sm`. Ver [po-validation.md](po-validation.md).
- 2026-10-27 — `@po` (Pax): OD-23-2 APROVADA pelo proprietário (caminho ao vivo p95 ≤ 2 s; polling de reserva de 2 s por 60 s e depois 5 s; keep-alive de 15 s; agregação de 100-250 ms). Removidos os marcadores [PROPOSTA] da introdução de "Critérios de aceite", do CA 12 e do CA 14 (agora [APROVADO, OD-23-2]); o item da OD-23-2 em "Decisões do proprietário pendentes" agora registra a decisão. A pré-condição da FT-29 "OD-23-2 fechada" está cumprida; `@architect`/`@qa` ainda confirmam a testabilidade. Nenhum título, escopo ou status alterado (Ready). A OD-24-3 (a OPS-23 espera apenas a TS-0 e a TS-2) também foi decidida pelo proprietário no mesmo dia e registrada na OPS-24. Seguem pendentes: os gates de planejamento (desenho do `@architect`, `@ux-design-expert` ≥ 9,0, plano de testes do `@qa`).
