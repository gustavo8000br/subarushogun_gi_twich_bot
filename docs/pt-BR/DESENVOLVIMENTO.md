# Guia de desenvolvimento

[English](../DEVELOPMENT.md) · [Voltar ao README](../../README.pt-BR.md)

Versão atual: `0.3.0-beta`. Situação por plataforma (2026-10-21): validado por uma pessoa somente no Ubuntu Linux; o Windows está planejado; **o macOS não foi validado** (o CI roda apenas o smoke do instalador em `macos-15`).

## 1. Requisitos

- Node.js `24.20.0` (fixado no `package.json`; não troque) e npm.
- Docker Engine/Desktop com Compose v2 (PostgreSQL descartável, verificações do Compose).
- OpenGrep `1.30.0` no `PATH` para o gate de análise estática.
- Credenciais da Twitch não são necessárias para a suíte automatizada.

## 2. Como rodar tudo

```sh
npm ci                     # uma vez após clonar ou quando o lockfile mudar
npm run dev                # igual a npm run dev:start
```

O `npm run dev` verifica Node, dependências e Docker, sobe um PostgreSQL isolado, faz snapshot antes das migrations e inicia o Fastify (somente API, `127.0.0.1:${APP_PORT:-3109}`) e o painel Next.js com HTTPS e hot reload em `https://localhost:${NEXT_DEV_PORT:-3000}`. **Abra sempre `https://localhost:3000`, nunca `127.0.0.1`** (a origem HTTPS de desenvolvimento usada na validação de sessão e CSRF é `localhost`). O overlay do OBS é a rota `/overlay` do Next (não existe `/overlay.html`).

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run dev:start` | API + Next + PostgreSQL descartável (veja acima) |
| `npm run dev:stop` | para os processos de desenvolvimento **e apaga o volume do banco de desenvolvimento** (os snapshots em `.local/dev-db/backups/` são mantidos) |
| `npm run dev:stop -- --keep-data` | para os processos e só o contêiner `db`; mantém os volumes |
| `npm run dev:db:start` / `dev:db:stop` | inicia ou para só o banco de desenvolvimento (mantém os dados) |
| `npm run build` | constrói a imagem implantável (`compose.yaml` + `compose.build.yaml`) |
| `npm run build:frontend` | constrói só o frontend Next.js |

Pontos importantes:

- O banco de desenvolvimento usa a porta `55432` do host, em um projeto Compose chamado `queuebot-dev-<últimos 28 caracteres do caminho do checkout>`. Dois checkouts que terminam com o mesmo texto devem definir valores diferentes de `DEV_COMPOSE_PROJECT` (letras minúsculas, dígitos, `-`, `_`; até 63 caracteres). Senha e snapshots ficam em `.local/dev-db/`, separados do `compose.yaml` do produto.
- A primeira execução cria o `.env.product.local` ignorado a partir do `.env.product.example` (nunca sobrescreve). Um `DATABASE_URL` explícito pula o Docker e as migrations automáticas: use só um banco descartável. Defina `APP_PORT` e `FASTIFY_DEV_ORIGIN` juntos para mudar a porta da API.
- O Next faz proxy de `/api/*`, `/overlay/api/*`, `/health` e `/callback` para o Fastify (`apps/frontend/scripts/dev-proxy-config.mjs`). No Codespaces, encaminhe a porta `3000`; a configuração de desenvolvimento aceita o host exato do Codespaces. Reinicie ao mudar a origem de desenvolvimento ou a configuração do Next.
- O `dev:stop` recusa remover qualquer coisa a menos que o arquivo seja o `compose.dev.yaml` na raiz do repositório, o projeto tenha o prefixo `queuebot-dev-` e todo contêiner/volume tenha o rótulo `com.docker.compose.project` correspondente. Com `DATABASE_URL` explícito, só para os processos.
- Nunca rode `docker compose down -v` a menos que queira apagar os dados de desenvolvimento. As imagens locais do Compose usam `IMAGE_TAG=dev`; nunca publique essa tag.

## 3. Testes e gates

O `@dev` testa durante a implementação (test-first: Red, Green, Refactor). O `@qa` roda a bateria completa de forma independente **uma vez, ao fim da story ou do pacote**; não há commit de fatia antes desse gate. O CI do GitHub só confirma o que o `@qa` já rodou.

```sh
npm run lint && npm run typecheck && npm test
npm run review:static                 # OpenGrep, único revisor estático
npm run validate:version && npm run validate:localization && npm run validate:port-denylist
docker compose config --quiet
npm test -- --run tests/unit/<arquivo>.test.js   # um arquivo
npm run lint:api && npm run typecheck:api        # por área: api, infra, frontend
npm run lint:frontend && npm run typecheck:frontend
```

Garantias de PostgreSQL exigem testes de integração em um PostgreSQL isolado com migrations reais (nunca SQLite nem mocks do Prisma); eles provisionam recursos descartáveis e não podem tocar os volumes ativos do produto.

### Scripts de navegador (`*-browser-only`)

Catorze scripts executam o painel ou o overlay no Chrome local contra o preview Next em execução, com toda resposta da API interceptada por fixtures. Eles nunca escrevem no PostgreSQL, na Twitch, no Docker nem no OBS, e **não** são evidência de OBS/CEF nativo, axe nem tecnologia assistiva. Inicie `npm run dev` e rode um deles, por exemplo:

```sh
APP_ORIGIN=https://localhost:3000 npm run test:e2e:overlay:browser-only
```

Scripts (todos chamados `test:e2e:<nome>:browser-only`, exceto `overlay:parity-browser-only`): `overlay`, `overlay:parity`, `queue-lifecycle`, `queue-outcome`, `queue-call-resend`, `queue-settings`, `queue-reward-settings`, `manual-entry`, `manual-entry-outcomes`, `queue-reward-resolution`, `queue-creation`, `queue-creation-accepted`, `widget-link`, `panel-layout`. `CHROME_CHANNEL` escolhe o navegador. O `npm run test:e2e:overlay` separado é o cenário completo conectado ao OBS e pode criar ou remover fontes do OBS e dados descartáveis do Compose.

### OBS nativo (Linux, Flatpak ou não)

As verificações de OBS/CEF nativo e da Twitch ao vivo são feitas pelo `@qa` no canal de teste do proprietário, seguindo o [roteiro de OBS nativo](stories/OPS-25/obs-native-runbook.md) (backup da coleção de cenas primeiro; caminho Flatpak `~/.var/app/com.obsproject.Studio/config/obs-studio/basic/scenes/`; sem iniciar transmissão e sem resgate real sem o OK explícito do proprietário). Links de widget nunca são escritos em documentos, logs ou commits.

## 4. O que fazer ao mudar X

| Você muda | Faça |
|---|---|
| Comportamento (qualquer código) | Escreva primeiro o teste que falha; registre o comando exato e o resultado na story bilíngue ([Contribuição](CONTRIBUICAO.md)) |
| UI do painel ou do overlay | Planeje e revise com o `@ux-design-expert` (mínimo 9,0/10); atualize o script `*-browser-only` correspondente; localize em en, es e pt-BR (`npm run validate:localization`) |
| Schema do banco | Passe pelo `@data-engineer`; migration Prisma + teste de integração em PostgreSQL isolado |
| Comandos de chat | Atualize o catálogo de comandos e as mensagens nos três idiomas; mantenha `ping`/`status` como comandos de sistema |
| Scripts, portas, Compose | Atualize este guia, o `README.md`, o par en e os testes de contrato (`tests/unit/documentation-contract.test.js`) |
| Versão ou changelog | Siga `docs/pt-BR/VERSIONING.md` e o `AGENTS.md`; atualize o changelog em en e pt-BR juntos; `npm run validate:version` |
| Qualquer documento | Mantenha a paridade en/pt-BR e os links relativos |

## 5. Estrutura do projeto

```text
apps/api/       API Fastify, domínio, schema Prisma e migrations
apps/frontend/  Painel Next.js App Router e overlay do OBS (único painel; não existe apps/web)
apps/shared/    Módulos compartilhados por Next e API (helpers do painel, catálogos de localização)
apps/infra/     Compose e scripts operacionais
tests/          Testes unitários, de integração e de aceitação em navegador
docs/           Stories, processo, pesquisa e referências (docs/archive guarda o histórico longo)
```

## 6. GitHub Codespaces

O Dev Container (`.devcontainer/devcontainer.json`, `post-create.sh`) instala Node.js `24.20.0`, Docker Engine com Docker Compose v2, GitHub CLI, OpenGrep `1.30.0`, Codex CLI `0.161.0` e roda `npm ci`. O Codespace tem seu próprio daemon e armazenamento Docker, então não alcança volumes do seu computador. Abra a branch no GitHub, escolha **Code → Codespaces → Create codespace on …** e aguarde o post-create terminar. Uma máquina de 4 núcleos é um bom ponto de partida; pare o Codespace ao terminar. O Codex vem instalado, mas sem login: execute `codex login --device-auth` e depois `codex`. Nenhum dado de produto, token da Twitch ou credencial do host é copiado. Referências: [configuração do Dev Container](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), [Docker-in-Docker](https://github.com/devcontainers/features/tree/main/src/docker-in-docker), [Codex CLI](https://developers.openai.com/codex/cli), [instalação do OpenGrep](https://github.com/opengrep/opengrep/blob/main/INSTALL.md).

## 7. CI e entrega

O `compose.yaml` é a configuração de runtime somente com pull usada pelo instalador. O [CI](../../.github/workflows/ci.yml) roda em pull requests e chama os gates de qualidade compartilhados; a publicação da imagem da main e os releases com tag são workflows separados (veja o [guia de CI/CD](CI-CD.md)). Quem usa o produto instala uma imagem pré-compilada com o instalador da plataforma; mantenedores constroem localmente com `npm run build`. Commits, push e PRs pertencem ao `@devops`, depois do veredito do `@qa`.

## 8. Níveis de log de diagnóstico da API

A API lê `APP_LOG_LEVEL` pelo Compose (padrão `info`). Níveis, do mais grave ao menos grave: `emergency`, `alert`, `critical`, `error`, `warn`, `notice`, `info`, `verbose`, `debug`, `trace`; um limite inclui o próprio nível e os mais graves. O diagnóstico de vínculo de resgates registra contagens agregadas em `info` e códigos seguros de divergência em `verbose`; resgates, títulos, IDs, prompts, tokens e mensagens de erro brutos da Twitch nunca são registrados.

```sh
APP_LOG_LEVEL=verbose docker compose up -d --force-recreate bot
docker compose logs -f bot
```

PowerShell: defina antes `$env:APP_LOG_LEVEL = 'verbose'`. Para voltar: `APP_LOG_LEVEL=info docker compose up -d --force-recreate bot`. Esses comandos recriam só o serviço do bot e preservam os volumes de banco e segredos.
