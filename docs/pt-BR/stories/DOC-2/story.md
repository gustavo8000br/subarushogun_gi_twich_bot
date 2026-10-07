# DOC-2 — Capturas do produto e revisão visual de UX

[English](../../../stories/DOC-2/story.md) · [Issue #40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40)

**Status:** Planejada. A revisão visual antecipada solicitada pelo proprietário está registrada em `visual-preflight.md`; o ajuste da página de cargos está em andamento. As capturas finais do produto e o GIF para o README ainda não foram produzidos.
**Capacidade:** Onboarding do produto e mídia documental

## História

Como streamer ou contribuidor,
quero documentação visual precisa, tranquila e página por página,
para entender o produto real sem confundir capturas com controles do navegador ou gravações apressadas.

## Critérios de aceite

1. `$aiox-ux-design-expert` e `$aiox-architect` revisam todas as páginas do produto antes das capturas; a revisão registra achados e limitações de estados indisponíveis.
2. A página Comandos e Cargos e permissões segue o sistema visual já estabelecido no painel e facilita comparar acessos configuráveis e imutáveis sem mudar as regras de autorização.
3. Cada captura contém somente a página do produto. Abas, barra de endereço, moldura do navegador e interface de desktop sem relação com o produto ficam de fora. Não recortar conteúdo ou controles necessários para entender a tela.
4. A apresentação nos READMEs usa um GIF sem aceleração, página por página e em ritmo calmo de leitura. Cada página permanece visível tempo suficiente para ser compreendida; não usar tour acelerado nem timelapse.
5. Capturas e GIF mostram o produto publicado em uma versão documentada, usam estado demonstrativo seguro, não contêm segredos ou dados pessoais e possuem assets otimizados, alt text significativo e legendas/posicionamento bilíngues.
6. A documentação em inglês e pt-BR permanece equivalente. Atualizar contratos de imagens/links e changelogs quando aplicável. Não declarar capturas ou GIF concluídos até que os assets existam e tenham sido verificados.

## Registro TDD e implementação

- **Red — agrupamento:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'groups configurable and fixed commands'` falhou porque `groupCommandPolicies` não existia. A falha foi pelo comportamento ausente, não pelo ambiente.
- **Red — contrato do painel:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'groups command policies'` falhou porque a página não tinha layout agrupado nem rótulos de grupo.
- **Green:** `npm test -- --run tests/unit/command-catalog-view.test.js tests/integration/panel-localization-contract.test.js` passou 26/26 depois que a visualização passou a agrupar comandos por audiência configurável, acesso fixo de streamer/moderador e acesso fixo exclusivo do streamer. `npm run validate:localization` passou para os catálogos do painel em inglês, espanhol e pt-BR.
- **Validação arquitetural:** `$aiox-architect` confirmou que uma política legada exata contendo somente `everyone` era autorizada corretamente, mas mostrava apenas “Todos” no painel, ocultando visualmente os níveis da audiência. Políticas hierárquicas já enumeravam os cargos superiores. Nenhuma autorização ou política salva foi alterada.
- **Red — exibição explícita da audiência:** o teste unitário falhou porque `projectAudienceForDisplay` não existia; ao adicionar a tradução, o contrato do catálogo também apontou a allowlist de placeholder ausente. **Green:** 32 testes nos contratos da visualização, painel e descoberta de catálogos passaram; `npm run validate:localization` passou para en/es/pt-BR. “Todos” agora identifica os cargos incluídos, enquanto listas antigas exatas sem `everyone` permanecem inalteradas.
- **Red — espaçamento do botão:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'groups command policies'` falhou porque o formulário não reservava espaço antes do botão de salvar.
- **Green — espaçamento do botão:** o mesmo teste passou (1/1) após adicionar margem superior de 24px ao botão e espaçamento abaixo do aviso de status. A suíte completa passou 87 arquivos / 730 testes.
- **Limite de comportamento:** o agrupamento usa a projeção existente da API (`configurable`, `immutableRoles` e cargos efetivos). Não muda políticas, endpoints, persistência ou regras de autorização.
- **Limite de inspeção visual:** foi revisada uma prévia local isolada com CSS e markup representativo; a interface integrada servida por uma build local ainda não foi validada visualmente. A instalação ativa GHCR continua na imagem anterior.
- **Pendente:** gates estáticos finais, QA independente, inspeção integrada no navegador e atualização do corpo da Issue #40. A produção final de capturas/GIF continua como aceite futuro da DOC-2.

## Lista de arquivos

`apps/web/app.js`; `apps/web/command-catalog-view.mjs`; `apps/web/styles.css`; `apps/web/localization/catalogs/panel/en.tsv`; `apps/web/localization/catalogs/panel/es.tsv`; `apps/web/localization/catalogs/panel/pt-BR.tsv`; `apps/shared/localization/discover-catalog-module.mjs`; `tests/unit/command-catalog-view.test.js`; `tests/integration/panel-localization-contract.test.js`; `docs/stories/DOC-2/story.md`; `docs/stories/DOC-2/visual-preflight.md`; `docs/pt-BR/stories/DOC-2/story.md`; `docs/pt-BR/stories/DOC-2/visual-preflight.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`; `package.json`; `VERSION`.
