# CI e entrega de imagens

[English](../CI-CD.md) · [Voltar ao README](../../README.pt-BR.md)

Este guia explica como se relacionam as verificações das pull requests, a publicação da imagem da main e as releases com tag. Os workflows ficam em `.github/workflows/` e usam Actions fixadas por SHA, permissões mínimas, `npm ci` e o workflow compartilhado de qualidade.

## Responsabilidade dos workflows

| Workflow | Gatilho | Responsabilidade | Permissão para publicar no registry/release |
| --- | --- | --- | --- |
| `ci.yml` | Pull request destinada à `main`; execução manual | Chama `quality-gates.yml` e apresenta um único check agregado estável | Nenhuma |
| `quality-gates.yml` | Reutilizável por `workflow_call` | Lint e typecheck de API/infra/web, lint/typecheck compartilhados, smoke test do instalador em Linux/macOS/Windows, Vitest com PostgreSQL/Compose, actionlint, OpenGrep/versão/localização, validação Compose e build da imagem de produção | Nenhuma |
| `browser-only.yml` | Pull request destinada à `main`; execução manual | Roda os scripts `tests/e2e/*-browser-only.mjs` (guiados por fixtures) no Chrome contra um servidor de desenvolvimento Next descartável (D-13). Fora do agregado obrigatório de quality-gates enquanto não for bloqueante | Nenhuma (`contents: read`) |
| `main-cd.yml` | Push para `main` | Executa novamente os gates compartilhados para o commit mesclado e publica imagens Linux validadas | `packages: write` somente no job publicador |
| `release.yml` | Somente `workflow_dispatch` manual, a partir da `main`, pelo proprietário do repositório (sem gatilho de tag ou push) | Valida tag/origem e CD bem-sucedido da main, gera instaladores nativos e publica notas bilíngues | `contents: write` somente no job de release |
| `branch-cleanup.yml` | Agenda semanal (dry-run até `BRANCH_CLEANUP_ENABLED` ser `true`); disparo manual (`dry_run` vem `true`) | Apaga branches remotas já totalmente mergeadas na `main` (ver "Limpeza de branches já mergeadas") | `contents: write` só no job de apagar |

Pull requests nunca executam o publicador GHCR. O ruleset ativo `main-pr-and-ci` exige o check estável do workflow reutilizável; não exige o job de publicação exclusivo da main. O GitHub nomeia checks reutilizáveis como `<job chamador> / <job reutilizável>`, então o contexto obrigatório é conferido numa execução real de PR.

O workflow compartilhado termina com um job agregado que exige sucesso em todas as validações. Falha, cancelamento ou job constituinte ignorado fazem o agregado falhar. O linter de workflows está fixado em actionlint `1.7.12`; a integração ShellCheck fica desativada porque este gate valida os workflows do GitHub Actions. A supressão estreita para o aviso de schema `queue` é necessária porque essa versão do linter ainda não reconhece a sintaxe `concurrency.queue: max` suportada pelo GitHub. O OpenGrep `1.30.0` é instalado a partir de um commit de origem fixado em um `HOME` isolado e vazio; a assinatura do binário da release é verificada com Cosign `2.5.0`, e o instalador fixado do Cosign confere o checksum do binário baixado. Os arquivos de smoke test dos instaladores são temporários e não são enviados como artefatos na CI comum; somente o workflow de release envia os instaladores testados `.bat`, `.command` e `.sh`.

## Job de scripts browser-only (D-13)

O `browser-only.yml` roda cada script listado em `covered` no `tests/e2e/browser-only-manifest.json` por meio de `npm run test:e2e:browser-only:ci` (`tests/e2e/run-browser-scripts.mjs`). O driver cria um certificado TLS de loopback em `.local/browser-only-ci/`, sobe o `next dev` em HTTPS, executa cada script com `APP_ORIGIN` apontando para ele, imprime um resumo PASS/FAIL e sai com código diferente de zero se algum falhar. Toda resposta de API é uma fixture interceptada, então o job não usa PostgreSQL, Docker, Twitch, OBS, volumes nem segredos. O job instala o Chrome com `npx playwright-core install --with-deps chrome`.

