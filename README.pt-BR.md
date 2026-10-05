# Bot de filas da Twitch para Genshin Impact

[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Node.js 24.20.0](https://img.shields.io/badge/Node.js-24.20.0-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![TDD](https://img.shields.io/badge/testes-Red%E2%86%92Green%E2%86%92Refactor-bb3333)](docs/stories.md)

[English](README.md) | Português (Brasil)

Um bot local e auto-hospedado para gerenciar filas de Genshin Impact pela Twitch. O projeto está sendo construído para permitir que um streamer mantenha várias filas personalizadas, com os dados em um PostgreSQL no próprio computador.

> **Estado do desenvolvimento:** alpha, implementação ativa. Compose/PostgreSQL/identidade de versão, base do domínio de filas, outbox financeira, adapters OAuth/EventSub, tratamento inicial do chat e painel/API local protegidos estão presentes. O ciclo de recompensas Twitch e várias operações exigidas permanecem incompletos. Ainda não use para operar filas durante uma live.

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
- **Operações recuperáveis:** ordem das filas e operações de pontos são planejadas para sobreviver a reinícios do processo e do computador. A outbox financeira PostgreSQL e a reconciliação Twitch estão implementadas, mas não foram verificadas em um canal real.
- **Privilégio mínimo:** a integração planejada usa o aplicativo e a conta do streamer, com os escopos necessários para resgates e chat.
- **Sem credenciais do jogo:** o bot não solicita nem manipula senhas de Genshin. Um UID visível é um identificador público do jogo, não uma credencial.
- **Teste primeiro:** mudanças de comportamento seguem Red → Green → Refactor. Consulte o [registro das stories](docs/stories.md) para ver comandos e resultados observados.

## O que funciona hoje

A fundação atual oferece:

- Stack Compose com geração inicial de segredo, PostgreSQL, migrations Prisma e serviço Fastify.
- Painel local com fluxo de configuração Twitch, criação de fila/entrada, projeção ao vivo e operações financeiras; a API usa sessão local, CSRF e verificações Host/Origin.
- `/health` informa versão do produto e estado atual do banco/integração Twitch.
- Runtime de chatbot que recebe eventos de resgate/chat da Twitch e processa comandos de fila, acompanhado de um painel local para configuração e administração do streamer. O painel é o console do operador; viewers não entram por ele.
- Base do domínio de filas, resgates, transições, outbox financeira, OAuth/EventSub/reconciliação, parser/autorização do chat e chamadas/timeout.
- Criação durável de recompensas Twitch, pausadas por padrão, com verificação de capacidade e recuperação manual auditada quando a resposta Twitch deixa ambígua a associação da recompensa.
- Volumes persistentes para banco e segredos. A porta do banco não é publicada no host; a aplicação usa `127.0.0.1:3000` por padrão.
- Scripts para validar/materializar versão e o schema/migration inicial do Prisma.

Esta versão **não está pronta para uma live**. Edição/abertura/fechamento/arquivamento/exclusão de recompensa, concorrência de propriedade da conta entre filas, idempotência/revisão integral, controles de reenvio/histórico e várias rotinas de reconciliação/resolução permanecem incompletos. A pesquisa documental UX está registrada, mas ainda não houve validação de usabilidade. Nenhuma operação Twitch foi verificada com credenciais autorizadas.

## Requisitos

- Computador **64 bits** com sistema operacional compatível, **Docker Engine ou Docker Desktop no modo de containers Linux**, plugin CLI do Docker Compose (`docker compose`, não o executável standalone legado `docker-compose`) e permissão do usuário para executar comandos Docker. Confira com `docker --version` e `docker compose version`.
- Navegador atual no mesmo computador (Chrome, Edge ou Firefox recomendados) que consiga confiar em uma autoridade certificadora local.
- Acesso à internet durante a primeira construção das imagens e enquanto o chatbot se conecta à Twitch.
- Node.js, PostgreSQL, Git e compilador **não são necessários no computador host para executar a aplicação por Compose**. Node.js `24.20.0` é fixado para desenvolvimento do projeto e executa dentro do contêiner.

### Sistemas host compatíveis

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 com Docker Engine e plugin Compose é o ambiente usado nos testes atuais de aceite Linux. Outras distribuições precisam de Docker Engine suportado, plugin Compose v2 e shell compatível com `iniciar.sh`; nem todas foram testadas.
- **Windows:** Docker Desktop para containers Linux com backend WSL 2 é a configuração prevista. O guia atual do Docker lista edições/builds Windows compatíveis, WSL 2 versão 2.1.5 ou posterior, CPU de 64 bits compatível com SLAT e virtualização habilitada no BIOS/UEFI. A lista muda; confira os [requisitos Windows atuais do Docker](https://docs.docker.com/desktop/setup/install/windows-install/) antes de instalar. Windows Server não é suportado pelo Docker Desktop.
- **macOS:** é necessário Docker Desktop para containers Linux e CLI `docker compose`; o comportamento no macOS host não foi validado nesta versão.

### Estimativas de hardware — valores aproximados

> Estes são valores **aproximados para a versão alpha atual**, não mínimos garantidos nem especificações permanentes. Docker Desktop tem requisitos próprios por plataforma. O uso real varia conforme a versão do projeto, reconstrução de imagens, sistema operacional, histórico de filas, logs e outros programas. Os requisitos podem variar por versão; vamos revisar e atualizar essas estimativas conforme as versões e o uso medido mudarem.

- CPU: aproximadamente **2 núcleos lógicos** disponíveis para o Docker; 4 núcleos deixam a primeira construção de imagem mais confortável.
- Memória: aproximadamente **4 GB disponíveis para o Docker** para aplicação e build inicial; **8 GB de RAM total é uma meta prática**, e o Docker lista 8 GB como requisito de hardware para WSL 2 no Windows atualmente.
- Disco: mantenha aproximadamente **10 GB livres** antes do primeiro build para imagens, cache de build e volumes iniciais de banco/segredo. Banco e logs podem crescer; espaço necessário depende do uso e retenção.
- Não é necessária GPU dedicada.

Os valores de hardware para Windows acima não são benchmark do produto. Eles combinam os requisitos atuais do Docker com margem aproximada para esta aplicação. Consulte os guias oficiais do [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [pós-instalação Linux e acesso ao Docker](https://docs.docker.com/engine/install/linux-postinstall/) e [plugin Compose](https://docs.docker.com/compose/install/linux/).

## Primeira execução

### Primeira execução no Windows

> A execução nativa do `iniciar.bat` ainda não foi validada por este projeto. O runtime Compose foi validado no Ubuntu; se o helper falhar no Windows, execute o comando Compose abaixo e reporte o erro exato antes de considerar a instalação Windows validada.

1. Instale ou atualize o WSL 2 e reinicie o Windows se solicitado. Em um PowerShell elevado, use `wsl --install` somente se o WSL ainda não estiver instalado; use `wsl --update` para atualizar uma instalação existente. Depois confira com `wsl --version` (2.1.5 ou posterior) e, se necessário, habilite virtualização no BIOS/UEFI.
2. Instale Docker Desktop, selecione o backend WSL 2, inicie o Docker Desktop e aguarde o engine ficar pronto. No PowerShell, confira `docker --version` e `docker compose version`. Mantenha o Docker no modo **Linux containers**.
3. Clone o repositório ou extraia o arquivo do projeto. Abra PowerShell dentro da pasta do projeto; caminhos com espaços são suportados por `iniciar.bat`.
4. Inicie a aplicação:

   ```powershell
   .\iniciar.bat
   ```

   Ou execute o comando Compose padrão:

   ```powershell
   docker compose up --build -d
   ```

5. Aguarde o primeiro build e bootstrap. O helper abre o painel quando possível e cria `.local\localhost-ca.crt` com o certificado público necessário ao navegador. Se o navegador abrir antes de confiar no certificado, feche a aba por enquanto.
6. Confie no certificado local desta instalação para o usuário Windows atual e reinicie o navegador:

   ```powershell
   Import-Certificate -FilePath (Resolve-Path '.\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

   Abra `https://localhost:3000`. Esta CA local não é pública; importe somente o certificado gerado na pasta `.local` deste projeto. Se o volume Docker de segredos for removido intencionalmente, o bootstrap criará nova CA e será preciso repetir esta etapa.

### Primeira execução no Ubuntu/Linux

1. Instale Docker Engine e o plugin Compose da sua distribuição. No Ubuntu, siga as [instruções oficiais do Docker Engine](https://docs.docker.com/engine/install/ubuntu/) e confirme que `docker compose version` funciona.
2. Clone o repositório ou extraia o arquivo do projeto e abra um terminal na pasta. Se necessário, execute `chmod +x iniciar.sh` uma vez.
3. Inicie a aplicação:

   ```sh
   ./iniciar.sh
   ```

   O helper constrói e inicia o Compose, aguarda o healthcheck HTTPS local e abre o navegador se estiver disponível. Se não conseguir abrir, imprime o endereço.

4. Confie a CA local gerada no repositório de certificados do Ubuntu e atualize o bundle:

   ```sh
   sudo install -Dm644 .local/localhost-ca.crt /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

   Reinicie o navegador e abra `https://localhost:3000`.

### Continue a configuração em qualquer plataforma

1. No painel, confira se o callback exibido é exatamente `https://localhost:3000/callback` (ou a porta avançada escolhida).
2. No [Console de Desenvolvedor da Twitch](https://dev.twitch.tv/console/apps), crie ou edite um app confidencial e registre esse callback **HTTPS exato**. Se ele foi cadastrado inicialmente como `http://localhost:3000/callback`, substitua por HTTPS. Protocolo, host, porta e caminho precisam coincidir. As credenciais Twitch devem ser inseridas somente no formulário local; não as envie em chat, issue, captura de tela ou arquivo versionado.
3. Informe Client ID e Client Secret do app no painel e clique **Validar e salvar aplicativo**. Depois clique **Conectar com a Twitch**, aprove os escopos solicitados e confira se a identidade do canal está correta.
4. Chatbot e painel têm funções diferentes: viewers entram somente por resgate de recompensa; streamer/moderadores gerenciam filas por comandos autorizados no chat, e o streamer também administra pelo painel local. Criar uma fila solicita uma recompensa personalizada real da Twitch e ocupa uma vaga no limite do canal. Não crie fila de teste em canal de produção sem intenção de criar essa recompensa.
5. Esta alpha ainda não tem edição/abertura/fechamento/arquivamento/exclusão de recompensa e não foi validada com uma conta Twitch real. Use painel/API para verificações controladas de integração; não para operar uma live sem supervisão.

Para conferir a saúde via CLI Linux depois de confiar na CA:

   ```sh
   curl --cacert .local/localhost-ca.crt https://localhost:3000/health
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

No Windows, depois de importar a CA no repositório do usuário atual, `curl.exe https://localhost:3000/health` também deve validar normalmente. Para usar curl antes da importação, passe `--cacert .\.local\localhost-ca.crt`.

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

O endereço passa a ser `https://localhost:3217` e o callback OAuth correspondente será `https://localhost:3217/callback`. O painel apresenta a mesma porta para o callback.

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
curl --cacert .local/localhost-ca.crt https://localhost:3000/health
```

O Compose reconstrói a imagem e executa as migrations Prisma pendentes antes de iniciar o bot. Os volumes persistentes de banco e segredos são mantidos. Quando houver releases publicadas, leia as notas antes de atualizar; o projeto está em alpha e ainda não tem canal de releases publicado. Se configurou uma `APP_PORT` personalizada, use o mesmo valor ao iniciar ou atualizar.

Os helpers `atualizar.sh` e `atualizar.bat` atendem uma cópia Git limpa na branch `main`. Eles buscam e avançam `origin/main` por fast-forward e então reconstroem/iniciam o Compose. Param se houver alterações locais ou outra branch; faça commit/stash do trabalho ou atualize aquela branch manualmente. Git e acesso ao repositório são necessários para esses helpers, mas não para executar o app. A execução do helper Windows ainda não foi validada em Windows nativo.

Para futuras imagens distribuídas, siga as instruções com versão fixa da release correspondente. Não faça pull de uma tag não fixada `latest`.

## Desinstalação

Execute `./desinstalar.sh` no Linux/macOS ou `desinstalar.bat` no Windows. O helper para e remove este projeto Compose e a imagem local da aplicação, preservando por padrão o banco, credenciais/tokens Twitch, senha gerada do banco e segredos TLS. Ele pergunta se deve apagar os dados; se a resposta for sim, pede que você digite `APAGAR` antes de executar `docker compose down --volumes --rmi local`. Isso apaga permanentemente os volumes Docker do projeto e remove o arquivo exportado da CA pública localhost. Os arquivos fonte do projeto são mantidos. Um `LOCAL_CERT_DIRECTORY` externo personalizado não é removido pelo helper.

Para preservar os dados explicitamente, também é possível usar `docker compose down --rmi local`. Nunca use `docker compose down --volumes` sem intenção de apagar permanentemente os dados locais das filas e os segredos operacionais.

## Estado da configuração Twitch

As credenciais Twitch e o OAuth são configurados pelo painel local, sem copiar valores para `.env` ou YAML. Validação Client Credentials e base do Authorization Code estão implementadas; não há garantia de criptografia em repouso. Código de renovação de token, EventSub, chat e reconciliação existe, mas não foi exercitado em conta autorizada. Criação durável de recompensa e recuperação de associação ambígua estão implementadas; edição, abertura/fechamento, arquivamento e exclusão ainda não. Nunca grave Client Secret, token de acesso, código de autorização ou senha do banco em arquivo versionado, issue, captura de tela ou mensagem de chat.

O callback é `https://localhost:3000/callback`. Registre um aplicativo Twitch confidencial com esse callback exato e habilite a segurança de conta exigida pela Twitch. Se o app foi cadastrado inicialmente com `http://localhost:3000/callback`, edite a URI no Console de Desenvolvedor da Twitch para HTTPS antes de conectar; protocolo, host, porta e caminho precisam coincidir exatamente. Consulte [Integrações](docs/integrations.md) para as APIs e a documentação oficial consultada.

#### Confie o certificado HTTPS local uma vez

No primeiro bootstrap do Compose, o projeto cria uma autoridade certificadora local privada e um certificado de servidor para `localhost`. Somente o certificado público da autoridade é exportado para `.local/localhost-ca.crt`; a chave privada fica no volume persistente de segredos do Docker. Importe o certificado no repositório de certificados confiáveis do seu usuário antes de usar o OAuth da Twitch e reinicie o navegador:

```powershell
Import-Certificate -FilePath .\.local\localhost-ca.crt -CertStoreLocation Cert:\CurrentUser\Root
```

No Linux, instale-o no repositório confiável do sistema com `sudo install -Dm644 .local/localhost-ca.crt /usr/local/share/ca-certificates/queuebot-localhost-ca.crt && sudo update-ca-certificates`. No macOS, execute `security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .local/localhost-ca.crt`. Reinicie o navegador após importar.

Esta autoridade certificadora é privada desta instalação e não foi emitida por uma autoridade pública. Se remover o volume de segredos do Docker, o Compose cria outro certificado; importe novamente o novo `.local/localhost-ca.crt`. No Windows, para remover a confiança depois, abra `certmgr.msc`, localize `QueueBot Local Root CA` em **Autoridades de Certificação Raiz Confiáveis > Certificados** e exclua-o.

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
4. **Documentação é obrigatória.** Atualize todo documento principal afetado em inglês e sua versão equivalente pt-BR na mesma mudança. Mantenha comandos, caminhos, IDs de stories, datas, resultados de testes e evidências fiéis. Uma story não está concluída e um PR não está pronto até conferir os dois idiomas; nunca invente evidência de teste.
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

Confira `docker compose ps` e `docker compose logs -f bot db migrate`. O serviço `bot` aguarda o banco saudável e a conclusão bem-sucedida das migrations. `/health` informa conectividade do banco e estado da integração Twitch separadamente. `not_configured` é esperado até salvar credenciais no painel.

### Uma migration ou construção da imagem falhou

Leia os logs de `migrate` e `bot` e, depois de corrigir a causa informada, tente novamente com `docker compose up --build -d`. Não remova volumes para contornar uma falha de migration sem explicação; preserve o banco para investigar o problema.

### A inicialização não abriu o navegador

Abra `https://localhost:3000` manualmente. Se o navegador indicar certificado não confiável, importe primeiro `.local/localhost-ca.crt` no repositório de certificados raiz confiáveis do usuário. Se o sistema não tiver um comando compatível para abrir o navegador, o script de início imprime o endereço.

## Roadmap

| Story | Escopo | Estado |
| --- | --- | --- |
| FND-1 | Documentação bilíngue da fundação e verificação da inicialização/encerramento Compose | Em andamento |
| FND-2 | Domínio das filas, UID, parser, autorização e ordenação PostgreSQL | Em andamento |
| FND-3 | Outbox financeira durável, tentativas, confirmação e recuperação | Em andamento; worker/lease/outbox implementados, auditoria final pendente |
| FND-4 | Credenciais Twitch, OAuth, recompensas, EventSub e reconciliação | Implementação concluída; aceite autorizado com Twitch real aguarda validação do operador |
| FND-5 | Comandos, chamadas, timeout, confirmação de limpeza, conta atual e serviços compartilhados ([issue #1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Em andamento; concorrência da conta entre filas, abrir/fechar remoto de recompensa e cobertura completa de serviços compartilhados pendentes |
| FND-6 | Planejamento UX com referências, painel completo, assistente, API protegida e segurança local ([issue #6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Em andamento; ciclo de recompensas, operações completas, idempotência/revisão da API e validação de usabilidade pendentes |

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
