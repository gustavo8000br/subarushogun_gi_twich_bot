# Story FND-7: OBS Overlay configurável por elemento

[English](../../../stories/FND-7/story.md)

**Complexidade:** COMPLEX (17/25)  
**Executor:** @dev  
**Quality gate:** @architect  
**Quality gate tools:** Vitest; Fastify route tests; real PostgreSQL migration integration tests; browser E2E; ESLint; TypeScript checks; OpenGrep/static security review; Prisma validate; Docker Compose config; `git diff --check`
**Prioridade:** P0 — dados, estilo, gestão de links e segurança; P1 — documentação bilíngue  
**Épico/capacidade:** Extensão pós-MVP do bot local Twitch para Genshin Impact  
**Fonte:** Solicitação do streamer e elicitação do Spec Pipeline em 2026-10-05  
**Spec:** spec/spec.md; requisitos, pesquisa, complexidade, crítica e plano em spec/

## Status

**Draft — aguardando aprovação de PM, arquitetura, PO e QA; implementação não iniciada.**

## 🤖 CodeRabbit Integration

### Story Type Analysis

- **Primary:** Feature — new operator-managed OBS overlay capability.
- **Secondary:** Security — local read-only capabilities, revocation, scoped projections and injection-safe rendering.
- **Complexity:** COMPLEX (17/25).

### Specialized Agent Assignment

- **Primary executor:** @dev.
- **Quality gate:** @architect.
- **Supporting reviews:** @qa for test/security evidence; @aiox-ux-design-expert before any renderer or panel UI implementation.

### Quality Gate Tasks

- Complete Spec Pipeline reviewers and approval before implementation.
- Require completed FND-5/FND-6 readiness map before any implementation.
- Use `quality_gate_tools` listed above; include real PostgreSQL migration tests, Fastify security tests, browser E2E, static security scan and repo lint/typecheck gates.
- Review capability issuance/revocation/deletion atomically, data minimization, stale/empty/unavailable states and the eight-widget update envelope.

### Self-Healing Configuration

- **Primary agent:** @dev; **mode:** enabled per repository CodeRabbit configuration.
- **Type:** full; **maximum iterations:** 3; **timeout:** 30 minutes.
- **Severity mapping:** CRITICAL/HIGH = auto-fix; MEDIUM = document as debt; LOW = ignore, matching `.aiox-core/core-config.yaml`.
- **Predicted CRITICAL/HIGH behavior:** auto-fix and block pre-commit/pre-PR completion until resolved. No pre-deployment gate applies to this local feature.
- **Predicted findings:** CRITICAL/HIGH focus includes cross-widget or UID disclosure, raw secret persistence/logging, invalid capability still reading after delete/revoke, XSS/CSS injection, and mutation access from OBS capability.

### CodeRabbit Focus Areas

Local-only exposure, no secret in HTTP path/query, one-time secret issuance, hash-only storage, atomic delete/revoke, strict atomic field projection, fallback/stale/unavailable distinction, accessibility, ≤2-second SLA with eight active widgets, and no unverified OBS platform claims.

A FND-0 preserva o registro histórico de que overlay/OBS estava fora do MVP original. FND-7 é uma extensão pós-MVP explicitamente solicitada. Nenhum código ou teste de implementação foi executado para esta story.

## História

**Como** streamer que usa o bot local de filas de Genshin Impact,  
**quero** criar widgets independentes, personalizar cada um e adicioná-los ao OBS por um link local,  
**para que** a transmissão mostre somente as informações que escolhi, com identidade visual própria e atualização rápida.

## Dependências e limites

- FND-2: regras de fila e identidade de viewers disponíveis como fonte de leitura.
- FND-5: estado de conta atual, chamadas e atendimento precisa estar disponível por serviços/projeções compartilhados; dependência bloqueante completa.
- FND-6: painel local, autenticação de operador e segurança Host/Origin precisam fornecer a base de gestão; dependência bloqueante completa.
- FND-3 (operações financeiras) e ciclo Twitch de recompensas de FND-4 não são dependências funcionais da overlay.
- Nenhuma implementação de FND-7 começa até FND-5 e FND-6 estarem totalmente concluídas. Mapear todos os sete campos dinâmicos e fundamentos do painel/segurança; não aceitar subconjunto reduzido.
- Só OBS e bot no mesmo computador; sem acesso LAN, hospedagem, túnel, serviço ou plugin OBS.
- O painel local é a superfície de gestão aprovada; não adicionar CLI de domínio para widgets.

