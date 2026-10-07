# OPS-5 — Instalador unificado multiplataforma

[English](../../../stories/OPS-5/story.md)

**Status:** implementação concluída; gates locais de qualidade e execução nativa do instalador Linux passaram. Resultados nativos Windows/macOS do Actions e revisão independente AIOX-QA ainda pendentes antes do encerramento. Não se alega aceitação física em Windows/macOS.
**Origem do planejamento:** solicitação do proprietário em 2026-10-06.
**Issue GitHub:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30), aberta para planejamento.

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

**Direção de CI com runner open source:** manter os fontes revisados no Git e usar GitHub Actions com runners nativos Linux/macOS/Windows para testar o entregável de arquivo único em cada sistema suportado. Enviar um arquivo de instalador por sistema como artefato de CI, gerado dos fontes versionados; manter a documentação operacional no repositório, sem exigir outro arquivo no pacote. Actions não deve reescrever nem criar commits de instaladores gerados. Um workflow de release pode anexar artefatos testados somente em uma release explicitamente autorizada. Fixar Actions de terceiros por SHA completo e revisar atualizações por PR.

O aplicativo runner é open source sob MIT, e as definições das imagens de runner são públicas. O GitHub Actions hospedado continua sendo um serviço do GitHub; portanto, o plano de controle completo da CI não é open source. Hospedar o runner por conta própria é possível, mas adiciona manutenção da máquina e capacidade específica por plataforma; isso não substitui o serviço de workflow do GitHub.

O workflow CI não instala nem mantém o Docker do host atualizado por conta própria. Ele testa a lógica de instalação/atualização do produto e empacota os entrypoints. A instalação de dependências continua usando instruções oficiais do fornecedor e respeita consentimento e limites de privilégios. A cobertura dos runners hospedados pelo GitHub é evidência de contrato, não substitui a aceitação manual em computadores Windows/macOS/Linux físicos.

A instalação de dependências não pode ser garantida como silenciosa ou totalmente automática em todos os sistemas. Docker Desktop no Windows permite instalação por usuário sem administrador em configurações documentadas, mas habilitar WSL pode exigir ação administrativa. Os caminhos de instalação Docker no macOS e Linux diferem e podem envolver sudo/alterações de sistema. O setup precisa detectar, explicar, pedir consentimento, executar somente etapas suportadas e aprovadas, e retomar ou exibir o próximo passo manual.

## Critérios de aceite

1. O pacote baixável contém exatamente um artefato de instalador diretamente abrível por sistema suportado (Windows, macOS, Linux); ao abrir, mostra um único menu para instalar/iniciar, atualizar e desinstalar sem script auxiliar, clone do projeto ou download separado de script de ciclo de vida.
2. A primeira instalação detecta sistema/arquitetura, Docker CLI/daemon e Compose v2; pergunta idioma e porta, explica os padrões, valida a porta e exibe as URLs HTTPS do painel/callback correspondentes antes de continuar.
3. Quando faltar dependência host, o usuário pode aprovar uma instalação oficial suportada ou recusar e receber as instruções atuais do fornecedor. Elevação, reinicialização, mudanças de WSL/virtualização e termos de terceiros são explicados antes da ação.
4. Instalar/atualizar/desinstalar são idempotentes e informam estado detectado/atual. Falha ou cancelamento preserva dados existentes e indica como recuperar.
5. Atualização normal preserva volumes PostgreSQL/segredos e a configuração atual. Atualização limpa descreve as consequências e exige confirmação localizada digitada antes de apagar dados do produto; depois executa novamente a configuração inicial.
6. Desinstalação oferece manter dados ou apagar tudo. Manter remove containers, arquivos de aplicação e imagens sem uso por outros containers, mas preserva volumes de banco/segredos e CA local. Apagar tudo exige confirmação localizada digitada e remove somente recursos/dados deste produto; o instalador baixado permanece sob controle do usuário.
7. Ambas as opções informam que Docker e demais dependências do host continuam instalados e precisam ser removidos manualmente pelo fornecedor se desejado. A desinstalação do produto não remove dependências compartilhadas.
8. Nenhum fluxo escolhe outra porta, eleva privilégios, altera virtualização, aceita termos, executa código baixado sem verificação ou apaga recursos de outros projetos Compose silenciosamente.
9. A matriz Actions testa o artefato real em runners nativos Windows, macOS e Linux e envia exatamente um artefato por sistema suportado, gerado de fontes revisadas sem criar commits. Não publica releases/tags nem altera as fontes.
10. Testes cobrem abertura direta/menu, idioma/porta, caminhos com espaços, cancelamento, dependências presentes/ausentes, consentimento/elevação/reinicialização, falhas de rede/imagem/migration/health, escopo de preservação/exclusão, confirmação localizada e orientação para remoção manual das dependências.
11. Actions de terceiros são fixadas por SHA completo e atualizadas via PR. Anexar artefatos à release é separado e exige autorização do proprietário. Aceite nativo só é declarado após execução real em Windows/macOS/Linux.
12. Story, guias de instalação/operação e changelogs em inglês/pt-BR permanecem equivalentes.

## Registro de implementação e validação

