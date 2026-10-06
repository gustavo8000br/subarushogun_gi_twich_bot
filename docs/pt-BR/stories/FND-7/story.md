# Story FND-7: Widgets configuráveis para overlay do OBS

[English](../../../stories/FND-7/story.md)

**Complexidade:** COMPLEX (19/25; reavaliada em 2026-10-06)
**Executor:** @dev
**Quality gate:** @architect
**Ferramentas do quality gate:** Vitest, testes de rotas Fastify, testes de integração de migrations PostgreSQL reais, E2E de navegador, ESLint, verificação TypeScript, OpenGrep, validação Prisma, validação do Docker Compose e `git diff --check`.
**Prioridade:** P0 para dados, estilo, ciclo de vida dos links e segurança; P1 para guias bilíngues.
**Issue:** [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)

## Status

**Done — QA independente PASS 9,2/10.** Persistência PostgreSQL, ciclo de capability, projeção de fontes, API protegida, editor do painel, renderer local e guias operacionais bilíngues foram implementados. A validação real do CEF do OBS passou no Ubuntu 24.04 com OBS Studio 32.2.2 / CEF 127.0.6533.120. O E2E em Compose isolado verificou oito fontes ativas em dez rodadas, 80 atualizações com máximo de 905 ms, queda/retorno do bot, retenção/recuperação do dado stale, unload/reload da Browser Source e rotação da capability. Após confiar no certificado local, o streamer/operador informou que a criação do widget funciona; a aceitação no Chrome também confirmou criar/editar, cópia única, regeneração, revogação, exclusão e seleção de fila com fixture temporária local do PostgreSQL. O canal Twitch não foi conectado; não alegamos sincronização nem escritas Twitch reais. Os gates completos do repositório passaram. FND-0 permanece como baseline histórico do MVP; FND-7 é uma extensão pós-MVP solicitada explicitamente.

## História do usuário

Como streamer que usa o bot local de filas de Genshin Impact, quero widgets independentes no OBS com dados e estilos escolhidos separadamente, para mostrar na transmissão somente as informações selecionadas, com aparência consistente.

## Escopo e dependências obrigatórias

OBS e bot rodam no mesmo computador. Cada widget corresponde a uma URL local de OBS Browser Source e mostra exatamente um campo atômico ou texto fixo:

- Rótulo atual da conta de Genshin.
- Nome, estado aberta/fechada ou quantidade aguardando de uma fila selecionada (um atributo por widget).
- Nome de exibição da pessoa chamada ou sua posição original na espera no momento da chamada (snapshot persistido na auditoria da transição, não a coluna de posição da espera, que é limpa ao chamar).
- Nome de exibição da pessoa em atendimento.
- Texto personalizado fixo.

