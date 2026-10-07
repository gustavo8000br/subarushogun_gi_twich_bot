# OPS-5 — Instalador unificado multiplataforma

[English](../../../stories/OPS-5/story.md)

**Status:** Pronta para revisão — implementação corretiva e gates locais concluídos; o Actions nativo Windows é o gate de aceite restante. O QA e Actions da PR #36 são evidência histórica, não validam este incremento. Não se alega desinstalação física no host.
**Origem do planejamento:** solicitação do proprietário em 2026-10-06.
**Issue GitHub:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30), reaberta em 2026-10-07 para o incremento corretivo após a PR #36.

[Pesquisa do Spec Pipeline](spec/research.json) · [Especificação](spec/spec.md)

## História

Como streamer que instala o bot local, quero abrir um único instalador da minha plataforma e escolher instalar, atualizar ou desinstalar em um menu, para não precisar localizar scripts separados nem remover dependências compartilhadas por engano.

## Decisões de planejamento confirmadas

- Entregar exatamente um artefato de instalador baixável/abrível para cada sistema suportado (Windows, macOS e Linux). O artefato abre diretamente o menu pelo caminho normal da plataforma; não pode exigir `.bat`, `.ps1`, `.sh` auxiliar, clone do repositório ou script de produto baixado separadamente. A CI pode gerar o artefato a partir de vários arquivos-fonte/testes revisados.
- O único menu oferece **Instalar / Iniciar**, **Atualizar** e **Desinstalar**. Downloads separados de setup/atualização/desinstalação deixam de ser o modelo de entrega ao usuário.
- Na primeira instalação, perguntar idioma do produto (pt-BR padrão; inglês e espanhol disponíveis) e porta host (3000 padrão), mostrar a URL de callback correspondente e salvar as escolhas. Instalações existentes mostram idioma/porta atuais e permitem manter ou alterar; o painel continua sendo o local normal para mudar o idioma depois.
- Se a porta escolhida estiver ocupada, parar e pedir outra porta válida; nunca escolher outra silenciosamente. Explicar que mudar a porta também muda o callback OAuth da Twitch.
- A atualização oferece **Manter dados e atualizar** (padrão; preserva banco, segredos, idioma e porta) ou **Apagar dados do produto e instalar do zero**. A opção limpa mostra os dados que serão apagados e exige confirmação localizada digitada antes de remover volumes/segredos do produto; depois executa novamente a configuração inicial.
- A desinstalação oferece **Manter dados** ou **Apagar todos os dados do produto**. Ao manter, parar/remover somente containers, arquivos de aplicação gerenciados e imagens do app sem uso por outros containers, preservando volumes de banco/segredos e a CA local para reinstalação futura. Apagar tudo também remove somente volumes, segredos e CA gerada deste produto, após confirmação localizada digitada. O arquivo de instalador baixado pelo usuário não é apagado.
- Toda conclusão da desinstalação explica que Docker Engine/Desktop, WSL/recursos de virtualização, gerenciadores de pacotes e outras dependências do host continuam instalados. Se desejar, o usuário deve removê-los manualmente pelas instruções do fornecedor.
- Detecção de dependências faz parte do fluxo. Qualquer instalação que exija elevação, reinicialização, alteração de recursos do sistema ou aceitação de termos de terceiros deve ser explicada e aprovada explicitamente; casos não suportados mostram instruções oficiais manuais.

## Conclusão da pesquisa

Um arquivo nativo universal idêntico não é uma opção padrão realista. O InstallBuilder gera instaladores nativos de um único projeto para vários sistemas desktop, mas a licença Professional atual é comercial e listada por USD 1.995. O IzPack oferece um instalador Java multiplataforma, mas exige runtime Java se não for incluído no pacote. O Oracle `jpackage` cria pacotes por plataforma e precisa ser executado em cada sistema-alvo. O Velopack tem licença MIT e gera instaladores/pacotes de atualização para desktop em várias plataformas, mas se destina à saída de aplicativos desktop compilados, diferente deste serviço operado por Docker Compose.

**Direção recomendada:** distribuir exatamente um artefato de instalador diretamente abrível para cada sistema operacional suportado (Windows, macOS, Linux). Cada artefato oferece um único menu e as três ações de ciclo de vida; o usuário não precisa de script auxiliar nem checkout do repositório. O código-fonte pode compartilhar módulos/testes e a CI pode empacotar/compilar artefatos por plataforma a partir de vários arquivos revisados. Pesquisa e testes em runners nativos devem definir formatos que iniciem naturalmente em cada sistema. Não adicionar framework pago, Java, Electron ou outro runtime só para envolver o Compose atual, exceto se o requisito de abertura direta em arquivo único não puder ser atendido de forma segura.

**Direção de CI e release:** manter os fontes revisados no Git e usar GitHub Actions com runners nativos Linux/macOS/Windows para testar o entregável de arquivo único em cada sistema suportado. Artefatos da CI são saídas temporárias de engenharia/QA. Um workflow separado, acionado por tag, empacota e abre diretamente os mesmos instaladores, depois anexa exatamente um `.bat`, `.command` e `.sh` à GitHub Release correspondente. As notas públicas bilíngues são extraídas das seções da versão correspondente em `CHANGELOG.md` e `docs/pt-BR/CHANGELOG.md`; pushes comuns de branch não publicam releases. A tag precisa codificar o SHA exato de sete caracteres do commit, o SemVer base e o estágio atual. Fixar Actions de terceiros por SHA completo e revisar atualizações por PR.

O aplicativo runner é open source sob MIT, e as definições das imagens de runner são públicas. O GitHub Actions hospedado continua sendo um serviço do GitHub; portanto, o plano de controle completo da CI não é open source. Hospedar o runner por conta própria é possível, mas adiciona manutenção da máquina e capacidade específica por plataforma; isso não substitui o serviço de workflow do GitHub.