## Critérios de Aceite

1. **Criar widget e escolher fonte**  
   **Dado** que o streamer está autenticado no painel local, **quando** cria, edita ou exclui um widget, **então** pode escolher exatamente um campo de fonte ou texto fixo, selecionar uma fila quando o campo for relativo à fila, e salvar o widget sem alterar fila/conta/entrada. Catálogo atômico: rótulo da conta atual de Genshin; nome da fila selecionada; estado aberta/fechada da fila selecionada; quantidade aguardando na fila selecionada; display name do viewer chamado; posição do viewer chamado; display name do viewer em atendimento; ou texto fixo. Cada widget escolhe exatamente um item; campos de fila exigem exatamente uma fila. Widgets duplicados são permitidos.

2. **Emitir link independente**  
   **Dado** um widget criado ou uma capability regenerada pela operação autenticada do painel, **quando** essa mutação conclui, **então** sua resposta retorna a URL local com segredo uma única vez para cópia imediata. Nenhuma leitura ou edição posterior recupera o segredo. O endpoint de projeção OBS nunca retorna token ou outro segredo; o segredo não é persistido, logado ou cacheado. Capability concede somente leitura ao widget correspondente.
3. **Personalizar apresentação**  
   **Dado** que o streamer edita um widget, **quando** define aparência, **então** pode configurar cor do texto e fundo em #RRGGBB, opacidade 0–100%, fonte local permitida, tamanho inteiro 8–128px, peso 300/400/500/600/700/800/900, alinhamento left/center/right, contorno 1–8px ou sombra blur 0–32px com offsets −32..32px, largura auto ou 1–3840px, altura auto ou 1–2160px, margens por lado 0–256px e overflow wrap/clip/ellipsis; prévia reflete a mesma configuração. Valores inválidos são rejeitados tanto no cliente quanto no servidor. Texto fixo/fallback aceita até 240 pontos de código Unicode conforme contagem idêntica browser/API.

4. **Estados de valor e disponibilidade**  
   **Dado** que uma consulta dinâmica retorna sucesso sem valor, **quando** a overlay atualiza, **então** mostra o fallback configurado. **Dado** que a primeira consulta falha sem valor anterior, **então** mostra estado neutro indisponível. **Dado** que uma falha transitória ocorre após valor válido, **então** mantém o valor com marcador desatualizado e tenta novamente. **Dado** que a API responde 401/403 para capacidade inválida/revogada ou 404 para widget/capacidade desconhecida/excluída, **então** limpa o conteúdo.

5. **Mostrar somente projeção permitida**  
   **Dado** uma capability válida, **quando** OBS pede o dado ao endpoint de projeção, **então** recebe apenas o campo selecionado e seu contexto necessário. UIDs, credenciais Twitch, sessões, dados financeiros, o segredo da capability, outros widgets e dados de outras filas não são projetados. Estado e regras vêm dos mesmos serviços/projeções usados pelo produto; a rota não consulta entidades Prisma diretamente nem executa mutações.

6. **Revogar, regenerar e excluir**  
   **Dado** que o streamer revoga uma capability, **quando** a operação confirma, **então** o token antigo falha na próxima leitura e estilo/fonte permanecem. **Dado** que regenera, **então** o token anterior falha e a resposta da mutação entrega a nova URL uma única vez, sem alterar fonte/estilo. **Dado** que exclui o widget, **então** exclusão da configuração e invalidação da capability são atômicas e nenhum token anterior pode ler na próxima requisição; não é emitida URL substituta. A fonte OBS limpa o conteúdo ao receber 401/403 para capability inválida/revogada ou 404 para recurso desconhecido/excluído.
7. **SLA de atualização**  
   **Dado** um app local saudável com oito widgets simultaneamente abertos no OBS (mix de campos dinâmicos), **quando** uma mudança de fonte é commitada, **então** o widget correspondente renderiza o valor novo em até 2 segundos, medidos do commit ao DOM atualizado, com polling nominal de 1 segundo. Registrar ambiente e duração; a execução precisa passar em 10 mudanças consecutivas para aceitar o SLA.
8. **Segurança e rendering**  
   **Dado** um operador, link ou conteúdo de widget, **quando** usa APIs/renderização, **então** mutações continuam protegidas pela sessão e CSRF existentes; o link OBS não pode alterar nada; segredo só é entregue uma vez na resposta autenticada de criação/regeneração; nunca é persistido, escrito em path/query HTTP, logado, cacheado ou enviado por referrer; a página envia segredo somente em Authorization header. Conteúdo é texto inerte e estilos usam schema allowlist; Host/Origin e headers CSP/no-store/no-referrer seguem as proteções locais existentes.

