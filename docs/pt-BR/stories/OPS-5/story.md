# OPS-5 — Instalador unificado multiplataforma

[English](../../../stories/OPS-5/story.md)

**Status:** rascunho de planejamento; implementação do instalador não iniciada.
**Origem do planejamento:** solicitação do proprietário em 2026-10-06.
**Issue GitHub:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30), aberta para planejamento.

[Pesquisa do Spec Pipeline](spec/research.json) · [Especificação](spec/spec.md)

## História

Como streamer que instala o bot local, quero um único arquivo de entrada por plataforma para orientar instalação, configuração de dependências, atualização e desinstalação, para operar o produto sem escolher entre scripts separados.

## Decisões de planejamento confirmadas

- Entregar um arquivo de entrada por família de sistema operacional; não afirmar que um mesmo binário universal executa nativamente em Windows, macOS e Linux.
- O ponto de entrada oferece ações de instalar/iniciar, atualizar e desinstalar.
- Detecção de dependências faz parte do fluxo. Qualquer instalação que exija elevação, reinicialização, alteração de recursos do sistema ou aceitação de termos de terceiros deve ser explicada e aprovada explicitamente; casos não suportados mostram instruções oficiais manuais.
- A remoção do produto mantém a escolha atual entre preservar e apagar dados. Remove somente recursos do produto e nunca desinstala Docker como dependência compartilhada.
- As proteções de exclusão de dados continuam obrigatórias; nenhuma ação normal remove volumes Docker sem confirmação digitada explícita do operador.

## Conclusão da pesquisa

Um arquivo nativo universal idêntico não é uma opção padrão realista. O InstallBuilder gera instaladores nativos de um único projeto para vários sistemas desktop, mas a licença Professional atual é comercial e listada por USD 1.995. O IzPack oferece um instalador Java multiplataforma, mas exige runtime Java se não for incluído no pacote. O Oracle `jpackage` cria pacotes por plataforma e precisa ser executado em cada sistema-alvo. O Velopack tem licença MIT e gera instaladores/pacotes de atualização para desktop em várias plataformas, mas se destina à saída de aplicativos desktop compilados, diferente deste serviço operado por Docker Compose.

**Direção recomendada:** manter um pequeno ponto de entrada fonte para sistemas POSIX (`.sh`, compartilhado pelos Linux/macOS suportados) e um ponto de entrada PowerShell para Windows (`.ps1`); reunir as ações em menu/argumentos e reutilizar um único contrato testado de operação. Não adicionar framework pago, Java, Electron ou outro runtime só para envolver o app Compose atual. Considerar um executável nativo autocontido somente se os testes demonstrarem que esses dois pontos de entrada não oferecem fluxo seguro e utilizável.

**Direção de CI com runner open source:** manter os arquivos fonte dos instaladores como entregáveis canônicos no Git e usar GitHub Actions com matriz de runners Linux/macOS/Windows para executar verificações contratuais por plataforma. Empacotar o ponto de entrada de cada plataforma e sua documentação necessária em artefatos de workflow separados, gerados a partir das fontes versionadas. Isso mantém os artefatos baixáveis alinhados às mudanças de fonte revisadas; Actions não deve reescrever nem criar commits automáticos dos arquivos de instalador. Um workflow de release pode anexar os artefatos já testados somente como parte de uma release explicitamente autorizada. Fixar Actions de terceiros por SHA completo e revisar atualizações por PR normal. O workflow não exige framework pago de instalador.

O aplicativo runner é open source sob MIT, e as definições das imagens de runner são públicas. O GitHub Actions hospedado continua sendo um serviço do GitHub; portanto, o plano de controle completo da CI não é open source. Hospedar o runner por conta própria é possível, mas adiciona manutenção da máquina e capacidade específica por plataforma; isso não substitui o serviço de workflow do GitHub.

O workflow CI não instala nem mantém o Docker do host atualizado por conta própria. Ele testa a lógica de instalação/atualização do produto e empacota os entrypoints. A instalação de dependências continua usando instruções oficiais do fornecedor e respeita consentimento e limites de privilégios. A cobertura dos runners hospedados pelo GitHub é evidência de contrato, não substitui a aceitação manual em computadores Windows/macOS/Linux físicos.