- **Artefatos por sistema:** `.bat` no Windows incorpora a implementação PowerShell; `.command` no macOS e `.sh` no Linux incorporam a implementação POSIX. `package-installer.mjs` embute o manifesto Compose e remove build/montagens relativas ao repositório. O GitHub Actions empacota e executa diretamente o artefato em runner nativo e envia exatamente um artefato por sistema.
- **Orientação ao operador:** o instalador detecta Docker e pede autorização antes de abrir instruções oficiais do fornecedor. Não eleva privilégios nem muda WSL/virtualização silenciosamente. O guia bilíngue do instalador explica download, abertura, opções e dados. Os wrappers separados antigos e testes foram removidos depois que artefato substituto e contratos existiam.
- **Dados:** atualização normal preserva volumes de banco/segredos e configurações. Atualização limpa baixa a imagem antes de apagar dados, exige `APAGAR` / `DELETE` / `ELIMINAR` e então pergunta idioma/porta. A desinstalação permite manter dados ou remover somente dados do produto após a mesma confirmação localizada. Dependências compartilhadas do Docker/host e o instalador baixado permanecem intactos.
- **Red → Green — recuperação de atualização destrutiva:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot download its image'` falhou primeiro porque a falha de download ocorria após o `.env` salvo mudar da porta 3100 para 3200 e do locale `en` para `pt-BR`. Green — mover `compose pull` para antes de `compose down --volumes` e iniciar usando a imagem já baixada. O comando focado passou e a configuração/certificado local foram preservados na falha de pull.
- **Red → Green — idioma inicial no Windows:** `npm test -- --run tests/unit/windows-installer-first-run.test.js` falhou primeiro porque a fonte PowerShell iniciava `$Locale` como `pt-BR` e pulava a pergunta de idioma numa instalação nova. Green — deixar o locale vazio sem configuração salva e perguntar antes do menu; locale salvo inválido retorna ao pt-BR. O contrato estático e a execução direta real são verificados localmente/no CI, respectivamente.
- **Comportamento do instalador Linux:** `npm test -- --run tests/integration/unified-installer.test.js` cobre empacotamento, caminho com espaços, idioma/porta/callback, atualização preservando dados, confirmação localizada, falha de download na atualização limpa, desinstalação mantendo/apagando e orientação para Docker ausente. `node tests/platform/installer-native.mjs` executou diretamente o artefato Linux gerado em um caminho com espaços com um executável Docker falso isolado.
- **Regressão de inicialização Compose:** a primeira execução da suíte completa mostrou que o runtime empacotado executava o bootstrap em `/workspace`, enquanto a imagem de produção o mantém em `/app`. A integração Compose real não encontrou `apps/infra/scripts/bootstrap.mjs`; mudar o diretório de trabalho do serviço para `/app` corrigiu o erro. Depois, `npm test -- --run tests/integration/compose-runtime.test.js` passou 3/3 e a execução final de `npm test` passou 643/643.
- **Harness de execução nativa Windows — Red / Green pendente:** a execução Actions `37574642283`, job `112640688705`, falhou porque o caminho entre aspas do `.bat` foi tratado como comando inexistente antes de abrir o artefato. O harness passava as aspas como argumento ao `cmd.exe`, que as escapava literalmente. Agora ele chama o `.bat` pelo call operator do PowerShell e passa o caminho via `QUEUEBOT_PREBUILT_INSTALLER`, preservando caminhos com espaços. Os testes focados Linux passaram 9/9; o Green Windows precisa ser confirmado pela próxima execução nativa do Actions.
- **Fallback do locale inicial Windows — Red / Green, nova execução nativa pendente:** a execução nativa `37575104559`, job `112642122850`, falhou antes de ler a resposta do operador com `Cannot index into a null array` em `T`, pois o locale inicial fica vazio intencionalmente. Uma regressão em `npm test -- --run tests/unit/windows-installer-first-run.test.js` falhou em Red porque `T` consultava `$Copy['']`. Green — usar pt-BR somente como locale temporário de texto até a escolha explícita do usuário; manter o locale de produto vazio até a seleção. O helper separado `Read-Answer` automatiza entrada no teste nativo direto. Testes focados do instalador passaram 11/11; `npm test` final passou 645/645 e todos os gates locais passaram. Nova execução Windows continua pendente.
- **Documentação:** guia bilíngue agora mostra o caminho de download no GitHub Actions, nomes exatos dos artefatos, como abrir por sistema, comportamento de menu/dados e caminhos dos fontes. O comando Linux da CA usa `$HOME` e `install -Dm644`. Contratos finais de README, guias e story continuam na suíte final.

### Status de aceite

- [x] Um artefato diretamente abrível é empacotado por sistema; nenhum arquivo de ciclo de vida antigo é necessário.
- [x] Instalar/iniciar, atualizar, desinstalar, idioma, porta, callback, caminhos com espaços, confirmação localizada destrutiva, preservação e orientação para Docker ausente têm testes de implementação.
- [x] Falha ao baixar a imagem em atualização limpa comprovadamente preserva configurações e dados do produto.
- [x] Wrappers e testes antigos foram removidos; os guias orientam o uso do instalador único.
- [x] Todos os gates locais de qualidade e OpenGrep passam na árvore atual: `npm test` (85 arquivos / 645 testes), lint, typecheck, OpenGrep (0 findings), localização, denylist de portas, versão, configuração Compose, diff e auditoria das dependências de produção (0 vulnerabilidades).
- [x] Verificação de execução direta do artefato Linux passou em caminho com espaços; o `.sh` gerado selecionou idioma/porta, mostrou callback e invocou Compose.
- [ ] Jobs nativos Windows, macOS e Linux do Actions passam e publicam um artefato por sistema.
- [ ] Revisão independente AIOX-QA alcança o limite de aceite do projeto.
- [ ] Aceite físico do operador é separado; atualização/desinstalação real com Docker e instalação de dependências do host não foram executadas nesta sessão.

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