O workflow CI não instala nem mantém o Docker do host atualizado por conta própria. Ele testa a lógica de instalação/atualização do produto e empacota os entrypoints. A instalação de dependências continua usando instruções oficiais do fornecedor e respeita consentimento e limites de privilégios. A cobertura dos runners hospedados pelo GitHub é evidência de contrato, não substitui a aceitação manual em computadores Windows/macOS/Linux físicos.

A instalação de dependências não pode ser garantida como silenciosa ou totalmente automática em todos os sistemas. Docker Desktop no Windows permite instalação por usuário sem administrador em configurações documentadas, mas habilitar WSL pode exigir ação administrativa. Os caminhos de instalação Docker no macOS e Linux diferem e podem envolver sudo/alterações de sistema. O setup precisa detectar, explicar, pedir consentimento, executar somente etapas suportadas e aprovadas, e retomar ou exibir o próximo passo manual.

## Critérios de aceite

1. O pacote baixável contém exatamente um artefato de instalador diretamente abrível por sistema suportado (Windows, macOS, Linux); ao abrir, mostra um único menu para instalar/iniciar, atualizar e desinstalar sem script auxiliar, clone do projeto ou download separado de script de ciclo de vida.
2. A primeira instalação detecta sistema/arquitetura, Docker CLI/daemon e Compose v2; pergunta idioma e porta, explica os padrões, valida a porta e exibe as URLs HTTPS do painel/callback correspondentes antes de continuar.
3. Quando faltar dependência host, o usuário pode aprovar uma instalação oficial suportada ou recusar e receber as instruções atuais do fornecedor. Elevação, reinicialização, mudanças de WSL/virtualização e termos de terceiros são explicados antes da ação.
4. Instalar/atualizar/desinstalar são idempotentes e informam estado detectado/atual e progresso visível. A desinstalação inventaria recursos deste projeto Compose, informa a remoção de containers/redes/imagens/volumes, verifica pós-condições e identifica recursos restantes em caso de falha. Falha ou cancelamento preserva dados mantidos e indica como recuperar.
5. Atualização normal preserva volumes PostgreSQL/segredos e a configuração atual. Atualização limpa descreve as consequências e exige confirmação localizada digitada antes de apagar dados do produto; depois executa novamente a configuração inicial.
6. Desinstalação oferece manter dados ou apagar tudo. Manter remove containers, arquivos de aplicação e imagens sem uso por outros containers, mas preserva volumes de banco/segredos e CA local. Apagar tudo exige confirmação localizada digitada e remove somente recursos/dados deste produto; o instalador baixado permanece sob controle do usuário.
7. Ambas as opções informam que Docker e demais dependências do host continuam instalados e precisam ser removidos manualmente pelo fornecedor se desejado. A desinstalação do produto não remove dependências compartilhadas.
8. Nenhum fluxo escolhe outra porta, eleva privilégios, altera virtualização, aceita termos, executa código baixado sem verificação ou apaga recursos de outros projetos Compose silenciosamente.
9. A matriz Actions testa o artefato real em runners nativos Windows, macOS e Linux e envia exatamente um artefato por sistema suportado, gerado de fontes revisadas sem criar commits. Esses artefatos de CI não são o caminho de download do usuário.
10. Testes cobrem abertura direta/menu, idioma/porta, caminhos com espaços, cancelamento, dependências presentes/ausentes, consentimento/elevação/reinicialização, falhas de rede/imagem/migration/health, escopo de preservação/exclusão, confirmação localizada e orientação para remoção manual das dependências.
11. Uma tag de versão enviada aciona workflow que valida a tag contra a versão base do pacote, `.release-stage` e SHA exato de sete caracteres do commit; ele empacota/testa os três instaladores nativos e só publica após sucesso de todas as plataformas.
12. As notas da release incluem as seções de changelog correspondentes em inglês e pt-BR; o workflow falha se qualquer uma estiver ausente. Changelogs internos não são publicados.
13. Actions de terceiros são fixadas por SHA completo e atualizadas via PR. Criar tag/release continua sendo ação exclusiva de `@devops`, após gates aprovados pelo proprietário. Aceite nativo só é declarado após execução real em Windows/macOS/Linux.
14. Story, guias de instalação/operação, política de versão e changelogs em inglês/pt-BR permanecem equivalentes.
15. A desinstalação remove containers/redes Compose do produto e imagens não usadas, mantém volumes nomeados quando dados são preservados e remove volumes somente após confirmação localizada. Verifica que imagens sem uso desapareceram, mantém imagens usadas por outros containers e nunca executa prune global.
16. Instaladores Linux/macOS e Windows exibem progresso localizado para instalar, atualizar e desinstalar; limpam o terminal somente quando interativo; diferenciam “instalação não encontrada” de remoção concluída; e verificam a política de volumes escolhida antes de informar conclusão.
17. Cada plataforma aceita ações sem interação `install`, `update` e `uninstall`. A instalação aceita locale/porta opcionais; atualização e desinstalação preservam dados por padrão; apagar exige as duas flags `--erase-data` e `--confirm-erase`. Flags inválidas/contraditórias encerram antes de alterar Docker. O modo sem interação mantém progresso/erros visíveis e não abre navegador.

## Registro de implementação e validação