9. **Comportamento no OBS e documentação**  
   **Dado** que o streamer adiciona a URL como OBS Studio Browser Source no mesmo computador, **quando** configura dimensões, **então** widget renderiza com fundo transparente, sem barra de rolagem, respeitando estilo e atualização. Guias em inglês e pt-BR explicam criar fonte, copiar URL, escolher dimensões, pré-visualizar e revogar link, sem afirmar compatibilidade de SO não testada.

## Escopo

Inclui modelo persistente de widget/capacidade, catálogo de campos, validação de estilo/texto, gestão e prévia no painel, token limitado e revogável, página Browser Source, atualização/fallback/marcador de desatualização, testes e guias bilíngues.

Exclui controle do OBS, importação/exportação de cenas, acesso por outra máquina, acesso público, UID, credenciais/segredos, custom HTML/CSS/script e alteração de regras do domínio.

## Dev Notes

Executor da implementação: @dev. Quality gate: @architect; @qa atua como revisor de qualidade complementar. Aprovação UX é gate separado antes da implementação da interface.

### Restrições arquiteturais e segurança

- Integrar ao servidor local existente e usar a porta de aplicação configurada; gerar URLs de loopback 127.0.0.1.
- Usar um identificador não secreto na rota e segredo aleatório no fragmento da URL. A página lê o fragmento para memória e manda segredo só no Authorization header. O servidor armazena hash criptográfico, nunca o valor original.
- Capability token é essencialmente uma senha: qualquer pessoa com URL ativa consegue ler o widget; documentar isso e prover revogação/regeneração imediata. Fragmento não vai ao servidor em request, mas permanece na configuração do OBS e deve ser tratado como secreto.
- Resposta e página são no-store, no-referrer; não registrar headers de autenticação. Não expor dados via endpoint de administração.
- Retornar só a projeção do widget e validar scope em cada consulta. Sem UID, IDs/segredos Twitch ou API financeira.
- Falha transitória conserva o último valor apenas com indicador stale; 401/403 limpa imediatamente. Vazio usa fallback configurado.
- Sem novas dependências/runtime externo até pesquisa e teste demonstrarem necessidade.

### Sequência TDD obrigatória

Para cada fatia, registrar Red comportamental, Green, Refactor e comandos em inglês e pt-BR antes de atualizar status. Integração PostgreSQL deve usar migrations reais.

1. Contratos de domínio/catálogo de campos e allowlist de estilo.
2. Persistência PostgreSQL, hash do token, scope, rotação e revogação.
3. Rotas HTTP: gestão autenticada, leitura só com token, Host/Origin e não divulgação.
4. Página Browser Source: atualização, fallback, stale marker, textos seguros e zero cache.
5. Painel: seleção de fonte/fila, estilo, texto, preview, copiar/revogar/regenerar.
6. Aceitação E2E e verificação OBS manual; documentar sistemas/versões efetivamente verificados.

### Casos obrigatórios

- Token errado, faltante, revogado, regenerado, cross-widget e revogação concorrente.
- Corridas de update/revoke/delete; provar atomicidade em leitura concorrente: após resposta de sucesso da exclusão, o token antigo nunca retorna valor; token antigo também falha após reinício do app.
- Capacidade sem sessão administrativa; rotas de mutação sempre exigem sessão/CSRF e revisão/idempotência existente.
- Conta/fila/chamada vazia, fila removida/arquivada, 5xx/rede indisponível, recuperação, primeiro load sem valor, valores longos, caracteres especiais e Unicode.
- Estilos inválidos, CSS injection, HTML/script, URL de fonte remota, resposta cacheada, referrer e headers/logs contendo segredo.
- Exact response keys provêm apenas campo permitido; UID continua ausente em ambos modos de privacidade.
- Propagação ≤2 segundos medida com app e PostgreSQL reais, oito widgets simultâneos de campos dinâmicos mistos, dez mudanças consecutivas e latência commit→DOM registrada.
- Tamanho do texto fixo/fallback ≤240 com a mesma contagem Unicode na UI e API.

## Questões para refinamento de UX antes da implementação da UI

- Definir preset inicial, valores de cor e nomes exatos das famílias de fonte permitidas após revisar o painel e as orientações UX existentes em FND-6.
- Não fazer campo de CSS livre para atingir “personalização completa”; traduzir opções em controles validados.

