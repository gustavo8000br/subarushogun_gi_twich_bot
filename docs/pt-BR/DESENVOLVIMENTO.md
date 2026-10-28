# Guia de desenvolvimento

[Read in English](../DEVELOPMENT.md) · [Voltar ao README](../../README.pt-BR.md)

## Requisitos

- Node.js `24.20.0` e npm.
- Docker Engine/Desktop com Compose v2 para testes de integração PostgreSQL e validação do Compose.
- Acesso Git ao repositório. A suíte automatizada não exige credenciais Twitch.
- OpenGrep `1.30.0` disponível no `PATH` para o gate local de análise estática.

## Instalar e verificar

```sh
npm ci

**Situação por plataforma (2026-10-21):** validado por uma pessoa somente no Ubuntu Linux. O Windows está planejado e será aceito pelo proprietário. **O macOS não foi validado** (sem host macOS disponível); ele compartilha a base Unix com o Linux, então o mesmo fluxo pode funcionar, mas isso é uma suposição. O CI roda apenas o smoke do instalador em `macos-15`.

npm run build
npm run lint
npm run typecheck
npm test
npm run review:static
npm run validate:version
npm run validate:localization
docker compose config --quiet
```

Os testes de integração PostgreSQL criam recursos isolados. Eles não devem usar nem apagar os volumes ativos do produto.

## GitHub Codespaces

O repositório inclui um Dev Container para desenvolvimento reproduzível no GitHub Codespaces. Ele instala Node.js `24.20.0`, Docker Engine com Compose v2 para verificações isoladas de PostgreSQL/Compose, GitHub CLI, OpenGrep `1.30.0`, Codex CLI `0.161.0` e as dependências exatas de `package-lock.json` por `npm ci`. O Codespace usa seu próprio daemon e armazenamento Docker; ele não acessa nem apaga volumes Docker do seu computador.

Para continuar em uma branch enviada ao GitHub, abra o repositório, escolha essa branch e selecione **Code → Codespaces → Create codespace on …**. O GitHub constrói `.devcontainer/devcontainer.json` e executa `.devcontainer/post-create.sh`. Aguarde essa preparação terminar antes de rodar testes. Para builds Docker e a suíte completa, um Codespace com 4 núcleos é um ponto inicial prático; disponibilidade da máquina e cobrança dependem do seu plano e cota do GitHub. Pare o Codespace quando terminar para interromper o uso de computação; o workspace é preservado quando parado.

O Codex é instalado, mas não autenticado automaticamente. No terminal do Codespace, execute `codex login --device-auth` e conclua o login no navegador. Assim, as credenciais da conta não entram no Git nem nos segredos do repositório. Execute `codex` na raiz do repositório para iniciar uma sessão. A extensão Codex para VS Code também é sugerida no Dev Container, mas o CLI funciona de forma independente.

