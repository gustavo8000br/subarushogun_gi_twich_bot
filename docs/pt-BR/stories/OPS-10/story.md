# OPS-10 — Separar validação CI da entrega de imagem na branch main ([issue #45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45))

[English](../../../stories/OPS-10/story.md)

**Status:** InProgress
**Executor:** `$aiox-devops` para workflows/ruleset; `$aiox-dev` para testes de contrato e implementação.
**Gate de qualidade:** revisão arquitetural do `$aiox-architect` e validação independente do `$aiox-qa`.

## História

Como pessoa mantenedora,
quero separar a validação de pull requests da entrega de imagens da branch main usando um único pipeline de qualidade reutilizável,
para que PRs não exibam publicação de imagem como check ignorado e somente commits validados publiquem no GHCR.

## Escopo

- O workflow de qualidade reutilizável contém lint e typecheck de API/infra/web, lint/typecheck compartilhados, testes nativos do instalador, testes Vitest/PostgreSQL/Compose, OpenGrep/versão, validação do Compose e build da imagem de produção.
- O CI de PR chama o workflow de qualidade e não pede permissão de escrita em pacotes nem publica imagens.
- O CD da main chama o mesmo workflow para o commit mesclado e então publica no GHCR as tags móveis existentes `main`, tags por arquitetura e tags da identidade materializada exata do produto.
- Publicações são serializadas e uma publicação em andamento não pode ser cancelada por um novo push na main. Commits de origem superados não podem deixar um manifest `main` obsoleto como imagem final.
- Os testes nativos dos instaladores não enviam artefatos que nenhum job de CI consome. O workflow de release continua responsável pelos instaladores anexados às releases.
- O ruleset ativo `main-pr-and-ci` exige o gate agregado real de qualidade do PR e não um check de publicação GHCR condicionalmente ignorado.
- Atualizar a consulta do workflow de release para o CD da main, preservando a validação de que o commit exato da tag passou os gates na main.
- Documentar responsabilidades CI/CD, semântica das tags de imagem, associação com release e recuperação de falhas nos dois idiomas.
- Manter `.release-stage` em `alpha`; não criar release nem tag.

## Critérios de aceite

1. GitHub Actions interpreta e executa workflows separados de CI de PR e CD da main; execuções de PR não contêm job de publicação GHCR, permissão `packages: write` ou check de publicação ignorado.
2. Ambos os workflows chamam o mesmo pipeline reutilizável de qualidade; seu check agregado falha se qualquer validação obrigatória falhar ou for cancelada e só passa quando todas passam.
3. Testes nativos dos instaladores continuam em Linux, macOS e Windows, mas execuções comuns de CI não enviam artefatos temporários.
4. A publicação GHCR executa somente em push para `main`, depende do sucesso do workflow reutilizável e preserva tags AMD64/ARM64, manifests multiplataforma, cache e identidade materializada exata do produto.
5. Execuções concorrentes ou superadas da main não cancelam uma publicação ativa nem deixam build antigo como manifest `main` final. Repetir a publicação do mesmo commit é seguro.
6. O ruleset ativo exige o gate PR estável verificado e não exige checks de main-CD/GHCR em pull requests; os contextos obrigatórios são confirmados numa execução real do GitHub Actions.
7. O workflow de release verifica a execução bem-sucedida do CD da main para o commit exato da tag antes de publicar seus assets.
8. Testes de contrato dos workflows são escritos primeiro e demonstram o defeito anterior (check PR exigido apesar de publicação ignorada, uploads desnecessários, falta de workflow compartilhado/consulta correta de release) antes da implementação.
9. Documentação bilíngue, índices de stories, roadmap, `CHANGELOG.md`, `CHANGELOG_INTERNAL.md` e versões pt-BR descrevem o mesmo workflow e status atual.
10. Gates passam: testes, lint, typecheck, OpenGrep, validadores de versão/localização, configuração Compose, validação/lint dos workflows, checks do PR e inspeção final do ruleset. Nenhum volume ativo da aplicação é recriado ou removido.

## Tarefas de implementação

- [x] Escrever testes de contrato dos workflows e registrar resultado Red antes de alterar os workflows.
- [x] Extrair jobs de qualidade em pipeline reutilizável `workflow_call` com check agregado estável.
- [x] Criar CI exclusivo de PR e CD em push para main; remover uploads CI e limitar escrita de pacote ao publicador.
- [x] Proteger publicação contra cancelamentos/concorrência; preservar convenção de tags por arquitetura.
- [x] Atualizar a verificação de CI da release para usar o CD da main e validar a origem exata.
- [ ] Atualizar o ruleset ativo para exigir somente o check agregado de PR verificado.
- [x] Atualizar versão para `0.13.0` mantendo `alpha`; atualizar changelogs, roadmap, índices das stories e documentação CI/CD nos dois idiomas.
- [ ] Executar revisão independente do `$aiox-qa` e registrar evidências/gate.
- [ ] Confirmar checks e comportamento do ruleset no GitHub; não mesclar com checks ausentes ou falhos.

## Notas técnicas

- O `ci.yml` atual executa em PR, push na main e acionamento manual. A condição de `container-publish` já restringe a publicação a `push` na main, mas o ruleset ativo lista esse check ignorado em PRs como obrigatório.
- A concorrência no workflow atual usa `cancel-in-progress: true`, podendo cancelar publicação da main.
- O workflow de release consulta atualmente `ci.yml` para validar o commit da tag; após separar os gatilhos, deve consultar o novo CD da main.
- A documentação do GitHub confirma que uma condição de job pode ignorá-lo mantendo estado de sucesso; checks ignorados contam como sucesso no ruleset. Também documenta o nome de check de workflow reutilizável como job chamador mais job interno. O nome real deve ser conferido numa execução de PR antes de alterar o ruleset.
- Evitar escalada de privilégio com `workflow_run`. O CD da main deve verificar e compilar seu próprio commit confiável de `push`, nunca executar código de PR não confiável com permissão de escrita em pacotes.
- Preservar o contrato atual de tags: `main` é um canal móvel de instalação; tags de arquitetura identificam imagens específicas; a identidade completa do produto é gerada a partir do commit exato da main e permanece disponível para instaladores versionados.
- O workflow reutilizável é a implementação comum. O CI valida o contexto de merge do PR; o CD revalida a origem mesclada antes da publicação.

## Evidências TDD

- **Red inicial dos contratos de workflow:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js` — 10 verificações de comportamento falharam porque o CI de PR ainda continha publicação GHCR condicional, não havia workflow reutilizável/CD exclusivo da main e a release ainda consultava `ci.yml`. O parse YAML e a configuração dos testes funcionaram; as falhas eram dos comportamentos ausentes/incorretos.
- **Red da regressão de tags por arquitetura:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 falhou / 2 passaram porque os builds ainda escreviam tags móveis `main-linux-*` antes de verificar se a origem continuava atual.
- **Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passaram após extrair verificações compartilhadas, separar gatilhos/permissões, conferir a origem antes da promoção e usar imagens imutáveis identificadas pelo SHA completo como base das tags móveis.
- **Evidências GitHub pendentes:** a execução Actions da PR deve confirmar o contexto real do check obrigatório antes de alterar o ruleset ativo. Nenhum resultado de check GitHub ou veredito final de QA foi declarado ainda.

## Lista de arquivos

- `.github/workflows/ci.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/release.yml`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `tests/integration/version-cli.test.js`
- `package.json`, `package-lock.json`, `VERSION`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/CI-CD.md`, `docs/pt-BR/CI-CD.md`
- `docs/DEVELOPMENT.md`, `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`