## Tarefas / Subtarefas

- [ ] 0. Gates de prontidão (AC: 1, 3, 5, 9)
  - [ ] 0.1 Aguardar FND-5 e FND-6 concluídas; verificar e mapear todas as projeções/fundações de segurança; bloquear qualquer implementação se faltar uma.
  - [ ] 0.2 Obter aprovação de @aiox-ux-design-expert para jornada, presets/fonte, preview, estados vazio/erro/stale/revogado, acessibilidade e consistência antes de codificar UI.
  - [ ] 0.3 Registrar a regra de 240 pontos de código Unicode com exemplos de fronteira 240/241.
- [ ] 1. Validar dados e estilos (AC: 1, 3, 5, 7)
  - [ ] 1.1 Escrever primeiro testes de catálogo atômico/scope/projeção e comprovar Red antes de implementar.
- [ ] 2. Persistir widgets e capacidades (AC: 1, 2, 6, 8)
  - [ ] 2.1 Testes de migration PostgreSQL para widget, hash, scope e unicidade/rotação/revogação.
  - [ ] 2.2 Implementar schema com migration real; nunca persistir segredo em claro.
  - [ ] 2.3 Testar persistência após restart, acesso por token antigo e concorrência revoke/read.
- [ ] 2B. Implementar serviço/repositório de widget (AC: 1, 2, 6, 8)
  - [ ] 2B.1 Testar operações e atomicidade da exclusão versus leitura concorrente.
  - [ ] 2B.2 Implementar repository/application service após Red; inclusão de rotas depende deste serviço.
- [ ] 3. Implementar política de estilo e texto (AC: 3, 4, 8)
  - [ ] 3.1 Testar allowlist, limites, Unicode 240, fallback e rejeição de CSS/HTML antes da implementação.
  - [ ] 3.2 Implementar schema de estilo e renderização via texto; retestar após Refactor.
- [ ] 4. Implementar API de gestão e Browser Source (AC: 2, 5, 6, 7, 8)
  - [ ] 4.1 Testes HTTP para auth/session/CSRF na gestão e Authorization token no endpoint somente leitura.
  - [ ] 4.2 Criar, editar, preview, copiar, revogar e regenerar sem regras duplicadas; validar headers/cache/logging.
  - [ ] 4.3 Escrever testes de browser para atualização ≤2s, vazio, stale marker, recuperação, 401/403 e injection.
- [ ] 5. Integrar experiência do painel (AC: 1–4, 6)
  - [ ] 5.1 Após aprovação UX do gate 0.2, testar controles de edição e fluxo de link.
  - [ ] 5.2 Construir controles, preview e link lifecycle sem controles sem ação.
- [ ] 6. Documentar/verificar OBS (AC: 9)
  - [ ] 6.1 Testar Browser Source no OBS e registrar SO/versão/resultado observado.
  - [ ] 6.2 Atualizar guias, story/index e issue nos dois idiomas com evidências reais.
- [ ] 7. Gates finais
  - [ ] 7.1 Executar testes focados, PostgreSQL real, npm run lint, npm run typecheck, npm test, npm run review:static, npm run validate:version, Prisma validate, Compose config e git diff --check.
  - [ ] 7.2 Atualizar checklist/file list e status apenas após evidência.

## Testing

Ainda não executado: a story está em Draft e nenhum código FND-7 existe. Ao implementar, usar as ferramentas/gates listadas acima e registrar comandos/resultados reais.

## File List

Planejada; atualizar durante implementação. Nenhum arquivo de aplicação foi alterado por esta story até o momento.

## Change Log

- 2026-10-05 — Draft criado pelo Spec Pipeline COMPLEX após elicitação, pesquisa e revisão independente; aguardando gates de papel.

## Dev Agent Record

### Agent Model Used

Pendente implementação.

### Debug Log References

Nenhuma; implementação não iniciada.

### Completion Notes List

Pendente implementação; não há código ou teste executado.

## QA Results

Pendente aprovação final dos gates de planejamento e dos testes de implementação.

## Evidência / Limitações

- Spec Pipeline COMPLEX, 17/25; pesquisa oficial OBS/RFC Editor feita em 2026-10-05.
- QA independente aprovou a iteração anterior (4,4/5); nova rodada PO/arquitetura/PM está pendente após correções. Nenhum teste de implementação foi rodado.
- A documentação OBS confirma Browser Source e transparência; verificação deste produto no OBS ainda está pendente.
