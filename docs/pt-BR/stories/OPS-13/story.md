# OPS-13 — Manter o widget de conta do OBS funcional após recarregar

[English](../../../stories/OPS-13/story.md)

**Status:** Pronta para revisão — implementação e gates automatizados passaram; ainda falta o aceite do proprietário no runtime OBS nativo.
**Prioridade:** Alta
**Executor:** `$aiox-dev`.
**Gates de qualidade:** `$aiox-architect` revisa o tratamento da capacidade e o ciclo de vida do navegador; `$aiox-qa` valida de forma independente recarga, revogação e projeção da conta.

## História

Como streamer que usa o widget de conta atual no OBS,
quero que o widget continue autorizado quando a fonte de navegador do OBS for recarregada,
para que a conta atual continue visível sem recriar o widget.

## Evidência e escopo

O proprietário relatou que uma chamada individual atualiza a conta atual no painel, mas não na fonte do OBS. A fonte configurada no widget é `Conta atual`; recarregar a fonte de navegador exibe uma tela preta. O renderer lê a capacidade do fragmento da URL e remove esse fragmento imediatamente, então uma recarga já não tem a capacidade necessária para consultar os dados. O comando de reset da conta responde com o rótulo padrão configurado; o proprietário esperava `Streamer`, enquanto o produto permite editar esse rótulo padrão. A semântica do reset está fora desta story.

## Critérios de aceite

1. Depois de abrir uma URL de capacidade válida, recarregar a fonte de navegador do OBS continua exibindo e consultando o mesmo widget enquanto a capacidade permanecer ativa.
2. O segredo da capacidade não fica exposto na URL visível após a inicialização nem é enviado ao servidor web como parâmetro de URL.
3. Revogar ou rotacionar a capacidade torna indisponível um widget já carregado ou recarregado e remove a capacidade retida localmente.
4. O widget de conta atual continua buscando rótulos de conta atualizados durante o polling normal após uma chamada individual.
5. Testes de regressão cobrem carregamento inicial, recarga após remover o fragmento, capacidade revogada após recarga e valores atuais da conta. A documentação e os registros da story permanecem equivalentes em inglês e pt-BR.

## Plano de gates de qualidade

- `$aiox-architect`: revisar tratamento do segredo, recarga do navegador e limites de revogação da capacidade.
- `$aiox-dev`: adicionar primeiro um teste de renderer/serviço que falhe; implementar a menor mudança compatível; executar lint, typecheck, testes unitários, suíte completa, revisão estática, validação de localização/versão e `git diff --check`.
- `$aiox-qa`: mapear de forma independente cada critério para evidência de teste ou runtime e fornecer o score final. A aceitação em runtime no OBS será reportada separadamente dos testes automatizados de navegador.

## Tarefas / subtarefas (ordem TDD)

- [x] Adicionar testes de regressão de renderer e link de capacidade para persistência em recarga e revogação; registrar o resultado de falha.
- [x] Preservar a capacidade ativa durante a recarga sem expor o segredo na URL ou no caminho da requisição.
- [x] Verificar a projeção atualizada da conta após chamada individual e o comportamento de capacidade revogada após recarga.
- [x] Atualizar changelogs bilíngues, índices de stories e handoff após implementação e solicitação de revisão QA.
- [x] Registrar o score da QA independente e suas evidências automatizadas no gate QA.

## Notas de desenvolvimento

- A projeção da conta é servida por `GET /overlay/api/widget`; o renderer consulta uma vez por segundo com `cache: no-store`.
- A capacidade do widget é emitida por `apps/api/src/domain/overlay-widget-service.mjs` e consumida por `apps/web/overlay-renderer.mjs`.
- Não há mudança de banco/schema neste escopo.

## Lista de arquivos

- [x] `docs/stories/OPS-13/story.md`
- [x] `docs/pt-BR/stories/OPS-13/story.md`
- [x] `tests/unit/overlay-renderer.test.js`
- [x] `tests/unit/overlay-widget-service.test.js`
- [x] `tests/e2e/overlay-browser.mjs`
- [x] `apps/web/overlay-renderer.mjs`
- [x] `apps/api/src/domain/overlay-widget-service.mjs`
- [x] `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md`
- [x] `docs/stories.md`, `docs/pt-BR/stories.md`
- [x] `docs/session-handoff.md`, `docs/pt-BR/session-handoff.md`
- [x] `docs/qa/gates/OPS-13-overlay-capability-reload.yml`

