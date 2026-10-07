# CI e entrega de imagens

[English](../CI-CD.md) · [Voltar ao README](../../README.pt-BR.md)

Este guia explica como se relacionam as verificações das pull requests, a publicação da imagem da main e as releases com tag. Os workflows ficam em `.github/workflows/` e usam Actions fixadas por SHA, permissões mínimas, `npm ci` e o workflow compartilhado de qualidade.

## Responsabilidade dos workflows

| Workflow | Gatilho | Responsabilidade | Permissão para publicar no registry/release |
| --- | --- | --- | --- |
| `ci.yml` | Pull request destinada à `main`; execução manual | Chama `quality-gates.yml` e apresenta um único check agregado estável | Nenhuma |
| `quality-gates.yml` | Reutilizável por `workflow_call` | Lint e typecheck de API/infra/web, lint/typecheck compartilhados, smoke test do instalador em Linux/macOS/Windows, Vitest com PostgreSQL/Compose, OpenGrep/versão, validação Compose e build da imagem de produção | Nenhuma |
| `main-cd.yml` | Push para `main` | Executa novamente os gates compartilhados para o commit mesclado e publica imagens Linux validadas | `packages: write` somente no job publicador |
| `release.yml` | Push de tag de versão `v*` | Valida tag/origem e CD bem-sucedido da main, gera instaladores nativos e publica notas bilíngues | `contents: write` somente no job de release |

Pull requests nunca executam o publicador GHCR. O ruleset ativo `main-pr-and-ci` exige o check estável do workflow reutilizável; não exige o job de publicação exclusivo da main. O GitHub nomeia checks reutilizáveis como `<job chamador> / <job reutilizável>`, então o contexto obrigatório é conferido numa execução real de PR.

O workflow compartilhado termina com um job agregado que exige sucesso em todas as validações. Falha, cancelamento ou job constituinte ignorado fazem o agregado falhar. Os arquivos de smoke test dos instaladores são temporários e não são enviados como artefatos na CI comum; somente o workflow de release envia os instaladores testados `.bat`, `.command` e `.sh`.

## Tags e segurança da publicação

O padrão de `compose.yaml` é `IMAGE_TAG=main`.

| Tag | Significado |
| --- | --- |
| `main` | Manifest móvel AMD64/ARM64 do commit mais recente validado da main |
| `main-linux-amd64`, `main-linux-arm64` | Tags móveis de arquitetura única dessa origem validada |
| `<sha-completo-do-commit>-linux-amd64`, `<sha-completo-do-commit>-linux-arm64` | Imagens imutáveis usadas para promover tags com segurança |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE` | Manifest AMD64/ARM64 versionado, materializado a partir do commit exato |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE-linux-amd64`, `...-linux-arm64` | Imagens versionadas de arquitetura única |

O publicador enfileira execuções da main sem cancelar uma publicação ativa. Primeiro constrói imagens imutáveis por arquitetura/commit, confere se a origem ainda é o commit atual da `main` e só então promove as tags móveis por arquitetura e o manifest multiplataforma. Uma execução superada pode deixar imagens versionadas imutáveis disponíveis, mas não pode retroceder as tags compartilhadas `main`. Reexecutar uma publicação falha para a mesma origem é seguro; as tags imutáveis identificam exatamente aquela origem.

O build usa caches do GitHub Actions separados por arquitetura. As imagens `main` são publicadas continuamente a partir de merges validados; uma GitHub Release e seus instaladores só são criados por uma tag de versão após a validação de release. Publicar uma imagem `main` não cria release nem promove `.release-stage`.

## Falhas, nova tentativa e retorno

- Gate de qualidade com falha bloqueia publicação. Corrija a origem e envie outro commit, ou reexecute o workflow falho depois de confirmar que a origem e dependências não mudaram.
- Falha no build/publicação de imagem aparece em `Main CD`; após resolver uma causa transitória, reexecute o workflow para o mesmo commit. As tags main só são promovidas quando as imagens das duas arquiteturas estiverem disponíveis e a verificação confirmar que a origem continua atual.
- Uma release com falha não conclui parcialmente: os instaladores nativos precisam passar e a origem exata da tag precisa ter CD bem-sucedido. Resolva a causa e reexecute o workflow da mesma tag.
- Para voltar uma instalação, selecione uma identidade completa de imagem publicada anteriormente como `IMAGE_TAG` no Compose ou reinstale o instalador correspondente àquela tag. Não sobrescreva nem reaproveite uma versão publicada. Siga as práticas normais de backup antes de alterar uma instalação ativa.

## Referências oficiais consultadas

Consulta realizada em 2026-10-07:

- [Workflows reutilizáveis](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — contrato do workflow compartilhado de qualidade.
- [Sintaxe de workflows e concorrência](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — `queue: max`, serialização e não cancelamento.
- [Diagnóstico de rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules) — nome de contexto obrigatório em workflows reutilizáveis.
- [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks) — comportamento de status de jobs ignorados.
- [Uso seguro do GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) — Actions fixadas e orientação de permissões.

Consulte também [configuração de desenvolvimento](DESENVOLVIMENTO.md), [versionamento e releases](VERSIONING.md) e o [roadmap](ROADMAP.md).
