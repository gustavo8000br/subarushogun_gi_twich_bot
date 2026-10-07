# OPS-10 — Separar validação CI da entrega de imagem na branch main ([issue #45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45))

[English](../../../stories/OPS-10/story.md)

**Status:** Done
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
- Verificar a assinatura do binário OpenGrep fixado, manter a instalação do Cosign protegida por checksum e enfileirar releases por tag sem substituir tentativas pendentes.
- Descrever tags GHCR como referências mutáveis e digests como identidade exata do conteúdo; testar estruturalmente limites de permissão e concorrência da release.
- Vincular cada manifest multiplataforma versionado ao SHA completo da origem e incluir seu digest exato nos instaladores de release, para que mudanças posteriores da tag não alterem um download já publicado.
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
11. A assinatura do binário OpenGrep fixado é verificada antes do scan, e a instalação do Cosign confere o checksum do binário fixado.
12. A publicação de releases é serializada por tag sem cancelar trabalho em andamento; várias tentativas pendentes entram na fila dentro do limite do GitHub, e testes verificam dependências entre jobs e permissões mínimas.
13. A documentação CI/CD nos dois idiomas diferencia tags mutáveis GHCR de digests das imagens e descreve corretamente os limites da fila de execuções pendentes.
14. Instaladores de release só são gerados após validar o SHA da origem e as plataformas AMD64/ARM64 do manifest; a referência Compose do instalador contém o digest do manifest.

## Tarefas de implementação

- [x] Escrever testes de contrato dos workflows e registrar resultado Red antes de alterar os workflows.
- [x] Extrair jobs de qualidade em pipeline reutilizável `workflow_call` com check agregado estável.
- [x] Criar CI exclusivo de PR e CD em push para main; remover uploads CI e limitar escrita de pacote ao publicador.
- [x] Proteger publicação contra cancelamentos/concorrência; preservar convenção de tags por arquitetura.
- [x] Atualizar a verificação de CI da release para usar o CD da main e validar a origem exata.
- [x] Atualizar o ruleset ativo para exigir somente o check agregado de PR verificado.
- [x] Verificar assinaturas do binário OpenGrep fixado com Cosign; enfileirar retries de release e testar limites de permissões.
- [x] Corrigir a semântica de tags/digests GHCR na documentação bilíngue e atualizar referências CI/CD.
- [x] Isolar o diretório do OpenGrep para impedir que binários preexistentes pulem a verificação de assinatura; fixar instaladores de release ao digest OCI validado.
- [x] Atualizar versão para `0.13.0` mantendo `alpha`; atualizar changelogs, roadmap, índices das stories e documentação CI/CD nos dois idiomas.
- [ ] Executar revisão independente do `$aiox-qa` e registrar evidências/gate.
- [ ] Confirmar checks e comportamento do ruleset no GitHub; não mesclar com checks ausentes ou falhos.

## Notas técnicas

- `ci.yml` executa para pull requests destinados à `main` e acionamento manual. Ele chama `quality-gates.yml` e não tem job de publicação GHCR nem permissão de escrita em pacotes. `main-cd.yml` executa somente em push para `main`, repete esses gates e concede `packages: write` apenas ao job publicador.
- O ruleset ativo `main-pr-and-ci` exige somente `CI quality gates / Required quality gate`, confirmado na execução Actions `37690120672` da PR e na leitura do ruleset `24656777`.
- A publicação da main usa um grupo de concorrência não cancelável com `queue: max`. Tags de arquitetura com SHA completo são aliases do registry associados ao commit, não identificadores imutáveis de conteúdo; use o digest do registry para identificar o conteúdo exato. O manifest versionado é publicado para a origem validada exata antes que a checagem de main atual controle a promoção das tags móveis `main`.
- Jobs de release são serializados por tag com `cancel-in-progress: false` e `queue: max`. O workflow de release confere a execução bem-sucedida de `main-cd.yml` para o commit exato da tag e exige que ele esteja na `main`.
- OpenGrep `1.30.0` é instalado de um commit de origem upstream fixado e a assinatura do binário da release é verificada com Cosign `2.5.0`. Cosign é instalado por uma Action fixada por SHA que verifica o checksum do binário baixado. actionlint é fixado com verificação SHA-256; sua supressão estreita de aviso de schema cobre o campo `concurrency.queue: max`, suportado pelo GitHub.
- O mesmo workflow reutilizável implementa os gates compartilhados. Pull requests validam o contexto de merge; o CD da main valida novamente seu commit confiável já mesclado. Não há transferência de privilégio por `workflow_run`.

