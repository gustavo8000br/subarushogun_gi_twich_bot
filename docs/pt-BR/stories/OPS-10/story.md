# OPS-10 — Separar validação CI da entrega de imagem na branch main ([issue #45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45))

[English](../../../stories/OPS-10/story.md)

**Status:** InReview
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
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`

## Resultados do QA

### Data da revisão: 2026-10-07

### Revisado por: Quinn (`$aiox-qa`)

**Gate: CONCERNS — 8,7/10.** O comportamento dos workflows e os gates externos do GitHub passaram no commit revisado. A própria story ainda contém notas técnicas obsoletas e uma tarefa de verificação do GitHub marcada como pendente; portanto, a documentação bilíngue ainda não registra com precisão o estado entregue.

**Revisão:** `edd99ee940578019c9f777ce0b22b66b1f88cf4a` (PR #46; o HEAD da PR corresponde ao commit).

**Evidências independentes do GitHub:** a execução de Actions `37690120672` da PR foi concluída com sucesso: os 11 jobs passaram, incluindo smoke tests de instalador Linux/macOS/Windows, integração Vitest/PostgreSQL/Compose, configuração Compose e build da imagem de produção, lint de workflows/OpenGrep/validadores de versão e localização, e o agregado `CI quality gates / Required quality gate`. A inspeção somente leitura do ruleset ativo `main-pr-and-ci` (ID `24656777`) confirma que seu único contexto obrigatório é exatamente `CI quality gates / Required quality gate`.

**Revisão da implementação:** o CI de PR apenas chama o workflow reutilizável de qualidade; não tem permissão `packages: write` nem job de publicação de imagem. O CD da main chama os mesmos gates, limita `packages: write` ao publicador, serializa a publicação sem cancelamento, publica imagens imutáveis com SHA e arquitetura, imagens com identidade exata do produto e manifest multi-plataforma, e só avança as tags móveis `main` depois de confirmar que a origem ainda é atual. O workflow de release verifica a execução bem-sucedida de `main-cd.yml` para o SHA exato. Os testes de contrato cobrem essas propriedades. Os gates locais informados pelo implementador são 88 arquivos / 727 testes, lint, typecheck, OpenGrep (0 achados), actionlint, validadores de versão/localização, configuração do Compose e diff-check; esta revisora não repetiu a suíte nem comandos Docker.

**Achado:**

1. **Médio — DOC-OPS10-01, as notas da story contradizem a implementação atual.** Em `Notas técnicas`, as linhas 54–57 desta story EN ainda afirmam que `ci.yml` executa em push na main, que seu publicador condicional é um check ignorado obrigatório em PR, e que o ruleset precisa ser alterado após observar o check. Hoje `ci.yml` só trata PR/execução manual, o ruleset ativo exige o agregado verificado e a publicação da main está em `main-cd.yml`. A story pt-BR contém a mesma descrição técnica obsoleta; seus Resultados do QA também ainda registravam o FAIL anterior. O critério de aceite 9 exige que story e tradução descrevam o mesmo workflow atual. Atualize essas notas e a tarefa desmarcada em ambos os idiomas antes de marcar a story como Done.

**Revisão dos critérios:** AC 1–8 são sustentados pelos workflows, testes de contrato e execução bem-sucedida da PR. AC 10 é sustentado pelo agregado Actions bem-sucedido e pela leitura do ruleset ativo. AC 9 ainda não foi totalmente atendido até atualizar as notas/tarefa da story e sincronizar o registro QA em português. Integração Twitch real não faz parte do escopo desta OPS.

**Ciclo de vida:** o status da story permanece `InProgress`; o gate de ciclo de vida do QA exige `InReview` antes de transicionar, e a story não tem uma seção `Change Log`. Conforme as regras do gate, esta revisão atualiza somente Resultados do QA e não altera os campos de ciclo de vida. Nenhum comando Docker ou alteração de volume foi realizado.