- **Artefatos por sistema:** `.bat` no Windows incorpora a implementação PowerShell; `.command` no macOS e `.sh` no Linux incorporam a implementação POSIX. `package-installer.mjs` embute o manifesto Compose e remove build/montagens relativas ao repositório. O GitHub Actions empacota e executa diretamente o artefato em runner nativo e envia exatamente um artefato por sistema.
- **Orientação ao operador:** o instalador detecta Docker e pede autorização antes de abrir instruções oficiais do fornecedor. Não eleva privilégios nem muda WSL/virtualização silenciosamente. O guia bilíngue do instalador explica download, abertura, opções e dados. Os wrappers separados antigos e testes foram removidos depois que artefato substituto e contratos existiam.
- **Dados:** atualização normal preserva volumes de banco/segredos e configurações. Atualização limpa baixa a imagem antes de apagar dados, exige `APAGAR` / `DELETE` / `ELIMINAR` e então pergunta idioma/porta. A desinstalação permite manter dados ou remover somente dados do produto após a mesma confirmação localizada. Dependências compartilhadas do Docker/host e o instalador baixado permanecem intactos.
- **Red → Green — recuperação de atualização destrutiva:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot download its image'` falhou primeiro porque a falha de download ocorria após o `.env` salvo mudar da porta 3100 para 3200 e do locale `en` para `pt-BR`. Green — mover `compose pull` para antes de `compose down --volumes` e iniciar usando a imagem já baixada. O comando focado passou e a configuração/certificado local foram preservados na falha de pull.
- **Red → Green — desinstalação visível e verificada:** `npm test -- --run tests/integration/unified-installer.test.js -t 'shows uninstall progress|no managed installation'` falhou primeiro porque não havia progresso específico, inventário/verificação posterior dos recursos, evidência de proteção de imagem compartilhada nem resposta precisa para “nada removido”. Green — inventariar recursos Docker com label do projeto, listar imagens do Compose, remover apenas imagens sem uso por qualquer container, verificar containers/redes/política de volumes escolhida e separar o caso sem instalação. O comando focado passou 2/2 após a implementação. Em seguida, a integração foi ampliada para exercitar preservação de volumes, reinstalação e exclusão dos volumes; o último comando focado passou 3 testes selecionados e ignorou 18.
- **Implementação multiplataforma da desinstalação/progresso:** o instalador POSIX usa progresso Compose plain e etapas localizadas de instalação/atualização/remoção. O PowerShell espelha inventário de recursos, remoção de imagens sem uso, verificação da política de volumes, mensagem sem instalação e etapas de progresso. O harness inclui verificações nativas Windows para manter/apagar dados. PowerShell não está instalado no Ubuntu atual; sua execução continua pendente do runner Windows Actions, portanto este incremento ainda não passou por QA final.
- **Red → Green — CLI de ciclo de vida sem interação:** `npm test -- --run tests/integration/unified-installer.test.js -t 'supports unattended install'` falhou primeiro porque `--silent install --locale en --port 3111` ainda perguntava o idioma e encerrava sem salvar a configuração. Green — interpretar/validar ação/opções explícitas, aplicar padrões seguros, ignorar perguntas/abertura do navegador, manter progresso e exigir as duas flags de exclusão. O comando focado final `npm test -- --run tests/integration/unified-installer.test.js tests/unit/windows-installer-first-run.test.js` passou 27/27; o lançamento do artefato Linux nativo passou com `node tests/platform/installer-native.mjs`.
- **Red → Green — inventário e pós-condição de imagens:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot inventory the product images'` reproduziu falso sucesso quando a inspeção Docker falhava; Green interrompe a remoção com erro. O teste de pós-condição falhou em Red com saída 0 quando a verificação de imagem foi desativada e passou após confirmar ausência da imagem sem uso ou referência de container externo. O CI nativo Windows falhou antes do lançamento porque o PowerShell interpretou uma aspa tipográfica como delimitador de string. Uma nova regressão estática falhou em Red nesse caractere e passou após substituir as duas strings; a repetição Windows corrigida está pendente. Suítes focadas passaram 29/29 antes dessa regressão adicional; a suíte Windows prompt agora passou 6/6.
- **Contrato documental:** a suíte completa detectou que o manual não dizia explicitamente que a desinstalação pergunta se a pessoa deseja manter ou apagar dados. O texto foi restaurado nos dois idiomas; o teste documental focado passou 1/1.
- **Teste de fogo real — Docker Linux:** antes do teste, o operador executou `docker compose down -v`; a saída confirmou remoção de `postgres_data` e `operational_secrets`. Depois o instalador foi executado com `printf '1\nS\n0\n' | sh /tmp/queuebot-installer-smoke/subarushogun_twich_bot_setup.sh`, detectou o `.env` local preservado (pt-BR/3000), baixou GHCR `main`, recriou os dois volumes, concluiu PostgreSQL/migrations/inicialização do bot e polling de saúde. Em seguida `sh /tmp/queuebot-installer-smoke/subarushogun_twich_bot_setup.sh --silent update` terminou sem perguntas e preservou banco/segredos/configuração. O `curl --insecure --silent --show-error --fail https://localhost:3000/health` final retornou `status=ok`, banco `connected`, Twitch `not_configured`, versão `v0.8.0-112a182-alpha`. Não houve autorização/operação de escrita Twitch. A instalação continua ativa com volumes recém-criados; não os remover nesta story.
- **Red → Green — idioma inicial no Windows:** `npm test -- --run tests/unit/windows-installer-first-run.test.js` falhou primeiro porque a fonte PowerShell iniciava `$Locale` como `pt-BR` e pulava a pergunta de idioma numa instalação nova. Green — deixar o locale vazio sem configuração salva e perguntar antes do menu; locale salvo inválido retorna ao pt-BR. O contrato estático e a execução direta real são verificados localmente/no CI, respectivamente.
- **Comportamento do instalador Linux:** `npm test -- --run tests/integration/unified-installer.test.js` cobre empacotamento, caminho com espaços, idioma/porta/callback, atualização preservando dados, confirmação localizada, falha de download na atualização limpa, desinstalação mantendo/apagando e orientação para Docker ausente. `node tests/platform/installer-native.mjs` executou diretamente o artefato Linux gerado em um caminho com espaços com um executável Docker falso isolado.
- **Regressão de inicialização Compose:** a primeira execução da suíte completa mostrou que o runtime empacotado executava o bootstrap em `/workspace`, enquanto a imagem de produção o mantém em `/app`. A integração Compose real não encontrou `apps/infra/scripts/bootstrap.mjs`; mudar o diretório de trabalho do serviço para `/app` corrigiu o erro. Depois, `npm test -- --run tests/integration/compose-runtime.test.js` passou 3/3 e a execução final de `npm test` passou 643/643.
- **Harness de execução nativa Windows — Red / Green pendente:** a execução Actions `37574642283`, job `112640688705`, falhou porque o caminho entre aspas do `.bat` foi tratado como comando inexistente antes de abrir o artefato. O harness passava as aspas como argumento ao `cmd.exe`, que as escapava literalmente. Agora ele chama o `.bat` pelo call operator do PowerShell e passa o caminho via `QUEUEBOT_PREBUILT_INSTALLER`, preservando caminhos com espaços. Os testes focados Linux passaram 9/9; o Green Windows precisa ser confirmado pela próxima execução nativa do Actions. Status histórico superado pela execução nativa Windows/macOS/Linux 37634641892 registrada abaixo.
- **Fallback do locale inicial Windows — Red / Green, nova execução nativa pendente:** a execução nativa `37575104559`, job `112642122850`, falhou antes de ler a resposta do operador com `Cannot index into a null array` em `T`, pois o locale inicial fica vazio intencionalmente. Uma regressão em `npm test -- --run tests/unit/windows-installer-first-run.test.js` falhou em Red porque `T` consultava `$Copy['']`. Green — usar pt-BR somente como locale temporário de texto até a escolha explícita do usuário; manter o locale de produto vazio até a seleção. O helper separado `Read-Answer` automatiza entrada no teste nativo direto. Testes focados do instalador passaram 11/11; `npm test` final passou 645/645 e todos os gates locais passaram. Nova execução Windows continua pendente. Status histórico superado pela execução nativa Windows/macOS/Linux 37634641892 registrada abaixo.
- **Entrada de prompts multiplataforma — Red / Green, nova execução nativa Windows pendente:** a execução Windows `37575367627`, job `112642948904`, expirou enquanto o harness enviava respostas via pipe ao `.bat` executado diretamente. O harness agora fornece um arquivo de respostas determinístico ao processo PowerShell embutido; o prompt de produção é exibido uma vez antes do `Read-Host`. Red — um novo teste de integração Linux sem entrada esgotou o buffer de saída (`ENOBUFS`) porque EOF fazia o seletor de idioma entrar em loop. Green — Linux agora encerra com orientação localizada para usar um terminal; testes focados de integração e prompts Windows passaram 12/12 e `node tests/platform/installer-native.mjs` passou no Linux. A documentação Linux agora mostra `sh ./subarushogun_twich_bot_setup.sh`, que não depende da permissão executável. Ainda precisamos do sintoma exato do operador para confirmar se corresponde ao caso reproduzido. Gates locais completos passaram: 85 arquivos / 646 testes, lint, typecheck, OpenGrep (0 achados), localização, versão, denylist de portas, Compose e diff. Novas execuções nativas Windows/macOS seguem pendentes. Status histórico superado pela execução nativa Windows/macOS/Linux 37634641892 registrada abaixo.
- **Nova execução Windows:** o Actions `37576026566`, job `112645005291`, não expirou, mas encerrou sem criar o `.env` esperado. O harness antes mostrava apenas o erro de arquivo e descartava a saída do instalador; agora inclui stdout/stderr nessa falha. O diagnóstico e a próxima execução Windows estão pendentes; não há aprovação Windows alegada. Status histórico superado pela execução nativa Windows/macOS/Linux 37634641892 registrada abaixo.
- **Correção das estimativas de instalação — Red / Green:** `npm test -- --run tests/unit/documentation-contract.test.js -t 'separates end-user runtime estimates'` falhou primeiro porque os dois guias descreviam CPU, disco e cache para um primeiro build local, embora o instalador do usuário baixe uma imagem GHCR pré-construída. Green — ambos agora separam estimativas de runtime de builds de desenvolvimento, documentam imagens amd64/arm64 e esclarecem a execução Linux pelo shell. O contrato documental focado passou 1/1. Os requisitos atuais do Docker para macOS foram conferidos na página oficial de instalação em 2026-10-07.
- **Repositório público e acesso GHCR separado — Red / Green (2026-10-07):** um novo contrato documental de acesso público falhou primeiro porque o README da raiz ainda dizia que o repositório era privado. A API do GitHub confirmou `visibility=public`; um pull anônimo de `main` no GHCR retornou HTTP 403. Green — sincronizados os dois READMEs, guias de contribuição/instalação/instaladores/usuário, referências de integração e changelogs: o código público e artefatos temporários de Actions não exigem convite ao repositório (o download do artefato exige login no GitHub), enquanto a imagem atualmente exige acesso autorizado e `read:packages`. `npm test -- --run tests/unit/documentation-contract.test.js -t 'public repository without assuming the GHCR package is public'` passou 1/1. Os scripts do instalador não foram alterados porque ele já baixa a imagem configurada e não depende da visibilidade do repositório-fonte.
- **Documentação (instruções de download substituídas):** o guia anterior apontava para artefatos temporários do GitHub Actions. Essas instruções foram substituídas por GitHub Releases como caminho do usuário; artefatos de CI continuam para engenharia/QA. O guia bilíngue apresenta os três nomes exatos de assets, abertura por sistema, comportamento de menu/dados e caminhos dos fontes. O comando Linux da CA usa `$HOME` e `install -Dm644`.
- **GitHub Releases versionadas — Red / Green (2026-10-07):** primeiro foram adicionados testes focados para mapear identidade materializada à seção do changelog, rejeitar identidades inválidas, detectar traduções ausentes e verificar o workflow de tag. Red mostrou que não existia gerador de notas nem workflow de release. Green — `create-release-notes.mjs` exige as duas seções públicas; `.github/workflows/release.yml` valida a identidade exata de tag/origem, empacota e testa um instalador nativo por sistema e só então publica notas bilíngues em tag enviada. `npm test -- --run tests/unit/release-notes.test.js tests/unit/ci-workflow-contract.test.js` passou 9/9. Nenhuma tag/release foi criada, estágio promovido ou visibilidade GHCR alterada.
- **Imagem de instalador fixada na release e gates atuais — Red / Green (2026-10-07):** testes de regressão mostraram que instaladores de release usavam a tag móvel `main`; o teste de atualização também confirmou que falhas de pull devem preservar a tag anterior no `.env`. Green — o empacotador aceita somente `main` ou identidade materializada validada, artefatos de release embutem sua tag exata e atualizações normais persistem essa tag somente após pull bem-sucedido. O harness nativo Linux verifica a tag usada ao instalar/atualizar. A action QEMU foi fixada no SHA verificado compatível com Node 24 (v4.4.0). Verificações locais finais: `npm test` passou com 86 arquivos / 660 testes; lint, typecheck, OpenGrep (0 achados), validadores de versão/localização/porta, configuração Compose, parse YAML e `git diff --check` passaram; o harness Linux de execução direta também passou. Actions nativo Windows/macOS e QA independente AIOX continuam pendentes. A inspeção Docker encontrou somente o projeto Compose ativo; os containers one-shot `bootstrap`/`migrate` encerrados e os dois volumes do produto foram preservados. Status histórico superado pela execução nativa Windows/macOS/Linux 37634641892 registrada abaixo.
- **Idioma inicial Windows — Red / Green, aprovação nativa (2026-10-07):** o Actions `37633610369`, job `112833952970`, reproduziu que a resposta de idioma na primeira execução não era mantida: a pergunta se repetia, consumia as respostas posteriores de menu/porta e não gravava `.env`. O harness atualizado preservou stdout/stderr reais. Uma regressão em `tests/unit/windows-installer-first-run.test.js` falhou primeiro porque funções liam `$Locale` sem escopo enquanto os prompts gravavam `$script:Locale`. Green — inicializar, ler e atualizar `$script:Locale` de forma consistente. O teste focado passou 3/3 localmente; a execução `37634641892`, job `112837515704`, então passou o teste nativo do instalador Windows. Os jobs nativos de instalador Linux e macOS também passaram e enviaram seus artefatos na mesma execução. O workflow concluiu com sucesso; a publicação no GHCR foi ignorada como esperado em um pull request.