- **Implantação:** o workflow é separado do `quality-gates.yml` e não é exigido pelo ruleset (primeiro não bloqueante). Torná-lo bloqueante depois significa incluí-lo no agregado e no ruleset, com o OK do proprietário.
- **Exclusões:** a lista `excluded` do manifesto guarda scripts que não rodam em runner hospedado (OBS/CEF nativo, Twitch real), cada um com motivo escrito. Hoje está vazia porque todos os scripts usam fixtures. Esses scripts não são evidência de OBS/CEF nativo, axe nem tecnologia assistiva.
- **Contrato:** `tests/unit/browser-only-ci-contract.test.js` falha quando um novo `tests/e2e/*-browser-only.mjs` não está em nenhuma das listas, quando um script npm não roda o seu arquivo ou quando o workflow perde gatilhos, permissões somente leitura ou Actions fixadas.
- **Rodar localmente:** `npm run test:e2e:browser-only:ci` (todos) ou `node tests/e2e/run-browser-scripts.mjs --only panel-layout` (um). Exige o Chrome local (`CHROME_CHANNEL` escolhe o navegador). Em uma worktree git cujo `node_modules` é symlink, o Turbopack falha; use `BROWSER_ONLY_NEXT_ARGS=--webpack`.

## Tags e segurança da publicação

`compose.yaml` e `compose.build.yaml` usam `IMAGE_TAG=dev` por padrão em desenvolvimento/builds locais. A configuração runtime gerada pelo instalador fixa explicitamente a imagem de release validada. Use `IMAGE_TAG=main` somente quando quiser executar intencionalmente a imagem móvel promovida pelo publicador da branch main.

| Tag | Significado |
| --- | --- |
| `main` | Manifest móvel AMD64/ARM64 do commit mais recente validado da main |
| `dev` | Tag local de desenvolvimento/build; não publicada pelos workflows main/release |
| `main-linux-amd64`, `main-linux-arm64` | Tags móveis de arquitetura única dessa origem validada |
| `<sha-completo-do-commit>-linux-amd64`, `<sha-completo-do-commit>-linux-arm64` | Tags de imagem vinculadas ao commit para promover tags móveis com segurança; tags do registry são aliases mutáveis |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE` | Manifest AMD64/ARM64 versionado, materializado a partir do commit exato |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE-linux-amd64`, `...-linux-arm64` | Imagens versionadas de arquitetura única |

O publicador enfileira execuções da main sem cancelar uma publicação ativa. Primeiro constrói imagens por arquitetura e commit e publica o manifest versionado daquela origem exata. O nome completo do SHA associa essas tags do registry a um commit; uma tag ainda pode ser movida, portanto não garante a integridade do conteúdo. Use o digest da imagem quando precisar identificar o conteúdo exato. Depois, o workflow confere se a origem ainda é o commit atual da `main` e só então promove as tags móveis por arquitetura e o manifest multiplataforma `main`. Uma execução superada mantém sua referência de imagem versionada disponível para uma release futura, mas não retrocede as tags compartilhadas `main`. Reexecutar uma publicação falha para a mesma origem é seguro como associação de código-fonte; o digest do registry identifica o conteúdo exato. Jobs de release também são serializados por tag, sem cancelamento, com até 100 execuções pendentes; quando a fila enche, o GitHub cancela novas execuções enfileiradas em vez de substituir uma pendência existente.

O build usa caches do GitHub Actions separados por arquitetura. As imagens `main` são publicadas continuamente a partir de merges validados; uma GitHub Release e seus instaladores só são criados por uma tag de versão após a validação de release. O workflow de release confere se o índice da imagem contém o commit exato da tag e grava em cada instalador `<tag-da-versão>@sha256:<digest-do-manifest>`. Se a tag GHCR mudar depois, o instalador já publicado continua usando o digest original. Publicar uma imagem `main` não cria release nem promove `.release-stage`.

## Falhas, nova tentativa e retorno

- Gate de qualidade com falha bloqueia publicação. Corrija a origem e envie outro commit, ou reexecute o workflow falho depois de confirmar que a origem e dependências não mudaram.
- Falha no build/publicação de imagem aparece em `Main CD`; após resolver uma causa transitória, reexecute o workflow para o mesmo commit. As tags main só são promovidas quando as imagens das duas arquiteturas estiverem disponíveis e a verificação confirmar que a origem continua atual.
- Uma release com falha não conclui parcialmente: os instaladores nativos precisam passar e a origem exata da tag precisa ter CD bem-sucedido. Resolva a causa e reexecute o workflow da mesma tag.
- Para voltar uma instalação, selecione uma identidade completa de imagem publicada anteriormente como `IMAGE_TAG` no Compose ou reinstale o instalador correspondente àquela tag. Não sobrescreva nem reaproveite uma versão publicada. Siga as práticas normais de backup antes de alterar uma instalação ativa.

