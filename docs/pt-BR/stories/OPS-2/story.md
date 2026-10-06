# Story OPS-2: Traduzir o status Twitch no painel

[English](../../../stories/OPS-2/story.md)

**Complexidade:** PEQUENA
**Executor:** @dev
**Quality gate:** @qa
**Capacidade:** Painel de configuração local
**Issue GitHub:** [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)

## Status

**InProgress**

## História

**Como** streamer configurando a integração Twitch local,
**quero** que a pílula de conexão use texto claro em pt-BR,
**para que** códigos internos de status da API não apareçam como texto do produto.

## Critérios de Aceitação

1. Códigos de status Twitch exibidos no painel são mapeados para rótulos seguros em português para o usuário; `ineligible` informa que é preciso ser Afiliado/Parceiro.
2. Status desconhecidos usam um fallback genérico em português e nunca são apresentados sem tradução.
3. A explicação detalhada existente sobre elegibilidade continua visível em português.
4. A direção futura de localização fica registrada: pt-BR padrão, inglês e espanhol, com contribuições da comunidade para idiomas adicionais do painel/frontend. Implementar i18n completo está explicitamente fora desta correção de regressão.

## Evidências TDD

- **Red do rótulo:** `npm test -- --run tests/unit/setup-messages.test.js` — 2 falharam porque `twitchStatusLabel` não existia; o contrato exigia rótulos em português para `ineligible`, estados de conexão e valores desconhecidos.
- **Green do rótulo:** o mesmo comando focado passou em 5 testes após incluir mapa pt-BR allowlistado e fallback para estado desconhecido.
- **Red da ligação com a interface:** `npm test -- --run tests/unit/web-route.test.js` falhou porque o script do painel servido ainda mostrava diretamente `setup.status.toUpperCase()`.
- **Green da interface:** `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` — 6 passaram após ligar o rótulo localizado à pílula Twitch e trocar o atributo DOM de status bruto por categorias de apresentação.
- **Validação focada:** `npx eslint apps/web tests/unit/setup-messages.test.js tests/unit/web-route.test.js --max-warnings=0` e `npx tsc --noEmit -p tsconfig.json` passaram.
- **Suíte completa:** `npm test` — 45 arquivos e 285 testes passaram.
- **Gates de qualidade:** `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, `npm run review:static` (OpenGrep; 40 arquivos, 0 achados) e `git diff --check` passaram.

## Lista de Arquivos

`apps/web/app.js`; `apps/web/setup-messages.mjs`; `tests/unit/setup-messages.test.js`; `tests/unit/web-route.test.js`; `docs/stories/OPS-2/story.md`; `docs/pt-BR/stories/OPS-2/story.md`; `docs/stories.md`; `docs/pt-BR/stories.md`; `README.md`; `README.pt-BR.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.

## Resultados QA

Revisão formal de @qa pendente porque a story ainda está `InProgress` e não tem seção `Change Log`, portanto não atende aos pré-requisitos do workflow de revisão. Não se declara gate nem aprovação QA.
