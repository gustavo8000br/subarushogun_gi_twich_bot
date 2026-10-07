# Story OPS-2: Traduzir o status Twitch no painel

[English](../../../stories/OPS-2/story.md)

**Complexidade:** PEQUENA
**Executor:** @dev
**Quality gate:** @qa
**Capacidade:** Painel de configuração local
**Issue GitHub:** [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)

## Status

**Concluída no código — QA independente PASS 9,3/10; corpo da issue #21 atualizado, que permanece aberta até o merge desta implementação via PR.**

## História

**Como** streamer configurando a integração Twitch local,
**quero** que a pílula de conexão use texto claro em pt-BR,
**para que** códigos internos de status da API não apareçam como texto do produto.

## Critérios de Aceitação

1. Códigos de status Twitch exibidos no painel são mapeados para rótulos seguros em português para o usuário; `ineligible` informa que é preciso ser Afiliado/Parceiro.
2. Status desconhecidos usam um fallback genérico em português e nunca são apresentados sem tradução.
3. A explicação detalhada existente sobre elegibilidade continua visível em português.
4. O plano FND-8 registra localização para todo o produto: pt-BR padrão selecionado na instalação e editável no painel; inglês e espanhol; catálogos comunitários separados por módulo e idioma; cobertura do painel, comandos/mensagens de chat, textos de produto dos widgets OBS e ferramentas locais de configuração/atualização/desinstalação. A implementação da FND-8 continua em story separada.

## Evidências TDD

- **Red do rótulo:** `npm test -- --run tests/unit/setup-messages.test.js` — 2 falharam porque `twitchStatusLabel` não existia; o contrato exigia rótulos em português para `ineligible`, estados de conexão e valores desconhecidos.
- **Green do rótulo:** o mesmo comando focado passou em 5 testes após incluir mapa pt-BR allowlistado e fallback para estado desconhecido.
- **Red da ligação com a interface:** `npm test -- --run tests/unit/web-route.test.js` falhou porque o script do painel servido ainda mostrava diretamente `setup.status.toUpperCase()`.
- **Green da interface:** `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` — 6 passaram após ligar o rótulo localizado à pílula Twitch e trocar o atributo DOM de status bruto por categorias de apresentação.
- **Validação focada:** `npx eslint apps/web tests/unit/setup-messages.test.js tests/unit/web-route.test.js --max-warnings=0` e `npx tsc --noEmit -p tsconfig.json` passaram.
- **Suíte completa:** `npm test` — 45 arquivos e 285 testes passaram.
- **Gates de qualidade:** `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, `npm run review:static` (OpenGrep; 40 arquivos, 0 achados) e `git diff --check` passaram.
- **Achado QA independente e correção de regressão (2026-10-06):** revisão QA inicial foi CONCERNS (8,6/10): com `connected: true` e `status: 'ineligible'`, a pílula mostrava `Conectado` e categoria visual conectada. Primeiro foi adicionado teste de regressão; `npm test -- --run tests/unit/setup-messages.test.js` falhou: esperava `Afiliado ou Parceiro necessário`, recebeu `Conectado`. Green adiciona o resolver seguro compartilhado `twitchStatusState()`, que prioriza inelegibilidade e determina rótulo e categoria da pílula. A suíte focada passou 6/6; `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` passou 11/11. A reavaliação QA independente PASS 9,3/10 encerrou os dois achados; nenhuma conta Twitch real foi usada.
- **Segunda correção de regressão e QA final (2026-10-06):** QA detectou que razão de elegibilidade antiga podia ocultar status mais novo `reconnect_required`. Primeiro foi adicionado teste de regressão; Red focado esperava `Reconexão necessária`, mas recebeu `Afiliado ou Parceiro necessário`. Green agora prioriza status operacional conhecido sobre elegibilidade antiga, mantendo `connected + ineligible` visivelmente inelegível. `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` passou 12/12; `npm run lint:web` e `npm run typecheck:web` passaram. Re-revisão QA independente PASS 9,3/10 encerrou os dois achados. Nenhuma conta Twitch real foi usada.

## Lista de Arquivos

`apps/web/app.js`; `apps/web/setup-messages.mjs`; `tests/unit/setup-messages.test.js`; `tests/unit/web-route.test.js`; `docs/stories/OPS-2/story.md`; `docs/pt-BR/stories/OPS-2/story.md`; `docs/qa/gates/OPS-2-twitch-status-pt-br.yml`; `docs/pt-BR/qa/gates/OPS-2-twitch-status-pt-br.yml`; `docs/stories.md`; `docs/pt-BR/stories.md`; `README.md`; `README.pt-BR.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.

## Resultados QA

### Data da revisão: 2026-10-06

### Revisado por: Quinn (AIOX QA)

- Revisão independente inicial de `c008f07`: CONCERNS, 8,6/10. Reproduziu a divergência da pílula conectada/inelegível.
- QA independente revisou as duas correções test-first e emitiu PASS final 9,3/10. Confirmou o fallback seguro; nenhuma operação autenticada no navegador/Twitch foi necessária nem alegada.

### Estado do gate

Gate: PASS, 9,3/10 → `docs/qa/gates/OPS-2-twitch-status-pt-br.yml`.

## Registro de alterações

| Data | Versão | Alteração | Agente |
| --- | --- | --- | --- |
| 2026-10-06 | 0.5.2 | Dois defeitos de precedência de status corrigidos com TDD; QA independente PASS 9,3/10, status InReview → Done | @qa |