## Limpeza de branches já mergeadas

O `branch-cleanup.yml` roda toda segunda-feira (04:17 UTC) e por disparo manual. Ele apaga branches remotas já totalmente mergeadas na `main`. A configuração `delete_branch_on_merge` do repositório cobre os merges novos; este workflow cobre branches mergeadas antes ou por outros meios. A lógica de seleção está em `apps/infra/scripts/branch-cleanup.mjs`.

- **O que apaga:** só branches cuja ponta é ancestral da `main` (`git merge-base --is-ancestor`), com commit da ponta de pelo menos 7 dias (a carência olha a data do commit da ponta, não a idade da branch: uma branch criada há muito tempo com último commit recente é mantida, e uma branch nova apontando para um commit antigo pode qualificar de imediato) e nome simples (letras, dígitos, `.`, `_`, `-`, `/`). No máximo 20 por execução, das mais antigas; o resumo avisa quando há mais.
- **O que nunca apaga:** `main` e a branch padrão, branches protegidas, cabeças de PR aberto, branches com commits fora da `main`, branches recentes e nomes com caracteres incomuns (listados como ignorados).
- **Branches mergeadas por squash não são cobertas:** o merge por squash cria um commit novo, então a ponta da branch nunca é ancestral da `main` e este workflow nunca a apaga. Essas branches saem pela configuração nativa `delete_branch_on_merge` do repositório, que já está ligada.
- **Dry-run primeiro:** o disparo manual vem com `dry_run: true` e só escreve o plano. O agendamento semanal também roda em dry-run até a variável de repositório `BRANCH_CLEANUP_ENABLED` valer exatamente `true` (sensível a maiúsculas: `TRUE`, ` true`, `1` ou vazio continuam em dry-run; o script `branch-cleanup.mjs` faz essa comparação porque o operador `==` do Actions ignora maiúsculas). Para ligar, depois de conferir o resumo de um disparo manual em dry-run: `gh variable set BRANCH_CLEANUP_ENABLED --body true` (só o proprietário ou o `@devops`). Para desligar: `gh variable delete BRANCH_CLEANUP_ENABLED` (ou qualquer outro valor).
- **Inatividade:** o GitHub desativa workflows agendados em repositórios sem atividade por 60 dias. Se a execução semanal deixar de aparecer na aba Actions, reative-a lá (ou rode manualmente).
- **Permissões:** o job `plan` lê conteúdo e pull requests; só o job `delete` tem `contents: write`. Antes de cada exclusão o job confere de novo que a branch ainda aponta para o commit planejado e que não há PR aberto para ela; caso contrário, pula a branch. Resposta vazia ou não numérica na consulta de PR aberto conta como erro (a branch é pulada e registrada), nunca como "nenhum PR".
- **Resultados:** o resumo da execução lista cada branch como `deleted`, `skipped` ou `failed` e os totais. A falha numa branch não interrompe as demais; o job termina com erro se alguma falhou. A exclusão real ainda não foi exercitada no GitHub.
- **Restaurar:** o resumo da execução lista nome, hash da ponta e data do último commit. Restaure com `git push origin <hash>:refs/heads/<branch>`.

## Referências oficiais consultadas

Consulta realizada em 2026-10-07:

- [Workflows reutilizáveis](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — contrato do workflow compartilhado de qualidade.
- [Sintaxe de workflows e concorrência](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — `queue: max`, serialização e não cancelamento.
- [Diagnóstico de rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules) — nome de contexto obrigatório em workflows reutilizáveis.
- [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks) — comportamento de status de jobs ignorados.
- [Uso seguro do GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) — Actions fixadas e orientação de permissões.
- [Instalação do OpenGrep](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md) e [binários de release assinados](https://github.com/opengrep/opengrep/releases/tag/v1.30.0) — versão fixada e verificação de assinatura Cosign.
- [Instalador Cosign v3.9.0](https://github.com/sigstore/cosign-installer/tree/v3.9.0) — instalação do CLI Cosign fixado com verificação de checksum.
- [Releases do actionlint](https://github.com/rhysd/actionlint/releases) e [uso](https://github.com/rhysd/actionlint/blob/main/docs/usage.md) — linter de workflow fixado e forma de execução.

Consulte também [configuração de desenvolvimento](DESENVOLVIMENTO.md), [versionamento e releases](VERSIONING.md) e o [roadmap](ROADMAP.md).