## Evidências TDD

- **Red inicial dos contratos de workflow:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js` — 10 verificações de comportamento falharam porque o CI de PR ainda continha publicação GHCR condicional, não havia workflow reutilizável/CD exclusivo da main e a release ainda consultava `ci.yml`. O parse YAML e a configuração dos testes funcionaram; as falhas eram dos comportamentos ausentes/incorretos.
- **Red da regressão de tags por arquitetura:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 falhou / 2 passaram porque os builds ainda escreviam tags móveis `main-linux-*` antes de verificar se a origem continuava atual.
- **Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passaram após extrair verificações compartilhadas, separar gatilhos/permissões, conferir a origem antes da promoção e usar tags de arquitetura vinculadas ao SHA completo como referências da origem para tags móveis.
- **Red do seguimento de QA:** após a revisão de Quinn, `npm test -- --run tests/unit/ci-workflow-contract.test.js` falhou 1/8 porque o pipeline reutilizável não executava `npm run validate:localization` nem actionlint. O setup foi interpretado; a falha foi o comportamento de gate ausente.
- **Green do seguimento de QA:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passaram depois de adicionar actionlint `1.7.12` fixado (com SHA-256) e validação de localização. `/tmp/actionlint -ignore 'unexpected key "queue" for "concurrency" section'` passou localmente; a exceção estreita cobre o campo de fila suportado pelo GitHub mas ausente do schema atual do actionlint.
- **Red do manifest versionado:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 falhou / 3 passaram porque uma execução superada da main pulava a criação de seu manifest versionado exato e poderia deixar uma futura release sem a tag da imagem.
- **Green/refatoração do manifest:** `/tmp/actionlint -shellcheck= -ignore 'unexpected key "queue" for "concurrency" section'` e os contratos combinados de workflow/versão passaram localmente; `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 17 passaram após publicar cada manifest de versão antes da verificação da origem e proteger somente as tags móveis `main`.
- **Red dos achados da auditoria:** `npx vitest run tests/unit/ci-workflow-contract.test.js` — 3 falharam / 7 passaram porque concorrência de release não mantinha várias execuções pendentes, o binário OpenGrep não tinha assinatura verificada e a documentação chamava incorretamente as tags mutáveis do registry de imutáveis.
- **Green dos achados da auditoria:** `npx vitest run tests/unit/ci-workflow-contract.test.js` — 10 passaram após adicionar verificações estruturais de permissões/dependências da release, `queue: max` por tag, instalação OpenGrep com verificação Cosign e documentação correta de tags/digests nos dois idiomas.
- **Red do pin de artefato:** `npx vitest run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/unified-installer.test.js` — 6 falharam / 36 passaram porque a CI de release não resolvia digest de imagem com origem verificada, o empacotador rejeitava `tag@sha256:digest` e OpenGrep podia reutilizar um binário cuja assinatura não era conferida. Após implementar a saída de digest e o `HOME` isolado, as suítes focadas de workflow, publicador, instalador e Compose passaram 52/52.
- **Gates locais finais de qualidade:** `npm test` passou em 88 arquivos / 734 testes; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), actionlint 1.7.12, `npm run validate:version`, `npm run validate:localization`, `docker compose config --quiet` e `git diff --check` passaram no snapshot da implementação. Os contratos focados de workflow, publicação, instalador, Compose e documentação também passaram. Os recursos criados pelos testes foram limpos; os dois volumes de dados do produto permaneceram presentes e intocados.
- **Evidência GitHub:** execução `37689341108` da PR #46 mostrou `CI quality gates / Required quality gate` e os 11 checks passaram antes das alterações posteriores no workflow. O ruleset ativo `main-pr-and-ci` foi atualizado e reinspecionado com esse agregado exato como único contexto obrigatório. A execução `37690120672` passou nos 11 jobs do commit `edd99ee`. O snapshot final dos achados da auditoria ainda precisa de sua própria execução Actions e revisão QA independente antes do merge.