A instalação de dependências não pode ser garantida como silenciosa ou totalmente automática em todos os sistemas. Docker Desktop no Windows permite instalação por usuário sem administrador em configurações documentadas, mas habilitar WSL pode exigir ação administrativa. Os caminhos de instalação Docker no macOS e Linux diferem e podem envolver sudo/alterações de sistema. O setup precisa detectar, explicar, pedir consentimento, executar somente etapas suportadas e aprovadas, e retomar ou exibir o próximo passo manual.

## Critérios de aceite a refinar

1. O usuário baixa/executa um único ponto de entrada documentado para seu sistema e vê ações de instalar/iniciar, atualizar e desinstalar.
2. O ponto de entrada detecta sistema/arquitetura suportados, Docker CLI/daemon e Compose v2 antes de alterar o app.
3. As orientações de dependência ausente são versionadas e conferidas com instruções oficiais. Setup automatizado suportado exige consentimento explícito e usa fontes oficiais com verificação de assinatura/hash quando disponível.
4. O fluxo nunca eleva privilégios silenciosamente, altera recursos de virtualização/sistema silenciosamente, aceita termos em nome do usuário ou executa scripts baixados sem verificação.
5. Setup de dependência interrompido ou com falha deixa caminho claro de recuperação e não remove dados do app.
6. A atualização preserva volumes PostgreSQL e de segredos e identifica origem/versão que será instalada.
7. A desinstalação sempre oferece preservar ou apagar; a exclusão requer confirmação digitada e informa os dados do app afetados. Docker permanece instalado.
8. O ponto de entrada é idempotente; nova execução retoma ou informa o estado instalado real em vez de duplicar setup.
9. Um workflow do GitHub Actions executa testes contratuais em runners nativos Linux, macOS e Windows; empacota um artefato por família de sistema a partir das fontes versionadas; e publica artefatos sem criar commits de arquivos gerados na branch. A documentação esclarece que Actions hospedado é um serviço, enquanto o aplicativo runner possui licença MIT.
10. Contratos de teste cobrem shell Linux/macOS e PowerShell Windows, caminhos com espaços, quoting, cancelamento, ferramentas ausentes, limites de privilégios/reinício, falha de download, saúde Compose e preservar/apagar volumes.
11. Versões do workflow/Actions são fixadas e atualizadas por PR revisado; anexar artefatos a release é uma etapa separada e exige autorização de release do projeto.
12. Documentação bilíngue e changelogs internos concisos permanecem sincronizados. Aceite nativo de Windows/macOS só é registrado após execução nesses computadores.

## Perguntas em aberto

- Quais distribuições Linux e versões do macOS serão oficialmente suportadas para instalação assistida de dependências, em contraste com somente detecção/instrução manual?
- A instalação assistida de dependências deve abrir o instalador gráfico oficial do fornecedor ou executar comandos de gerenciador de pacotes após consentimento explícito?
- O entrypoint Windows continua como `.ps1` ou o artefato será um `.exe` nativo assinado que inclui o launcher? Um shim `.bat` violaria o objetivo de arquivo único se depender de um segundo script.
- A instalação automática opcional do Docker Desktop é aceitável quando UAC/sudo for exibido, ou o setup sempre deve deixar essa instalação a cargo do usuário?
- Como esta consolidação se relaciona com os nomes genéricos aprovados para FND-8, `subarushogun_twich_bot_setup`, `..._update` e `..._uninstall`? Um único entrypoint setup pode substituir os arquivos separados mantendo esses nomes de ação no menu.

## Fora do escopo

Substituir Docker Compose, remover Docker ao desinstalar o produto, provisionar virtualização de host silenciosamente, mudar política de retenção de dados, serviços de instalação hospedados ou assumir compromisso com fornecedor de instalador pago.

## Registro de alterações

| Data | Alteração | Agente |
| --- | --- | --- |
| 2026-10-06 | Criado rascunho de planejamento após pesquisa oficial de instaladores e pré-requisitos Docker; implementação não iniciada | @aiox-master |
| 2026-10-06 | Adicionada matriz GitHub Actions open source, contratos em runners nativos, artefatos por plataforma e limites contra commits/release automáticos | @aiox-master |