## Registro do agente Dev

### Referências do log de depuração

- Reprodução do proprietário: a conta do painel muda após chamada automática; a fonte do widget no OBS é `Conta atual`; recarregar a fonte de navegador exibe uma tela preta.
- Relato do proprietário: `!fila conta reset` responde com um rótulo padrão configurado diferente de `Streamer`. O comportamento existente restaura o rótulo padrão editável; isso não está incluído como defeito de código nesta story.
- TDD RED: `npx vitest run tests/unit/overlay-renderer.test.js tests/unit/overlay-widget-service.test.js` — inicialmente 3 falharam porque o renderer não retinha/recuperava a capacidade após recarga nem a limpava após rejeição, e as URLs geradas não tinham uma referência estável de armazenamento. A QA independente identificou então uma possível colisão entre capacidades antigas e rotacionadas se páginas OBS compartilhassem o session storage; a suíte de regressão expandida apresentou cinco falhas antes da correção.
- TDD GREEN: suíte focada de renderer/serviço passou **17/17** após implementar retenção da capacidade na sessão, uma referência aleatória por capacidade, limpeza após revogação, isolamento de rotação com armazenamento compartilhado e renderização de conta atualizada.
- Integração da projeção da conta: `npx vitest run tests/integration/queue-repository.test.js -t 'switches account and updates the overlay after an individual call when enabled'` — 1 passou usando PostgreSQL descartável da suíte.
- Gates completos: `npm run lint`, `npm run typecheck`, `npm test` (**106 arquivos / 965 testes**), `npm run review:static` (0 achados), `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run sync:ide:check` (109/109), `npm run build` e `git diff --check` passaram. `npm run validate:structure` não está definido nos scripts deste repositório.
- E2E OBS nativo não foi executado porque o runtime OBS/navegador não está disponível neste Codespace. O E2E existente agora recarrega a mesma página depois de remover o fragmento; ainda falta confirmação de runtime pelo proprietário.

### Resultados QA

- Revisão independente de `$aiox-qa`: **PASS — 10/10** no escopo automatizado da OPS-13. A revisão confirmou isolamento do armazenamento por capacidade, tratamento do segredo, limpeza após revogação, cobertura de regressão e gates de qualidade reportados. Consulte `docs/qa/gates/OPS-13-overlay-capability-reload.yml`.
- A confirmação de recarga nativa no OBS/CEF continua pendente com o proprietário; o score automatizado não inclui essa verificação de runtime ainda não executada.

### Revisão independente — 2026-10-14

- **Revisora:** Quinn (Arquiteta de Testes)
- **Revisão:** digest do working tree de código/testes `4ac8788bad2b72b661f67dcb5c9964757e3a633c658dc2309e4a53504b5b165b`
- **Veredito:** PASS — **10/10** para o escopo automatizado da OPS-13. Os critérios de aceite para retenção da capacidade durante recarga, remoção do segredo da URL visível/caminho da requisição, limpeza após revogação e rotação, isolamento do armazenamento por capacidade e polling da conta atual têm cobertura de regressão. Os testes focados passaram 17/17; a suíte completa passou em nova execução com `--maxWorkers=4`, com 106 arquivos / 965 testes; os testes PostgreSQL que falharam na execução paralela passaram 13/13 quando executados isoladamente. Lint, typecheck, build, validações de localização/versão/denylist de portas, sync IDE, revisão estática (0 achados) e `git diff --check` passaram nos gates finais reportados.
- **Limitação de runtime:** O E2E de recarga OBS/CEF nativo não foi executado no Codespaces. O aceite do proprietário em runtime nativo continua pendente e está fora deste score automatizado. URLs OBS de capability existentes devem ser regeneradas após instalar a correção.
- **Gate:** `docs/qa/gates/OPS-13-overlay-capability-reload.yml`. O status do ciclo de vida da story permanece inalterado enquanto aguarda o aceite de runtime do proprietário.
