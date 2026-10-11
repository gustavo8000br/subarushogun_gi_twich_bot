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

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<arquivo-de-teste>.test.js
```

`npm run build` constrói a imagem implantável do bot com Docker Compose. O app web vanilla é verificado diretamente e não tem etapa separada de bundler frontend. O [workflow CI do GitHub Actions](../../.github/workflows/ci.yml) roda em pull requests e chama os gates compartilhados de qualidade. A publicação de imagem da main e as releases com tag usam workflows separados; consulte o [guia CI/CD](CI-CD.md) para gatilhos, permissões, tags de imagem e recuperação.

## Estrutura do projeto

```text
apps/api/    API Fastify, domínio, schema e migrations Prisma
apps/infra/  Compose e scripts operacionais
apps/web/    Painel estático e catálogos de localização
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
