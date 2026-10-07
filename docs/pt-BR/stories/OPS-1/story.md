# Story OPS-1: Integração contínua para API, infraestrutura e web

[English](../../../stories/OPS-1/story.md)

**Complexidade:** MÉDIA
**Executor:** @dev
**Quality gate:** @qa
**Capacidade:** CI do repositório
**Issue GitHub:** [#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)

## Status

**Done**

## História

**Como** mantenedor do projeto,
**quero** que o GitHub Actions aplique lint e verificação de tipos por área, execute a suíte completa, valide versão/configuração e construa a imagem de contêiner,
**para que** pull requests recebam feedback de qualidade reproduzível antes do merge.

## Critérios de Aceitação

1. Pull requests com destino a `main` e pushes em `main` executam o workflow CI com permissões somente de leitura e execuções canceláveis por branch.
2. API, infra e web têm jobs independentes de lint e verificação JavaScript usando a versão Node fixada no projeto e `npm ci`.
3. A suíte Vitest completa executa em Linux com Docker disponível para testes reais de PostgreSQL e Compose.
4. O workflow executa OpenGrep, validação da versão, validação da configuração Compose e build da imagem Docker de produção sem exigir credenciais Twitch ou banco ativo para gerar o Prisma Client.
5. Comandos e pressupostos de build são documentados em inglês e pt-BR; os quality checks passam localmente.

## Evidências TDD

- **Contrato do workflow:** `npm test -- --run tests/unit/ci-workflow-contract.test.js` falhou primeiro com `ENOENT` para `.github/workflows/ci.yml`, comprovando que não havia contrato de CI. Após a implementação inicial, quatro assertions falharam porque o teste presumiu um formato diferente para as entradas da matriz e o comando de build; as expectativas foram corrigidas para verificar a matriz e o build da imagem pelo Compose realmente configurados.
- **Green:** o comando focado passou nos 5 testes após adicionar scripts/configurações independentes, workflow Actions somente leitura e jobs de testes/build Docker.
- **Regressão de typecheck por app:** `npm run typecheck:infra` falhou porque o projeto isolado não resolvia globais/tipos Node que eram carregados incidentalmente no projeto agregado. A dependência de desenvolvimento fixa `@types/node@24.13.6` e os tipos Node explícitos fizeram passar `npm run typecheck:api`, `npm run typecheck:infra` e `npm run typecheck:web`.
- **Verificação local final:** `npm test` — 46 arquivos, 288 testes passaram; `npm run lint`, `npm run typecheck`, os seis comandos lint/typecheck por app, `npm run review:static` (40 arquivos JS da aplicação, 0 achados), `npm run validate:version`, `docker compose config --quiet`, `docker compose build bot`, parsing YAML com Ruby para `.github/workflows/ci.yml` e `git diff --check` passaram.
- **Red/Green dos pins das Actions:** o contrato do workflow falhou primeiro porque as Actions usavam tags móveis. Após trocar pelas SHAs imutáveis correspondentes a checkout `v6.0.3`, setup-node `v7.0.0` e setup-buildx `v4.4.1`, o contrato focado passou novamente. As releases foram conferidas nos repositórios oficiais em 2026-10-05.
- QA independente revisou a execução Actions `37525101710` bem-sucedida em `c008f07` (473 testes / 69 arquivos), jobs por app e publicação da imagem. QA não reinstalou dependências nem executou novamente a suíte local no worktree de revisão; a avaliação se baseia corretamente na evidência do CI hospedado.

## Lista de Arquivos

- `.github/workflows/ci.yml`
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.api.json`, `tsconfig.infra.json`, `tsconfig.web.json`
- `tests/unit/ci-workflow-contract.test.js`
- `README.md`, `README.pt-BR.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-1/story.md`, `docs/pt-BR/stories/OPS-1/story.md`


## Resultados QA

### Data da revisão: 2026-10-06

### Revisado por: Quinn (AIOX QA)

- Revisão da revisão: `c008f07` (código atual de main antes desta PR documental).
- Critérios de aceitação: os cinco foram verificados contra `.github/workflows/ci.yml`, scripts do package, documentação atual e execução bem-sucedida do GitHub Actions [37525101710](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37525101710) em `main` (`c008f07`).
- O QA independente não reproduziu a suíte local no worktree de revisão porque as dependências não estavam instaladas. Verificou a execução bem-sucedida do GitHub Actions `37525101710` (473 testes / 69 arquivos) e inspecionou workflow e critérios. O coordenador executou separadamente os gates locais listados na mesma revisão-fonte antes desta atualização documental; após a atualização Docker/Compose, os gates locais estão sendo repetidos nesta branch.
- Validação Compose e `docker compose -p queuebot-fnd7 build bot` passaram. O build não recriou nem alterou a instalação em execução.
- A evidência do Actions inclui verificações separadas de API, infra, web e arquivos compartilhados, integração completa Vitest/PostgreSQL/Compose, gates OpenGrep/versão, build da imagem de produção e publicação AMD64/ARM64 bem-sucedida.
- Limite: nenhuma credencial ou operação real da Twitch foi usada; esta story não exige isso.

### Estado do gate

QA independente: PASS, 9,3/10 → `docs/qa/gates/OPS-1-ci-pipeline.yml`. O workflow foi mesclado na PR #12; a issue #20 foi sincronizada e encerrada após confirmar o CI verde na main, execução 37525101710.

## Registro de alterações

| Data | Versão | Alteração | Agente |
| --- | --- | --- | --- |
| 2026-10-06 | 0.5.2 | Gate QA PASS — Status: InReview → Done | @qa |
