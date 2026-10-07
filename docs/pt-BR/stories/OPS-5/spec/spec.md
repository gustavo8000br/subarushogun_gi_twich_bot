# Especificação OPS-5 — instalador de ciclo de vida em arquivo único

[English](../../../../stories/OPS-5/spec/spec.md)

**Status:** referência de implementação; execução direta Linux e gates locais passaram. Os jobs nativos Linux/macOS/Windows passaram na revisão anterior; devem ser reexecutados para as verificações recentes de arquitetura antes do QA final. Aceitação física do operador não é alegada.

## Objetivo

Entregar um arquivo de instalador diretamente abrível por sistema operacional suportado. Ao abrir, ele apresenta um único menu para instalar/iniciar, atualizar ou desinstalar. O usuário não precisa baixar arquivos separados de ciclo de vida, script auxiliar nem clonar o repositório. Fontes e testes de desenvolvimento podem continuar modulares; a regra de arquivo único vale para cada artefato baixável pelo usuário.

## Fluxo do usuário

### Instalar / Iniciar

1. Detectar sistema/arquitetura, estado atual do produto, Docker CLI/daemon e Docker Compose v2 antes de alterar qualquer coisa.
2. Se Docker/Compose estiver ausente, oferecer caminho oficial de instalação suportado após explicar privilégios, mudanças no sistema, reinicializações e termos do fornecedor. O usuário pode recusar e receber instruções oficiais manuais. Nunca elevar privilégios, habilitar WSL/virtualização, aceitar termos ou executar código baixado em silêncio.
3. Na primeira instalação, perguntar idioma do produto (pt-BR padrão; inglês e espanhol disponíveis) e porta host (3000 padrão). Validar a porta, verificar se está ocupada e pedir outro valor em vez de trocar automaticamente.
4. Mostrar e salvar as configurações escolhidas e as URLs HTTPS exatas do painel/callback OAuth. O locale escolhido pode ser alterado depois no painel. Mudar a porta exige atualizar o callback cadastrado na Twitch.
5. Iniciar imagem/configuração suportada, aguardar saúde do Compose e abrir o painel ou exibir uma instrução clara para recuperação. Ao reabrir o instalador em uma instalação existente, apresentar seu estado atual e oferecer iniciar/reconfigurar sem duplicar recursos.

### Atualizar

Mostrar a versão/origem instalada e oferecer:

- **Manter dados e atualizar** (padrão): preservar banco, autorização Twitch, segredos, CA local gerada, idioma e porta; baixar a imagem suportada escolhida e executar migrations. Falha preserva os dados atuais e informa como recuperar.
- **Apagar dados do produto e instalar do zero**: resumir que filas, histórico, autorização Twitch, segredos e CA local serão apagados. Exigir confirmação digitada no idioma selecionado pelo instalador. Depois remover somente containers/volumes/arquivos deste produto e imagens do app sem uso por outros containers, e repetir as perguntas da primeira instalação. Cancelamento ou confirmação incorreta não apaga dados.

### Desinstalar

Oferecer duas escolhas explícitas:

- **Manter dados**: parar/remover somente containers deste produto, imagens sem uso e arquivos de aplicação gerenciados pelo instalador. Preservar volumes PostgreSQL/segredos, configurações salvas e CA local gerada para reinstalação futura.
- **Apagar todos os dados do produto**: listar os dados afetados e exigir confirmação digitada localizada. Remover somente containers/imagens sem uso/arquivos/volumes/segredos e CA gerada deste produto. O instalador baixado permanece sob controle do usuário.

Ambos os caminhos deixam instalados Docker Engine/Desktop, recursos WSL/virtualização, gerenciadores de pacotes e outras dependências do host. Explicar que o usuário deve removê-las manualmente pelas instruções oficiais dos fornecedores se desejar. Nunca remover ou alterar projetos, volumes, imagens Docker ou dependências do host que não pertençam ao produto.

## Artefato por plataforma e CI

- Há exatamente um arquivo de instalador baixável por sistema operacional suportado (Windows, macOS, Linux). O artefato inicia o menu pelo caminho normal de abertura/execução da plataforma, sem segundo launcher ou script. Escolher formatos somente após testes de abertura direta em runners nativos; um `.ps1` que abre em um editor não atende sozinho ao requisito.
- As fontes podem compartilhar bibliotecas e testes no repositório. A CI gera/empacota cada artefato independente a partir de fontes revisadas e não commita arquivos gerados de volta na branch.
- Runners nativos GitHub Actions executam contratos do instalador real em cada sistema suportado e publicam exatamente um artefato de instalador por alvo. Artefatos de CI não são releases. Anexar a release e criar tags exige o workflow de release autorizado pelo proprietário.
- Fixar Actions de terceiros por SHA completo e conceder permissões mínimas. O aplicativo runner é MIT/open source; o GitHub Actions hospedado continua sendo um serviço hospedado.

## Segurança e recuperação

- Cada ação é idempotente e informa estado detectado/instalado antes de modificar o ambiente.
- Dependência ausente, prompt recusado, falha de download, rede indisponível, migration com erro, serviço Compose não saudável ou interrupção preservam dados existentes e mostram o próximo passo concreto.
- Sem troca automática de porta, elevação silenciosa, alteração silenciosa de recurso do sistema, aceite implícito de licença, execução de script sem verificação ou `down --volumes` cego sobre projeto que não foi comprovado como pertencente ao app.
- Não registrar credenciais, códigos/tokens OAuth, segredos do banco ou strings de conexão.
- Desinstalar o produto nunca desinstala Docker ou dependências compartilhadas do host.

## Evidências de aceite

Os testes cobrem abertura direta/escolha de menu, prompts de idioma e porta, exibição de callback, caminhos com espaços, cancelamento, dependências presentes/ausentes, consentimento/elevação/reinicialização, falhas e recuperação, preservação em atualização, exclusão em atualização limpa, escopo de retenção/exclusão na desinstalação, confirmação localizada digitada, proteção de recursos não relacionados e orientação para remoção manual de dependências. Aceite em computador de usuário é registrado separadamente dos resultados de runner CI.

Os formatos por sistema, comportamento da dependência Docker, confirmações digitadas e escopo de limpeza estão resolvidos na [story](../story.md). Resultados nativos do Actions, gates completos do repositório, QA independente e aceitação física no host do usuário permanecem validações separadas.