FND-5 e FND-6 estão concluídas (mergeadas nas PRs #16 e #22). Antes da implementação, verificar no código atual todas as projeções de origem e os recursos protegidos de painel/segurança; não reduzir o catálogo de fontes. A @aiox-ux-design-expert precisa aprovar jornada, padrões, estados e acessibilidade antes de qualquer código de UI. A confiança da CA HTTPS local no CEF nativo do OBS precisa ser verificada em cada combinação SO/OBS declarada como suportada antes da implementação do renderer ou de alegações de compatibilidade; manter validação do certificado, sem fallback HTTP.

## Critérios de aceite

1. **Criar widget e escolher fonte:** pessoas autenticadas no painel podem criar, editar e excluir widgets independentes e escolher um único campo atômico ou texto fixo. Cada atributo de fila exige a seleção de uma fila. A operação não altera filas, conta ou estado de viewers.
2. **Emitir link independente:** a resposta autenticada de criação/regeneração retorna a URL local com segredo uma única vez, para cópia imediata. Leituras posteriores não recuperam o segredo. A projeção OBS não o retorna. Somente o hash criptográfico é persistido.
3. **Personalizar aparência:** por widget, configurar cores de texto/fundo, opacidade, pilhas de fontes locais permitidas, tamanho, peso, alinhamento, contorno/sombra, dimensões, margens, overflow e texto fallback. Validar no servidor e cliente. Texto fixo/fallback aceita até 240 pontos de código Unicode, com contagem idêntica nos dois lados.
4. **Estados de disponibilidade:** fonte dinâmica vazia exibe fallback configurado. Falha transitória inicial sem valor anterior exibe estado neutro indisponível. Falha transitória depois de um valor válido mantém o último valor com marcador de desatualizado e tenta novamente. Capability inválida/revogada (401/403) ou widget desconhecido/excluído (404) limpa o conteúdo exibido.
5. **Projeção mínima:** retornar somente o campo selecionado e o contexto de fila estritamente necessário. Nunca projetar UID, credenciais Twitch, sessões, dados financeiros, segredo, outros widgets ou outras filas. Usar os serviços/projeções compartilhados; capability OBS não altera estado.
6. **Revogar, regenerar e excluir:** revogação invalida o token antigo sem emitir link substituto. Regeneração invalida o token anterior e retorna uma URL nova uma única vez. Exclusão do widget e invalidação da capability são atômicas; após a exclusão confirmar, nenhuma leitura concorrente com token antigo retorna dados. Excluir não emite URL nova.
7. **SLA de atualização:** com oito widgets dinâmicos mistos abertos, cada uma de dez mudanças consecutivas precisa chegar ao DOM em até dois segundos, medidos do commit à renderização, com polling nominal de um segundo. Registrar ambiente e duração observada.
8. **OBS e guias:** Browser Source no mesmo computador renderiza fundo transparente e sem barra de rolagem nas dimensões configuradas. Definir Page Permissions como None; o app nunca lê bindings do OBS nem o controla. Os guias explicam configuração, preview, cópia, atualização, revogação/regeneração e somente passos de confiança de certificado verificados na versão de OBS/SO testada. Nunca contornar validação HTTPS nem usar HTTP como fallback. Declarar somente plataformas realmente testadas.
9. Para cada versão de SO/OBS declarada como suportada, o CEF nativo carrega a mesma URL HTTPS local sem ignorar certificado. Medir o alvo de dois segundos em páginas Browser Source ativas/habilitadas; após unload/reload da fonte, ela busca o valor atual.

## Limites de estilo

Cores `#RRGGBB`; opacidade 0–100%; pilhas permitidas: `system-ui`, `Arial/sans-serif`, `Verdana/sans-serif`, `Georgia/serif`, `Courier New/monospace`; tamanho inteiro 8–128px; pesos 300/400/500/600/700/800/900; alinhamento left/center/right; efeito none/outline/shadow; contorno 1–8px; blur de sombra 0–32px e deslocamentos −32..32px; largura auto ou 1–3840px; altura auto ou 1–2160px; margens por lado 0–256px; overflow wrap/clip/ellipsis. Sem HTML/CSS/JS arbitrário ou assets remotos.

## Segurança e arquitetura

Usar um segredo aleatório no fragmento da URL e header Authorization nas leituras same-origin. O fragmento evita enviar segredo na requisição HTTP, mas permanece visível nas configurações do OBS e em URLs copiadas e deve ser tratado como credencial. Nunca colocar segredo em path/query HTTP, logs, cache ou referrer; nunca persistir o token bruto. Capability só leitura e limitada ao widget. Restringir host do overlay ao loopback e retornar apenas a projeção específica do widget pelos serviços existentes.

Configure Page Permissions do OBS Browser Source como None; o widget não lê dados ou aciona controles do OBS. Manter HTTPS local e validar a confiança da CA no CEF nativo, sem HTTP ou bypass.

## Ordem de implementação

Seguir `spec/plan.json` e `plan/implementation.yaml`: verificar projeções e fundamentos de segurança entregues por FND-5/FND-6, concluir os gates UX e validar confiança HTTPS no OBS nativo; então seguir test-first nas regras de campo/estilo, modelo e migrations PostgreSQL, repository/serviço, rotas protegidas, renderer e painel; terminar com verificações reais de banco e E2E nativo do OBS. Cada incremento segue Red → Green → Refactor. Os planos JSON/YAML possuem 24 subtarefas alinhadas com serviço, arquivos, verificação e dependências explícitas. A meta de dois segundos vale para oito páginas Browser Source ativas/habilitadas; se o OBS descarregar uma fonte oculta, ela deverá buscar o valor atual ao recarregar.

## Tarefas / Subtarefas

Os IDs e o significado correspondem aos planos JSON/YAML canônicos em inglês.

- [x] 0. Gates de prontidão
  - [x] 0.1 Confirmar conclusão de FND-5/FND-6 e mapear cada campo dinâmico às projeções entregues e aos serviços protegidos de painel/segurança; bloquear a story se alguma dependência estiver incompleta. Mapa no código registrado em `validation.md`.
  - [x] 0.2 Concluir revisão UX e registrar fontes permitidas, aparência padrão, preview, estados vazio/desatualizado/indisponível, foco/rótulos acessíveis e consistência com o painel antes de codificar UI. Consulte `ux-refinement.md` e o par em inglês.
  - [x] 0.3 Escrever e validar exemplos comuns de contagem de pontos de código Unicode para texto fixo/fallback de 240 caracteres.
- [x] 1. Base de persistência de widget
  - [x] 1.1 Escrever testes de contrato de migration PostgreSQL real para criação/edição/exclusão, hash de capability, escopo do widget, rotação, revogação e persistência após reinício.
  - [x] 1.2 Adicionar modelo Prisma e migration SQL depois de os testes de banco falharem pelo comportamento ausente.
- [x] 2. Política de campo e capability
  - [x] 2.1 Escrever testes unitários de escopo do campo, seleção da fila, estados fallback, Unicode 240, allowlist de estilo e entrada maliciosa.
  - [x] 2.2 Implementar validação pura de campos/estilo somente depois do Red comportamental.
  - [x] 2.3 Escrever testes de geração aleatória de token, fronteira de persistência apenas do hash, escopo de widget único e rotação/revogação.
  - [x] 2.4 Implementar emissão/verificação/revogação da capability e repetir testes após Refactor.
- [x] 2B. Serviço/repositório de widget
  - [x] 2B.1 Escrever testes PostgreSQL/serviço para criar/editar/excluir, emitir/verificar hash, link de uso único, rotacionar/revogar e atomicidade entre leitura concorrente e exclusão.
  - [x] 2B.2 Implementar repository e serviço de aplicação de persistência/ciclo de capability após Red.
- [x] 3. API de gestão e leitura OBS
  - [x] 3.1 Escrever contratos HTTP de sessão/CSRF na gestão, Host/Origin, escopo do token, capability rejeitada/revogada, projeção exata, headers de cache/referrer e ausência de mutações.
  - [x] 3.2 Implementar rotas de gestão de widget e leitura somente por token por meio de projeções compartilhadas de domínio/aplicação.
- [x] 4. Página Browser Source
  - [x] 4.0 Verificar a confiança da CA HTTPS no CEF nativo do OBS. Ubuntu 24.04, OBS Studio 32.2.2, CEF 127.0.6533.120; validação do certificado permaneceu habilitada.
  - [x] 4.1 Executar E2E contra Compose/PostgreSQL isolados com oito fontes ativas e dez rodadas (80 medições de commit até DOM); todas atenderam ao limite de dois segundos. Testes unitários do renderer cobrem texto seguro, transparência, estilo, fallback, stale/recuperação e limpeza de capability inválida.
  - [x] 4.2 Implementar renderer local de widget único e polling sem dependências/assets remotos.
- [x] 5. Painel
  - [x] 5.1 Concluir revisão UX de menu de fontes, aparência inicial, rótulos de estado vazio/desatualizado, preview, identificação de widgets duplicados e orientação de link de uso único antes de codificar UI do painel.
  - [x] 5.2 Completar aceitação no navegador para criar/editar/excluir widget, selecionar fonte/fila, preview, validação, cópia, revogação e regeneração. A aceitação no Chrome passou; a seleção usou uma fixture local isolada do PostgreSQL porque nenhum canal Twitch estava conectado. Isso valida a seleção local, não a sincronização Twitch.
  - [x] 5.3 Implementar controles de gestão de overlay no painel local existente; as evidências de aceitação estão registradas em 5.2.
- [x] 6. Verificação OBS e documentação
  - [x] 6.1 Verificar criação/edição/regeneração/revogação/exclusão e cópia única no painel/banco local, seleção de fila com fixture descartável e propagação no E2E de 80 atualizações. Os dados temporários e o widget foram removidos após a verificação.
  - [x] 6.2 Completar verificações nativas no OBS Browser Source para dimensões, transparência, estado ao vivo, falha/recuperação, unload/reload e rotação do link. O E2E autenticado rodou no OBS Studio 32.2.2 / CEF 127.0.6533.120 com validação do certificado habilitada.
  - [x] 6.3 Sincronizar evidências de integração e índice de stories nos dois idiomas.
  - [x] 6.4 Publicar instruções OBS equivalentes no par de READMEs e validar o contrato documental.
  - [x] 6.5 Reexecutar os gates completos e registrar resultados. O QA independente AIOX passou com 9,2/10.
## Testes e limite de status

Os gates finais de engenharia passaram: lint, typecheck, 472 testes / 69 arquivos, OpenGrep (0/56 arquivos JavaScript da aplicação), versão `v0.5.0-0000000-alpha`, validação Prisma, configuração Compose, `npm audit --omit=dev --audit-level=low` (0 vulnerabilidades) e diff. O E2E nativo do OBS também passou em 80 atualizações (máximo 905 ms), recuperação após parar/reiniciar o bot, exibição/recuperação do estado stale, unload/reload da Browser Source e rotação dos links antigo/novo no Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120. O streamer/operador informou que a criação do widget funciona após confiar no certificado local. Nenhum canal Twitch autorizado foi conectado; sincronização ao vivo não foi verificada. O QA independente AIOX passou com 9,2/10.

## Lista de arquivos

Atualização em 2026-10-06: schema e migration PostgreSQL, política/serviço/projeção/repositório/rotas, projeções seguras, renderer, formulário/página de widgets, navegação, testes Vitest unitários/PostgreSQL, harness E2E OBS autenticado, helpers de autenticação WebSocket/timeouts/porta Compose, script npm, par dos READMEs, spec/story/validação/UX, plano, integrações, índices, documentação de versão e changelogs. QA independente PASS 9,2/10 registrado abaixo.

## Histórico de alterações

- 2026-10-05 — Draft criado após Spec Pipeline COMPLEX, elicitação, pesquisa e revisões PM/PO/Arquitetura/QA aprovadas.
- 2026-10-06 — Pesquisa oficial OBS/CEF, status das dependências, mapa de prontidão, gates HTTPS/Page Permissions, seleção determinística de chamadas, crítica QA v4 e handoff UX bilíngue revisados; implementação iniciada nos incrementos seguintes.
- 2026-10-06 — Implementados backend, renderer e página de widgets com TDD; OBS CEF nativo e 80 atualizações foram validados em Compose isolado. Story concluída após seleção de fila local, falha/recuperação OBS, gates de qualidade e QA independente PASS 9,2/10.

## Registro do agente de desenvolvimento

### Modelo do agente

Implementação JavaScript ESM com Prisma/PostgreSQL e UI vanilla do painel, seguindo a separação de domínio, persistência, HTTP e renderer.

### Referências de depuração

`docs/stories/FND-7/validation.md` registra resultados do Chrome, OBS/CEF e harness E2E.

### Notas de implementação

Renderer, API, persistência e página de gestão implementados e validados. Story Done, QA independente PASS 9,2/10.

## Resultados de QA

### Data da revisão: 2026-10-06

### Revisado por: Quinn (Arquiteto de Testes)

### Revisão analisada

`HEAD 27effa73a362a1eb23aa8a3ef8e1e06e43c9d313` mais o digest da worktree `sha256:ddc90ffc5eef8c5c5cff96d43ee1a3a80eb8e46101757a93cbd46e46a037fb4e`, imediatamente antes desta atualização da seção de QA (worktree de implementação ainda sem commit).

### Veredito e score

**PASS — 9,2/10 (92/100).** As evidências antes pendentes de OBS nativo e aceitação do operador estão registradas, o contrato documental bilíngue corresponde ao estado entregue e a suíte completa de qualidade passou. FND-7 atende ao limite solicitado de 9/10 para conclusão. Nenhuma operação real na Twitch foi testada ou é alegada.

### Evidências

- `npm test` — 472 testes passaram em 69 arquivos, incluindo o contrato documental bilíngue corrigido da FND-7 (5/5).
- `npm run lint`, `npm run typecheck`, `npm run review:static`, `npm run validate:version`, validação do schema Prisma, configuração Compose isolada, `npm audit --omit=dev --audit-level=low` e `git diff --check` passaram. OpenGrep informou 0 achados em 56 arquivos JavaScript da aplicação; a auditoria informou 0 vulnerabilidades.
- O E2E autenticado de OBS nativo registrado no Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120 cobre oito fontes ativas e 80 atualizações commit→DOM (máximo de 905 ms), parada/reinício do bot, retenção/recuperação stale, unload/reload da Browser Source e rotação de capability antiga/nova. As evidências da execução e o comando exato foram inspecionados; este QA não repetiu o E2E nativo para manter o OBS/Compose ativo disponível ao operador.
- O operador relatou diretamente que a criação de widgets funciona após confiar no certificado local. A aceitação Chrome registrada cobre criar/editar, cópia única, regenerar, revogar, excluir e selecionar fonte de fila com fixture isolada do PostgreSQL. Os registros de validação em inglês e pt-BR agora concordam sobre esses resultados e limites: não houve credenciais/sincronização nem escritas reais na Twitch; não se alega compatibilidade OBS em Windows/macOS.
- Verificações operacionais somente de leitura mostraram os contêineres isolados do bot e PostgreSQL saudáveis, `pg_isready` aceitando conexões, `/health` com `status=ok` e banco `connected`, Twitch `not_configured` e zero widgets ativos. Nenhum volume ou dado persistente da aplicação foi removido.
- As correções de regressão continuam verificadas: estado de fila é projetado somente para `synced`, `synced_manual` ou `delete_pending` (o teste de integração PostgreSQL afirma que exclusão pendente projeta fechado); renderer consulta a cada 1.000 ms; HTTP 401/403/404 limpa os dados; proteção contra replay da URL de capability está coberta.

### Achados

Não restam achados de produto bloqueantes ou não bloqueantes. Nenhuma autorização Twitch real, sincronização de recompensas ou operação de pontos é alegada.

### Conformidade

- OBS nativo e aceitação do operador: **PASS** para a combinação Ubuntu/OBS/CEF testada.
- Projeção, privacidade/ciclo de capability, tratamento de erro do renderer e polling: **PASS**.
- Migrations/persistência PostgreSQL e gates de qualidade da aplicação: **PASS**.
- Documentação operacional e evidências bilíngues: **PASS**.
- Todos os critérios de aceite da FND-7: **PASS** dentro dos limites de plataforma e validação Twitch explicitamente documentados.
- Refatoração durante QA: **Nenhuma**. Somente esta seção Resultados de QA foi atualizada.

### Ciclo de status

**Gate QA: PASS; score 9,2/10.** FND-7 está Done. READMEs, índices de stories, status do plano de implementação, registros de validação, changelogs e documentação de integrações foram sincronizados para registrar a conclusão e os limites documentados de validação de plataforma/Twitch.

## Evidências e limitações

- Spec Pipeline COMPLEX, 19/25 após revisão de 2026-10-06; pesquisa oficial de OBS/CEF, Chromium e desempenho OBS em 2026-10-06.
- Crítica da especificação atualizada pelo protocolo QA aprovada, 4,6/5; isso não substitui revisão final independente do código.
- OBS Browser Source nativa validada no Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120 com TLS seguro, Page Permissions=None e 80 atualizações <=2s; Windows/macOS não testados.