## Lista de arquivos

- `.github/workflows/ci.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/release.yml`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `tests/integration/unified-installer.test.js`, `tests/integration/compose-contract.test.js`
- `apps/infra/scripts/package-installer.mjs`
- `tests/integration/version-cli.test.js`
- Download do actionlint fixado e verificação SHA-256 em `.github/workflows/quality-gates.yml`
- `package.json`, `package-lock.json`, `VERSION`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/CI-CD.md`, `docs/pt-BR/CI-CD.md`
- `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/DEVELOPMENT.md`, `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`

## Registro de alterações

- 2026-10-07 — Aplicados os achados da auditoria independente de CI/CD: verificação de assinatura do OpenGrep, fila de retries/permissões de release e semântica correta de tags/digests GHCR. Instaladores agora fixam o digest validado da imagem.
| 2026-10-07 | 0.13.0 | Gate de QA PASS (9,4/10) — Status: InReview → Done; os 14 critérios de aceite foram verificados. | @qa |
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`
- `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`

## Resultados do QA

### Data da revisão: 2026-10-07

### Revisado por: Quinn (`$aiox-qa`)

**Gate: PASS — 9,4/10 → `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`.** A revisão atual da PR passou nos gates hospedados e o ruleset ativo exige o check agregado observado. A divergência documental encontrada na story anterior foi corrigida nos dois idiomas.

**Revisão:** `3e49fc0e8159f4377a8c143b35129b111ef89a9d` (PR #46; o HEAD corresponde).

**Evidências do GitHub:** a execução de Actions `37691970595` passou nos 11 jobs: 88 arquivos de teste / 734 testes, lint e typecheck de API/infra/web, lint/typecheck compartilhados, smoke tests de instalador Linux/macOS/Windows, lint de workflows e validadores OpenGrep/versão/localização, configuração Compose e build da imagem de produção, além do agregado `CI quality gates / Required quality gate`. A leitura somente de consulta confirma que o ruleset ativo `main-pr-and-ci` (ID `24656777`) exige apenas `CI quality gates / Required quality gate`, correspondente ao nome observado.

**Verificações locais independentes:** passaram `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), `npm run validate:version` (`v0.13.0-0000000-alpha`), `npm run validate:localization` (5 módulos; en/es/pt-BR) e `git diff --check`. Não repeti `npm test`, Compose ou Docker nesta revisão porque a suíte completa e o build da imagem passaram no runner isolado do GitHub, e esta tarefa de QA proíbe tocar nos volumes Docker locais.

**Revisão dos critérios:** AC 1–14 são cobertos pelas definições de workflow, testes de contrato de workflow/instalador/Compose, documentação bilíngue e execução bem-sucedida da PR. Os testes verificam permissões mínimas de pacote/release, comportamento do check agregado, fila/limites de releases, instalação do OpenGrep com assinatura verificada, anotações de SHA/plataformas da origem e referência dos instaladores fixada por digest. O ruleset ativo foi consultado no GitHub. A publicação real no GHCR e uma release com tag não foram executadas nesta PR; suas condições e contratos foram validados, e a publicação do produto continua pertencendo aos workflows autorizados de main/release.

**Gate:** PASS → `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`

**Ciclo de vida:** status alterado de `InReview` para `Done`; a entrada do QA no Registro de alterações documenta a transição. Nenhum comando Docker ou alteração de volume foi realizado.