- **Arquitetura Docker e idioma inicial do instalador — Red / Green (2026-10-07):** `npm test -- --run tests/integration/unified-installer.test.js -t 'checks the Docker daemon architecture'` falhou primeiro porque o instalador não consultava `docker info --format '{{.Architecture}}'` e continuava ao pull/up do Compose para um daemon incompatível. Uma asserção separada do prompt inicial falhou em Red porque o shell mostrava as chaves internas `language` e `language_prompt` antes da escolha do idioma. Green — consultar a arquitetura do daemon, aceitar `amd64`/`x86_64` e `arm64`/`aarch64`, parar antes do Compose em arquiteturas desconhecidas e usar os textos pt-BR até o operador escolher um idioma. Isso segue a referência Docker [`docker system info`](https://docs.docker.com/reference/cli/docker/system/info/) consultada em 2026-10-07. Testes focados de arquitetura, locale inicial, falha de migration/inicialização e painel não saudável em atualização passaram; o harness nativo de execução direta Linux também passou.

### Status de aceite

- [x] Um artefato diretamente abrível é empacotado por sistema; nenhum arquivo de ciclo de vida antigo é necessário.
- [x] Instalar/iniciar, atualizar, desinstalar, idioma, porta, callback, caminhos com espaços, confirmação localizada destrutiva, preservação e orientação para Docker ausente têm testes de implementação.
- [x] Testes de arquitetura do daemon Docker permitem `amd64`/`x86_64` e `arm64`/`aarch64`, rejeitam valores incompatíveis antes do Compose e verificam um prompt inicial de idioma legível. Testes controlados na fronteira do CLI comprovam que falhas de inicialização/migration e um painel não saudável após atualização preservam a configuração salva e não solicitam a remoção de volumes.
- [x] Falha ao baixar a imagem em atualização limpa comprovadamente preserva configurações e dados do produto.
- [x] Wrappers e testes antigos foram removidos; os guias orientam o uso do instalador único.
- [x] Todos os gates locais de qualidade e OpenGrep passam na árvore atual: `npm test` (86 arquivos / 673 testes), lint, typecheck, OpenGrep (0 achados), localização, denylist de portas, versão, configuração Compose, parse YAML dos workflows e diff. A última auditoria de dependências de produção registrada nesta story encontrou 0 vulnerabilidades.
- [x] Verificação de execução direta do artefato Linux passou em caminho com espaços; o `.sh` gerado selecionou idioma/porta, mostrou callback, invocou Compose e encerra corretamente sem resposta na primeira execução.
- [x] O acesso ao repositório-fonte público e ao pacote de imagem GHCR está documentado separadamente em inglês e pt-BR; o acesso anônimo ao GHCR foi verificado e negado enquanto o pacote permanece privado.
- [x] Workflow de release por tag valida a identidade runtime e gera notas das seções correspondentes dos changelogs inglês e pt-BR.
- [x] Guias do usuário apontam para GitHub Releases; artefatos Actions são documentados como arquivos temporários de engenharia/QA.
- [ ] Criar tag/release somente depois do gate aprovado pelo proprietário; FND-9 ainda não foi concluída e não existe release pública do produto.
- **Instruções antigas de artefato extraído — Red / Green histórico, substituído:** o operador executou `sh ./subarushogun_twich_bot_setup.sh` na raiz do repositório e recebeu `cannot open ... No such file`; naquele momento, o arquivo empacotado existia somente no arquivo CI baixado. O contrato documental resultante foi corrigido com a explicação da pasta de extração. A distribuição atual prevista usa arquivos independentes anexados às GitHub Releases, então a pessoa abre o `.sh` baixado diretamente do local onde foi salvo; a instrução anterior sobre arquivo CI não é atual.
- [x] Actions nativo Windows, macOS e Linux passou historicamente em [37637847991](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37637847991).
- [ ] O instalador corretivo precisa passar no Actions nativo Windows/macOS/Linux antes de marcar OPS-5 como Done.
- [x] O QA AIOX histórico aprovou somente a linha de base anterior à reabertura. A revisão corretiva atual está em 88/100 CONCERNS porque o CI nativo Windows está pendente; consulte o gate atual e os Resultados de QA acima.
- [x] Não se alega aceitação física em Windows/macOS; execução real do ciclo Docker no host e instalação de dependências permanecem como validação posterior do operador e não são pré-requisito do critério de CI em runners nativos.
- [ ] Antes do teste Twitch planejado com streamer após a FND-9, tornar público o pacote GHCR e verificar um pull anônimo; o repositório-fonte é público, mas o pacote de imagem ainda estava privado em 2026-10-07.

## Lista de arquivos

- `.aiox/project-status.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `CHANGELOG.md`
- `CHANGELOG_INTERNAL.md`
- `README.md`
- `README.pt-BR.md`
- `VERSION`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/server.mjs`
- `apps/infra/installer/installer.ps1`
- `apps/infra/installer/installer.sh`
- `apps/infra/scripts/create-release-notes.mjs`
- `apps/infra/scripts/host-lifecycle.ps1`
- `apps/infra/scripts/host-locale.sh`
- `apps/infra/scripts/package-installer.mjs`
- `atualizar.bat`
- `atualizar.sh`
- `compose.yaml`
- `desinstalar.bat`
- `desinstalar.sh`
- `docs/CONTRIBUTING.md`
- `docs/INSTALLATION.md`
- `docs/INSTALLERS.md`
- `docs/MANUAL_DE_USUARIO-pt_BR.md`
- `docs/ROADMAP.md`
- `docs/USER_GUIDE-en_US.md`
- `docs/VERSIONING.md`
- `docs/integrations.md`
- `docs/planning-validation.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CONTRIBUICAO.md`
- `docs/pt-BR/INSTALACAO.md`
- `docs/pt-BR/INSTALADORES.md`
- `docs/pt-BR/ROADMAP.md`
- `docs/pt-BR/VERSIONING.md`
- `docs/pt-BR/integrations.md`
- `docs/pt-BR/planning-validation.md`
- `docs/pt-BR/stories.md`
- `docs/pt-BR/stories/DOC-1/story.md`
- `docs/pt-BR/stories/FND-8/spec/complexity.json`
- `docs/pt-BR/stories/FND-8/spec/critique.json`
- `docs/pt-BR/stories/FND-8/spec/plan.json`
- `docs/pt-BR/stories/FND-8/spec/requirements.json`
- `docs/pt-BR/stories/FND-8/spec/spec.md`
- `docs/pt-BR/stories/FND-8/story.md`
- `docs/pt-BR/stories/OPS-5/spec/research.json`
- `docs/pt-BR/stories/OPS-5/spec/spec.md`
- `docs/pt-BR/stories/OPS-5/story.md`
- `docs/qa/gates/FND-4-twitch-integration.yml`
- `docs/stories.md`
- `docs/stories/DOC-1/story.md`
- `docs/stories/FND-8/spec/complexity.json`
- `docs/stories/FND-8/spec/critique.json`
- `docs/stories/FND-8/spec/plan.json`
- `docs/stories/FND-8/spec/requirements.json`
- `docs/stories/FND-8/spec/spec.md`
- `docs/stories/FND-8/story.md`
- `docs/stories/OPS-5/spec/research.json`
- `docs/stories/OPS-5/spec/spec.md`
- `docs/stories/OPS-5/story.md`
- `iniciar.bat`
- `iniciar.sh`
- `package-lock.json`
- `package.json`
- `subarushogun_twich_bot_setup.bat`
- `subarushogun_twich_bot_setup.sh`
- `subarushogun_twich_bot_uninstall.bat`
- `subarushogun_twich_bot_uninstall.sh`
- `subarushogun_twich_bot_update.bat`
- `subarushogun_twich_bot_update.sh`
- `tests/integration/compose-contract.test.js`
- `tests/integration/unified-installer.test.js`
- `tests/integration/windows-lifecycle-contract.test.js`
- `tests/platform/installer-native.mjs`
- `tests/platform/windows-lifecycle-localization.ps1`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/fnd7-documentation-contract.test.js`
- `tests/unit/host-lifecycle-localization.test.js`
- `tests/unit/host-locale-copy.test.js`
- `tests/unit/installer-locale-default.test.js`
- `tests/unit/lifecycle-wrapper.test.js`
- `tests/unit/maintenance-scripts.test.js`
- `tests/unit/release-notes.test.js`
- `tests/unit/start-script.test.js`
- `tests/unit/windows-installer-first-run.test.js`

- `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/pt-BR/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/qa/assessments/OPS-5-risk-20261007.md`
- `docs/qa/assessments/OPS-5-nfr-20261007.md`
- `docs/pt-BR/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/pt-BR/qa/assessments/OPS-5-risk-20261007.md`
- `docs/pt-BR/qa/assessments/OPS-5-nfr-20261007.md`

## Decisões de implementação resolvidas

- Formatos: `.bat`, `.command`, `.sh`; sem launcher auxiliar.
- Fonte da instalação: imagem GHCR `main` por Compose embutido; usuário não clona o repositório nem precisa de Node.js.
- Pré-requisito Docker: detecção e abertura autorizada de instruções oficiais; sem instalação de host ou elevação silenciosa.
- Confirmações digitadas: `APAGAR`, `DELETE`, `ELIMINAR` para pt-BR, inglês e espanhol.
- Os wrappers antigos só foram removidos depois da presença dos fontes/testes do artefato único e das instruções por sistema.

## Fora do escopo

Substituir Docker Compose, remover Docker ao desinstalar o produto, provisionar virtualização de host silenciosamente, mudar política de retenção de dados, serviços de instalação hospedados ou assumir compromisso com fornecedor de instalador pago.

## Registro de alterações

| Data | Alteração | Agente |
| --- | --- | --- |
| 2026-10-06 | Criado rascunho de planejamento após pesquisa oficial de instaladores e pré-requisitos Docker; implementação não iniciada | @aiox-master |
| 2026-10-06 | Adicionada matriz GitHub Actions open source, contratos em runners nativos, artefatos por plataforma e limites contra commits/release automáticos | @aiox-master |
| 2026-10-07 | Refinada a entrega para um artefato de instalador diretamente abrível por sistema, com menu único instalar/atualizar/desinstalar, idioma/porta, confirmação de atualização limpa, escolhas explícitas de retenção e orientação para remoção manual das dependências do host | @aiox-master + @architect |
| 2026-10-07 | Implementados os artefatos unificados, empacotamento Compose embutido, matriz CI nativa, testes de segurança/regressão, instruções bilíngues por sistema e remoção dos scripts substituídos; gates finais CI/QA pendentes | @aiox-dev |
| 2026-10-07 | Concluídos os gates locais de qualidade (643 testes, lint, typecheck, OpenGrep e validadores); corrigido o diretório de trabalho do bootstrap Compose de `/workspace` para `/app`; execução direta Linux passou. Actions nativo Windows/macOS e QA independente continuam pendentes | @aiox-dev + @qa |
| 2026-10-07 | Actions nativo Windows revelou dois defeitos no harness de execução; corrigidos o launcher do arquivo batch e a leitura de entrada redirecionada no modo de teste. A suíte local agora passa 644/644; nova execução Windows está pendente | @aiox-dev + @qa |
| 2026-10-07 | Nova execução Windows encontrou consulta ao catálogo com locale inicial vazio; adicionada regressão Red e fallback temporário de textos para pt-BR. Testes focados passam 11/11; suíte completa e nova execução nativa pendentes | @aiox-dev + @qa |
| 2026-10-07 | Depois do fallback do locale inicial, todos os gates locais passaram: 645 testes, lint/typecheck, OpenGrep, validadores, Compose, diff e auditoria das dependências. Nova execução nativa Windows está pendente | @aiox-dev + @qa |
| 2026-10-07 | Instaladores de release agora fixam a imagem na tag versionada correspondente e só salvam a nova tag após pull bem-sucedido; regressão cobre falha sem alterar a configuração. QEMU atualizado para pin compatível com Node 24. Naquele ponto, os gates locais passaram com 660 testes e o artefato Linux nativo passou; essa evidência foi superada pela suíte posterior de 667 testes e pela execução Actions 37634641892 em Windows/macOS/Linux. A inspeção Docker encontrou somente a instalação ativa e preservou os containers one-shot e volumes | @aiox-dev + @qa |
| 2026-10-07 | Evidência de aceite atualizada: os três jobs nativos de instalador no Actions passaram (execução 37634641892); aceitação física do operador não é alegada; QA independente iniciado | @aiox-dev |
| 2026-10-07 | Adicionadas regressões de arquitetura e recuperação: arquiteturas Docker incompatíveis param antes do Compose, aliases suportados prosseguem, o prompt inicial de idioma é legível e falhas de migration/inicialização ou de saúde após atualização preservam configurações/dados. Os novos casos Red falharam porque a arquitetura não era verificada e o prompt exibia chaves internas; Green adiciona a verificação da arquitetura do daemon e fallback pt-BR no prompt. A suíte local completa passa com 667 testes; CI nativo atualizado e QA independente ainda pendentes | @aiox-dev |
| 2026-10-07 | Actions nativo 37637259314 passou em Linux/macOS, mas o Windows falhou porque o log do harness não continha `compose up -d`; a saída da falha ainda não revelou a causa. O Docker falso `.cmd` passou a comparar os argumentos individualmente e a asserção inclui a saída capturada do instalador. A execução 37637847991 passou em todos os jobs nativos Windows/macOS/Linux e enviou os três artefatos | @aiox-dev |
| 2026-10-07 | Revisão independente AIOX-QA passou nos 14/14 critérios de aceite, com nota 100/100; não restam riscos bloqueantes. Testes físicos em Windows/macOS não são alegados | @qa |
| 2026-10-07 | Reaberta após feedback do operador; adicionados critérios de progresso, remoção Docker delimitada, pós-condições da política de volumes e mensagem de ausência de instalação. O status Done/QA anterior permanece apenas como histórico; incremento corretivo está InProgress | @aiox-master + @aiox-devops |
| 2026-10-07 | Adicionado contrato CLI multiplataforma sem interação, flags de exclusão explícitas seguras e comandos de operação bilíngues; teste de fogo real de instalação/atualização Compose no Linux passou. Execução PowerShell nativa Windows e novo QA continuam pendentes | @aiox-dev + @aiox-master |

## Resultados de QA

### Revisão do incremento corretivo — 2026-10-07

### Revisado por: Quinn (Test Architect)

### Avaliação da qualidade do código

Os instaladores POSIX e PowerShell agora exibem progresso, limitam a limpeza Docker a este projeto Compose, inventariam imagens do produto, preservam imagens referenciadas por qualquer container e verificam containers/redes/volumes/imagens antes de informar sucesso. Ações sem interação têm padrões seguros explícitos e exigem as duas flags para apagar dados. Os guias do usuário e do instalador descrevem o mesmo comportamento em inglês e pt-BR.

### Evidências de validação

- `npm test`: 86 arquivos, 677 testes passaram após a correção do probe de arquitetura PowerShell.
- `npm run lint`, `npm run typecheck`, `npm run review:static`: passaram; OpenGrep reportou 0 achados.
- `npm run validate:version`, `npm run validate:localization`, `npm run validate:port-denylist`, `docker compose config --quiet`, `sh -n apps/infra/installer/installer.sh`, `node --check tests/platform/installer-native.mjs`, `node tests/platform/installer-native.mjs` e `git diff --check`: passaram.
- Testes focados do instalador: 29/29 passaram; contrato documental: 1/1 passou.
- Runtime Compose Linux permanece saudável; `bot` e `db` estão saudáveis e os volumes `postgres_data`/`operational_secrets` foram preservados.
- A execução Windows do Actions 37648518488 falhou inicialmente antes do lançamento por erro de análise PowerShell causado por aspas tipográficas; o commit `b92a4cc` corrigiu o problema. A execução 37649015429 passou pela análise e instalação, mas revelou uma falha no repasse de argumentos pelo harness durante a atualização sem interação. O harness agora encaminha argumentos explícitos de teste, e uma nova matriz nativa está pendente.
- A execução Windows 37649015429 passou pela análise PowerShell e pela instalação inicial, mas falhou na atualização sem interação porque o harness iniciou o `.bat` sem argumentos. Um teste em `npm test -- --run tests/unit/windows-installer-first-run.test.js` falhou primeiro em Red porque não havia um caminho explícito para encaminhar argumentos. Green — passar os argumentos de teste por uma variável-fixture dedicada e encaminhá-los ao batch pelo call operator do PowerShell. O contrato focado Windows passou 7/7 e o harness nativo Linux passou; ainda é necessária uma nova execução do Actions Windows.
- A execução 37649606223 confirmou o repasse de argumentos e concluiu a instalação e os outros jobs, mas a atualização sem interação falhou porque `docker.cmd` falso retornava erro para a consulta de arquitetura. O log preservado confirmou a chamada exata `info --format {{.Architecture}}`. Um teste estático falhou em Red porque faltavam resposta/pré-teste explícitos do fake e diagnóstico do log. Green — responder com linhas diretas `if`/`echo`/`exit`, executar um pré-teste nativo do fake antes do instalador, incluir as chamadas Docker em falhas e verificar que o instalador executa o probe esperado. O contrato Windows focado passou 8/8 e o harness nativo Linux passou; uma nova matriz nativa está pendente.
- A execução 37650741917 mostrou que o pré-teste nativo do fake passou e o instalador registrou a consulta correta, mas ainda tratou o probe como falha. Uma regressão focada falhou em Red porque o código passava a saída nativa por `Select-Object` antes de ler `$LASTEXITCODE`. Green — capturar imediatamente o array de saída e o código de retorno, depois selecionar a primeira linha. O contrato Windows focado passou 9/9 e o lançamento do artefato Linux passou; os gates completos e a nova matriz nativa estão pendentes.

### Decisão do gate

CONCERNS — nota 88/100 (8,8/10). Os gates locais passaram, mas a verificação Windows nativa é necessária antes de concluir a story. Os critérios 1, 4, 6, 9, 10 e 15–17 precisam da execução do artefato Windows atualizado; não alegamos validação completa deles nesta revisão.

### Revisão de segurança

OpenGrep reportou 0 achados. A remoção de imagens consulta referências por containers; não há prune global nem remoção de dependências do host. Os volumes de banco e segredos da instalação ativa foram preservados.

### Decisão de ciclo de vida

Manter como Pronta para revisão até a branch passar no CI nativo Windows. Não fechar a issue #30 nem marcar OPS-5 como Done antes desse gate.

### Revisão histórica da linha de base — data: 2026-10-07

### Revisado por: Quinn (Test Architect)

### Revisão do código: `11e1e3f836a521256c5c450e5c21cb081b82bb68`

### Avaliação da qualidade do código

O instalador continua sendo um artefato diretamente abrível por sistema operacional, enquanto a implementação permanece testável em fontes revisados separados. Ações destrutivas são explícitas e localizadas, a atualização normal preserva dados, arquiteturas Docker incompatíveis param antes do Compose e as falhas indicam como recuperar. Os 14 critérios de aceite têm evidência de implementação ou workflow.

### Refatoração realizada

Não foi necessária refatoração do código de produto durante o QA. A falha anterior do harness nativo Windows foi corrigida para comparar argumentos individuais no Docker falso e preservar stdout/stderr no diagnóstico. A nova execução nativa passou.

### Verificação de conformidade

- Padrões de código: ✓ Limites atuais de JS/ESM e shell/PowerShell preservados.
- Estrutura do projeto: ✓ Fontes, empacotador, testes, documentação e evidência QA seguem a organização do repositório.
- Estratégia de testes: ✓ Vitest, CI com PostgreSQL/Compose e execução nativa dos artefatos passaram.
- Todos os critérios atendidos: ✓ Rastreabilidade 1–14 em `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`.

### Checklist de melhorias

- [x] Verificados 86 arquivos / 667 testes na implementação atual.
- [x] Lint, typecheck, OpenGrep (0 achados), validadores de localização/versão/portas, configuração Compose e execução direta Linux passaram.
- [x] Execução nativa Windows/macOS/Linux e envio dos artefatos passaram na [execução Actions 37637847991](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37637847991).
- [ ] Registrar teste físico de instalação/atualização Windows quando o proprietário retomar o teste no notebook; o CI usou Docker falso.

### Revisão de segurança

Credenciais não são embutidas nos instaladores nem expostas pelos diagnósticos. A limpeza destrutiva requer confirmação localizada exata e usa o projeto Compose fixo do produto. O OpenGrep não encontrou achados. Nenhuma release ou tag foi criada.

### Considerações de desempenho

O polling de saúde do instalador tem limite de 60 tentativas. As verificações de arquitetura e Compose adicionam somente trabalho limitado na inicialização; nenhum processo persistente ou tarefa em segundo plano foi introduzido.

### Arquivos modificados durante a revisão

Somente relatórios QA e avaliações bilíngues; nenhum código de aplicação foi alterado durante esta revisão.

### Status do gate

Gate: PASS → `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`

Perfil de risco: `docs/qa/assessments/OPS-5-risk-20261007.md`

Avaliação NFR: `docs/qa/assessments/OPS-5-nfr-20261007.md`

### Transição de status

Somente linha de base histórica: PASS InReview → Done para a PR #36. A OPS-5 foi reaberta em 2026-10-07; esta revisão anterior não cobre o incremento corretivo de progresso/desinstalação/CLI. O status atual é Em andamento e exige novo QA e validação nativa Windows antes de Done. @devops sincronizará a issue depois do merge da PR corretiva.
