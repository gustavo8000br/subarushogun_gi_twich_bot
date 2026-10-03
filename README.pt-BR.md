# Bot de filas da Twitch para Genshin Impact

[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Node.js 24.20.0](https://img.shields.io/badge/Node.js-24.20.0-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![TDD](https://img.shields.io/badge/testes-Red%E2%86%92Green%E2%86%92Refactor-bb3333)](docs/stories.md)

[English](README.md) | Português (Brasil)

Um bot local e auto-hospedado para gerenciar filas de Genshin Impact pela Twitch. O projeto está sendo construído para permitir que um streamer mantenha várias filas personalizadas, com os dados em um PostgreSQL no próprio computador.

> **Estado do desenvolvimento:** fundação alpha. Docker Compose, PostgreSQL, migrations Prisma, estado local de saúde e identidade de versão já estão disponíveis. Domínio das filas, autorização e eventos Twitch, comandos de chat, recuperação financeira e painel do operador ainda estão em desenvolvimento. Este repositório é privado e a versão atual não está pronta para operar filas durante uma live.

## Conteúdo

- [Princípios](#princípios)
- [O que funciona hoje](#o-que-funciona-hoje)
- [Requisitos](#requisitos)
- [Primeira execução](#primeira-execução)
- [Operação diária](#operação-diária)
- [Atualização](#atualização)
- [Estado da configuração Twitch](#estado-da-configuração-twitch)
- [Desenvolvimento](#desenvolvimento)
- [Como contribuir](#como-contribuir)
- [Commits e versionamento](#commits-e-versionamento)
- [Solução de problemas](#solução-de-problemas)
- [Roadmap](#roadmap)
- [Dados e segurança](#dados-e-segurança)
- [Documentação](#documentação)
- [Licença](#licença)

## Princípios

- **Dados sob controle local:** a aplicação foi projetada para rodar no computador do streamer. Não possui backend hospedado pelo projeto, banco remoto, sincronização ou telemetria.
- **Operações recuperáveis:** ordem e operações de pontos são projetadas para sobreviver a reinícios do processo e da máquina. A outbox financeira e a reconciliação ainda não foram implementadas.
- **Privilégio mínimo:** a integração planejada usa o aplicativo e a conta do streamer, com os escopos necessários para resgates e chat.
- **Sem credenciais do jogo:** o bot não solicita nem manipula senhas de Genshin. Um UID visível é um identificador público do jogo, não uma credencial.
- **Teste primeiro:** mudanças de comportamento seguem Red → Green → Refactor. Consulte o [registro das stories](docs/stories.md) para ver comandos e resultados observados.

## O que funciona hoje

A fundação atual oferece:

- Stack Compose com geração inicial de segredo, PostgreSQL, migrations Prisma e serviço Fastify.
- Um painel local provisório e `GET /health`, que informa a versão em execução, conectividade do banco e se credenciais para a API Twitch foram configuradas.
- Volumes persistentes para banco e segredos. A porta do banco não é publicada no host; a aplicação usa `127.0.0.1:3000` por padrão.
- Scripts para validar/materializar versão e o schema/migration inicial do Prisma.

A versão atual ainda **não** conecta à Twitch, cria recompensas, recebe resgates, opera filas, oferece assistente de instalação ou administra filas por um painel concluído. Não use esta versão para operar filas durante uma live.

## Requisitos

- Docker Engine ou Docker Desktop com Docker Compose v2.
- Um navegador no mesmo computador.
- Acesso à internet na primeira construção para baixar imagens e dependências fixadas.

Node.js, PostgreSQL e compilador não são necessários para executar a aplicação com Compose. Node.js é necessário para desenvolvimento e verificações locais; o repositório fixa a versão `24.20.0`.

## Primeira execução

1. Clone este repositório privado ou extraia uma cópia do projeto recebida de alguém.
2. Abra um terminal na pasta do projeto. No Linux/macOS, se necessário, dê permissão de execução ao script uma vez com `chmod +x iniciar.sh`.
3. Inicie a stack:

   ```sh
   ./iniciar.sh
   ```

   No Windows, execute `iniciar.bat` na pasta do projeto. Os dois scripts constroem e iniciam os serviços do Compose, aguardam o endereço local responder e abrem o navegador quando o sistema oferece um comando de abertura.

   Para executar o mesmo fluxo diretamente:

   ```sh
   docker compose up --build -d
   ```

4. Acesse [http://localhost:3000](http://localhost:3000). A tela atual é provisória; o assistente de configuração Twitch ainda está em desenvolvimento.
5. Confira a saúde dos serviços:

   ```sh
   curl http://localhost:3000/health
   ```

   A resposta atual se parece com:

   ```json
   {
     "status": "ok",
     "product_version": "v0.1.0-0000000-alpha",
     "dependencies": {
       "database": "connected",
       "twitch_api": "not_configured"
     }
   }
   ```

   O SHA zerado é o marcador documentado usado antes de materializar um commit Git de origem na imagem. Isso não indica uma release.

### Porta local avançada

A porta `3000` não é alterada automaticamente se estiver ocupada. Escolha explicitamente outra porta do host e, quando a configuração Twitch estiver disponível, registre o callback correspondente:

```sh
APP_PORT=3217 docker compose up --build -d
```

No PowerShell:

```powershell
$env:APP_PORT = "3217"
docker compose up --build -d
```

O endereço passa a ser `http://localhost:3217` e o callback OAuth correspondente será `http://localhost:3217/callback`. O assistente Twitch ainda não está implementado.

## Operação diária

Execute estes comandos na pasta do projeto:

| Tarefa | Comando |
| --- | --- |
| Ver estado dos serviços | `docker compose ps` |
| Acompanhar todos os logs | `docker compose logs -f` |
| Acompanhar logs do bot | `docker compose logs -f bot` |
| Parar contêineres preservando dados | `docker compose stop` |
| Iniciar contêineres parados | `docker compose start` |
| Parar/remover contêineres e rede, preservando dados | `docker compose down` |
| Iniciar reconstruindo a imagem | `docker compose up --build -d` |

O banco e os segredos operacionais ficam em volumes nomeados do Docker. `docker compose down` preserva esses volumes. **Não use `docker compose down -v` na operação normal:** remover os volumes apaga os dados locais e a senha gerada para o banco. Ainda não existe fluxo de backup/exportação no produto; faça um backup apropriado antes de qualquer manutenção manual do armazenamento.

## Atualização

Para uma cópia obtida do Git e com acesso ao repositório:

```sh
git pull --ff-only
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 migrate bot
curl http://localhost:3000/health
```

O Compose reconstrói a imagem e executa as migrations Prisma pendentes antes de iniciar o bot. Os volumes persistentes de banco e segredos são mantidos. Quando houver releases publicadas, leia as notas antes de atualizar; o projeto está em alpha e ainda não tem canal de releases publicado. Se configurou uma `APP_PORT` personalizada, use o mesmo valor ao iniciar ou atualizar.

Para futuras imagens distribuídas, siga as instruções com versão fixa da release correspondente. Não faça pull de uma tag não fixada `latest`.

## Estado da configuração Twitch

As credenciais Twitch e o OAuth devem ser configurados pelo painel local, sem copiar valores para `.env` ou arquivos YAML. O assistente, o fluxo OAuth, a persistência de tokens renovados, a gestão de recompensas, o EventSub e a integração de chat ainda não foram implementados. Nunca grave Client Secret, token de acesso, código de autorização ou senha do banco em arquivo versionado, issue, captura de tela ou mensagem de chat.

O callback planejado é `http://localhost:3000/callback`. Quando o assistente estiver pronto, o streamer precisará registrar um aplicativo Twitch confidencial com esse callback exato e atender os requisitos de segurança da conta Twitch. Consulte [Integrações](docs/integrations.md) para o plano de APIs e a documentação oficial consultada.

## Desenvolvimento

O produto é um monólito JavaScript ESM organizado por responsabilidade:

```text
apps/
  api/       API Fastify, domínio, schema e migrations Prisma
  infra/     Docker Compose e scripts operacionais
  web/       Painel estático no navegador
tests/       Testes unitários e de integração PostgreSQL
docs/        Stories, decisões e documentação operacional
```

Use Node.js `24.20.0` e npm. Os testes de integração PostgreSQL usam um banco/contêiner isolado, separado do volume persistente da aplicação.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run review:static
docker compose config --quiet
```

A revisão estática usa OpenGrep `1.30.0` com regras locais do repositório em `.opengrep/rules.yml`. Ela roda localmente, sem conta ou serviço de revisão hospedado. Instale a versão fixada pela [página oficial de releases do OpenGrep](https://github.com/opengrep/opengrep/releases) e disponibilize `opengrep` no `PATH`. Essa é uma análise estática baseada em regras, não uma revisão de código por IA; revisões humanas e AIOX continuam necessárias.

Antes de implementar um comportamento, escreva um teste que demonstre a ausência desse comportamento, execute-o e registre o resultado Red observado. Depois implemente a menor mudança, execute novamente os testes afetados e refatore mantendo os testes verdes. Registre comandos e resultados reais nos documentos de stories em inglês e pt-BR. Não afirme que um teste ou integração foi validado se não foi executado.

## Como contribuir

O repositório é privado; contribuições exigem acesso. Comece pelas [stories FND-1 a FND-6](docs/stories.md) e seus critérios de aceite. Combine o escopo na issue GitHub correspondente antes de iniciar trabalho que altere comportamento do produto ou arquitetura.

Expectativas para contribuições:

1. Mantenha o código da aplicação em JavaScript ESM com JSDoc; não adicione TypeScript, transpiler ou bundler de frontend.
2. Siga Red → Green → Refactor antes de cada comportamento, correção ou mudança de requisito. Use testes reais de integração PostgreSQL para restrições e garantias transacionais.
3. Mantenha Twitch, banco e chat nas fronteiras dos módulos existentes; use fakes para comportamento remoto Twitch e PostgreSQL de teste real quando persistência for o contrato.
4. Atualize a documentação afetada em inglês e sua equivalente em `docs/pt-BR/`. Mantenha comandos, caminhos, IDs de stories, datas e evidências equivalentes.
5. Nunca envie `.env`, volumes Docker, dumps de banco, credenciais/tokens Twitch ou payloads brutos de chat/resgate.
6. Atualize checklist e lista de arquivos da story correspondente; explique verificações que não puderam ser executadas.

Execute as verificações de qualidade da seção [Desenvolvimento](#desenvolvimento) antes de pedir revisão. Lint, typecheck, testes, validação do Compose e evidências da story devem corresponder à mesma revisão avaliada.

## Commits e versionamento

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) com um resumo curto e direto:

```text
<tipo>(<escopo opcional>): <resumo>
```

Exemplos:

```text
feat(queue): add atomic manual ordering
fix(outbox): retry uncertain redemption updates safely
docs(readme): explain first run and upgrades
test(domain): cover called-to-in-progress transition
```

Tipos comuns: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci` e `chore`. Use `!` ou o rodapé `BREAKING CHANGE:` para uma mudança incompatível em contrato ou comportamento público. Commits não alteram a versão automaticamente. O projeto usa SemVer separado de estágio de release e da identidade materializada de runtime; releases, tags e promoção de estágio seguem [`docs/VERSIONING.md`](docs/VERSIONING.md) e são responsabilidade do workflow DevOps.

## Solução de problemas

### O endereço do painel não abre

Execute `docker compose ps` e `docker compose logs --tail=150 bootstrap db migrate bot`. Confira se o Docker está em execução e se a porta do host está livre. Se `3000` estiver ocupada, configure `APP_PORT` explicitamente como mostrado acima; o aplicativo não escolhe outra porta silenciosamente.

### O bot não está saudável

Confira `docker compose ps` e `docker compose logs -f bot db migrate`. O serviço `bot` aguarda o banco saudável e a conclusão bem-sucedida das migrations. `/health` informa conectividade do banco e configuração Twitch separadamente. `not_configured` para Twitch é esperado até que o assistente e a integração estejam implementados.

### Uma migration ou construção da imagem falhou

Leia os logs de `migrate` e `bot` e, depois de corrigir a causa informada, tente novamente com `docker compose up --build -d`. Não remova volumes para contornar uma falha de migration sem explicação; preserve o banco para investigar o problema.

### A inicialização não abriu o navegador

Abra `http://localhost:3000` manualmente. Se o sistema não tiver um comando compatível para abrir o navegador, o script de início imprime o endereço.

## Roadmap

| Story | Escopo | Estado |
| --- | --- | --- |
| FND-1 | Documentação bilíngue da fundação e verificação da inicialização/encerramento Compose | Em andamento |
| FND-2 | Domínio das filas, UID, parser, autorização e ordenação PostgreSQL | Em andamento |
| FND-3 | Outbox financeira durável, tentativas, confirmação e recuperação | Planejada |
| FND-4 | Credenciais Twitch, OAuth, recompensas, EventSub e reconciliação | Planejada |
| FND-5 | Comandos, chamadas, timeout, confirmação de limpeza, conta atual e serviços de aplicação compartilhados com o painel ([issue #1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Planejada |
| FND-6 | Planejamento UX com referências reais de painéis, seguido por painel completo do streamer, assistente, API protegida e segurança local ([issue #6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Planejada |

O registro das stories é a fonte de detalhes de estado e evidências de teste. Uma funcionalidade não está concluída apenas porque aparece neste roadmap.

## Dados e segurança

A instalação prevista é local e atende um canal. Dados e segredos ficam em volumes Docker locais e podem conter informações operacionais sensíveis. Persistência em volume não garante criptografia em repouso. Mantenha o projeto e os dados Docker sob controle da sua conta, proteja backups e não envie volumes, dumps, `.env` ou logs sensíveis ao GitHub.

O produto não precisa de login ou senha de Genshin. A validação planejada aceita UID ASCII com nove dígitos nesta versão; não é uma afirmação universal sobre toda conta ou servidor de Genshin. Chat e texto de recompensa são entradas não confiáveis e não devem ser repetidos nem armazenados em formato bruto.

Se uma credencial for enviada ao Git por engano, revogue ou substitua-a imediatamente e avise os mantenedores de forma privada. Não cole o segredo em uma issue pública.

## Documentação

- [README em inglês](README.md)
- [Stories e evidências TDD](docs/stories.md) · [pt-BR](docs/pt-BR/stories.md)
- [Integrações Twitch e infraestrutura](docs/integrations.md) · [pt-BR](docs/pt-BR/integrations.md)
- [Versionamento e releases](docs/VERSIONING.md) · [pt-BR](docs/pt-BR/VERSIONING.md)
- [Mudanças para usuários](CHANGELOG.md) · [pt-BR](docs/pt-BR/CHANGELOG.md)
- [Mudanças internas](CHANGELOG_INTERNAL.md) · [pt-BR](docs/pt-BR/CHANGELOG_INTERNAL.md)

## Referências operacionais

A estrutura deste guia foi inspirada por projetos públicos reais, sem copiar a documentação deles: a [introdução do Streamer.bot](https://docs.streamer.bot/get-started/introduction) é um exemplo útil de como explicar controle local e conexões diretas com provedores; o [PhantomBot](https://github.com/PhantomBot/PhantomBot) deixa instalação e operação segura acessíveis a quem hospeda por conta própria; e o [Twitch Voxer](https://github.com/w0rxbend/twitch-voxer) ilustra instruções Compose de primeira execução, logs, atualização e persistência de dados. A arquitetura e a configuração de credenciais desses projetos não foram adotadas integralmente; este projeto mantém os requisitos próprios para assistente local e gestão de segredos.

## Licença

Ainda não foi publicada uma licença. Até que os mantenedores escolham e adicionem uma, o código não recebe por padrão autorização para redistribuição ou reutilização.