O ambiente preparado inclui as ferramentas usadas pelos gates existentes do projeto. Ainda é necessário criar o Codespace pelo GitHub depois que esta branch for enviada; nenhum dado de produto, token Twitch, volume Docker local ou credencial do host é copiado para lá. Consulte o [guia de configuração do GitHub Codespaces](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), o [Docker-in-Docker Feature](https://github.com/devcontainers/features/tree/main/src/docker-in-docker), o [Codex CLI](https://developers.openai.com/codex/cli) e o [guia de instalação do OpenGrep](https://github.com/opengrep/opengrep/blob/main/INSTALL.md).

### Verificações focadas

#### Desenvolvimento do Next.js e Fastify

`npm run dev` nomeia o projeto Compose do PostgreSQL descartável com os últimos 28 caracteres do caminho do checkout. Se dois checkouts terminarem com o mesmo texto, defina `DEV_COMPOSE_PROJECT` (letras minúsculas, dígitos, `-`, `_`; até 63 caracteres) em cada um para que não compartilhem o volume do banco. Sem a variável, o nome e os dados atuais continuam iguais.

```sh
npm ci
npm run dev
```

Execute `npm ci` uma vez após clonar ou quando precisar reinstalar dependências; ele instala versões exatas do lockfile e não precisa rodar a cada inicialização. Antes de criar arquivos locais ou provisionar/migrar o banco, `npm run dev` verifica Node.js `24.20.0`, dependências Next/Prisma locais e (se `DATABASE_URL` estiver vazia) Docker Compose v2 com engine acessível. Uma falha informa o pré-requisito e a recuperação. Em seguida, inicia PostgreSQL isolado, cria snapshot antes das migrations, executa Fastify somente API em modo watch em `127.0.0.1:${APP_PORT:-3109}` e Next com HTTPS/HMR em `https://localhost:${NEXT_DEV_PORT:-3000}`. No Codespaces, encaminhe a porta `3000`. Next encaminha `/api/*`, `/overlay/api/*`, `/health` e `/callback` ao Fastify (`apps/frontend/scripts/dev-proxy-config.mjs:19-28`); o overlay OBS é a própria rota Next `/overlay` e não há alias `/overlay.html` (removido na Onda 3 do cutover da OPS-15). A configuração permite loopback e o hostname exato do Codespaces, enviando a origem HTTPS correspondente para validar sessão/CSRF. Reinicie após alterar a origem de desenvolvimento ou config Next. Na primeira execução, cria `.env.product.local` ignorado pelo Git a partir do exemplo, sem substituir arquivo existente. Deixe `DATABASE_URL` vazia para usar o DB gerenciado, ligado somente ao loopback da porta host `55432`, em projeto/volume Compose específico da worktree; senha e snapshots ficam em `.local/dev-db/`. Esses recursos são separados do `compose.yaml` de produto. Use `npm run dev:db:stop` para parar preservando os dados e `npm run dev:db:start` para iniciar somente o DB. Não use `docker compose down -v` se não pretende apagar dados de desenvolvimento. Um `DATABASE_URL` explícito ignora Docker e migrations automáticas; use apenas DB descartável. Ao mudar a porta da API, configure juntos `APP_PORT` e `FASTIFY_DEV_ORIGIN`. Usuários finais usam o instalador da plataforma com imagem pré-compilada; mantenedores compilam localmente com `npm run build` (Compose runtime + `compose.build.yaml`). `npm run build:frontend` compila a exportação frontend independentemente.

Imagens Compose locais usam `IMAGE_TAG=dev` por padrão. Não publique essa tag como artefato de main/release; somente o workflow validado da branch main promove `IMAGE_TAG=main`, enquanto instaladores fixam uma imagem versionada/digest validada.

```sh
npm run dev:db:start
npm run dev
# depois de terminar de desenvolver:
npm run dev:db:stop
```

`npm run dev:start` é o mesmo ponto de entrada de `npm run dev` (ambos continuam funcionando). Durante a execução, ele registra o próprio PID e os PIDs filhos da API/Next em `.local/dev-server/state.json` (ignorado pelo Git); o arquivo é removido ao encerrar.

`npm run dev:stop` encerra os processos registrados pelo `dev:start` (SIGTERM e SIGKILL após 10 segundos; no Linux confirma antes que o PID registrado ainda é o `dev-server.mjs`) e depois executa `docker compose -f compose.dev.yaml -p <projeto dev> down --volumes --rmi local` somente para o projeto de desenvolvimento. Antes de remover qualquer coisa, recusa (saída diferente de zero) a menos que o arquivo seja o `compose.dev.yaml` da raiz do repositório, o projeto seja o resolvido por `DEV_COMPOSE_PROJECT` ou pelo caminho do checkout e use o prefixo `queuebot-dev-`, e todo container/volume tenha o rótulo `com.docker.compose.project` correspondente (containers também precisam apontar para esse `compose.dev.yaml`). Ele imprime os containers, volumes e imagens removidos e termina com código 0 e uma mensagem quando nada está em execução. "Imagens" significa apenas imagens construídas localmente para o projeto dev (`--rmi local`); hoje o `compose.dev.yaml` não constrói nenhuma, então a imagem compartilhada `postgres` baixada é mantida. Com `DATABASE_URL` explícito, apenas os processos são encerrados.

> **Atenção:** `npm run dev:stop` APAGA o volume do banco de desenvolvimento, incluindo todos os dados de desenvolvimento. Os snapshots pré-migration em `.local/dev-db/backups/` são mantidos.

Para parar tudo preservando os dados, execute `npm run dev:stop -- --keep-data` (o `--` repassa a flag pelo npm). Ele encerra os processos do dev server e somente o container `db` (`stop db`), preservando volumes e imagens, com as mesmas travas de arquivo/projeto/rótulos; nunca executa `down`. Qualquer outra opção é recusada antes de parar algo. Projetos recusados por não terem o prefixo `queuebot-dev-` recebem mensagem explicando como removê-los manualmente.

Para executar o smoke seguro do overlay em Chromium contra a prévia Next ativa, use `npm run test:e2e:overlay:browser-only`. Ele requer Chrome local e intercepta todas as respostas da API do overlay com fixtures no navegador; não grava no PostgreSQL, Twitch, Docker ou OBS. Esta é apenas evidência de navegador/frontend, não aceite de API real nem de OBS/CEF nativo. O comando separado `npm run test:e2e:overlay` continua sendo o cenário conectado ao OBS e pode criar/remover fontes OBS e dados de Compose descartáveis.

Para executar o smoke Chromium QRA-23 do cancelamento de exclusão de fila, use `npm run test:e2e:queue-lifecycle:browser-only` contra a prévia Next local ativa. Ele intercepta respostas da API do painel e verifica o conflito em processamento, o alerta localizado acessível, a referência diagnóstica segura e os headers same-origin CSRF/idempotência. Não grava na API/banco do produto nem na Twitch e não é evidência de operação persistida.

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<arquivo-de-teste>.test.js
```

`compose.yaml` contém somente runtime pull-only e é consumido pelo instalador. `npm run build` combina explicitamente esse arquivo com `compose.build.yaml` para gerar a imagem; o CI usa o mesmo par. O [workflow CI do GitHub Actions](../../.github/workflows/ci.yml) roda em pull requests e chama os gates compartilhados de qualidade. A publicação de imagem da main e as releases com tag usam workflows separados; consulte o [guia CI/CD](CI-CD.md) para gatilhos, permissões, tags de imagem e recuperação.

## Estrutura do projeto

```text
apps/api/    API Fastify, domínio, schema e migrations Prisma
apps/infra/  Compose e scripts operacionais
apps/frontend/ App Router Next.js do painel e do overlay OBS
apps/web/      Arquivos do painel vanilla (não servidos desde a Onda 1 do cutover; removidos na Onda 4) e catálogos de localização (saem na Onda 2)
apps/shared/    Módulos compartilhados por Next e API (`apps/shared/panel` contém os helpers de painel/overlay; o Next não pode importar `apps/web`)
tests/       Testes unitários, integração e aceite de navegador
docs/        Stories e guias específicos de usuário/desenvolvimento
```

Para mudanças de comportamento, siga o processo test-first de [Como contribuir](CONTRIBUICAO.md) e registre as evidências na story bilíngue correspondente.

### Níveis de log de diagnóstico da API

A API aceita `APP_LOG_LEVEL` pelo Compose. O padrão é `info`; os níveis disponíveis são `emergency`, `alert`, `critical`, `error`, `warn`, `notice`, `info`, `verbose`, `debug` e `trace`. O nível escolhido inclui a própria severidade e as mais graves. O diagnóstico de associação de rewards registra totais agregados em `info` e códigos seguros dos motivos de incompatibilidade em `verbose`; rewards brutos, títulos, IDs, descrições, tokens e mensagens de erro nunca são registrados. Um nível ausente ou inválido volta para `info`.

Em um clone local do código, inicie temporariamente o bot com mais detalhes:

```sh
APP_LOG_LEVEL=verbose docker compose up -d --force-recreate bot
docker compose logs -f bot
```

No PowerShell:

```powershell
$env:APP_LOG_LEVEL = 'verbose'
docker compose up -d --force-recreate bot
docker compose logs -f bot
```

Depois, retorne ao padrão com `APP_LOG_LEVEL=info docker compose up -d --force-recreate bot` (no PowerShell, defina a variável como `info` antes do comando). Esses comandos recriam somente o serviço bot e preservam os volumes do banco e dos segredos.
