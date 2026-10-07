# Pesquisa UX OPS-6 — Clareza do painel e orientação operacional

[English](../../../stories/OPS-6/ux-research.md)

**Data:** 2026-10-07
**Método de pesquisa:** revisão heurística do painel local em execução, inspeção do código e da tarefa relatada pelo streamer. Este não é um estudo de usabilidade com vários participantes.

## Pergunta de pesquisa

O streamer consegue identificar rapidamente a versão em execução, saber se as dependências locais estão conectadas e entender qual ação tomar na configuração inicial ou em estados vazios?

## Evidências coletadas

- Inspecionei no Chrome o painel em `https://localhost:3000/`: visão geral, filas, nova fila, operações financeiras, comandos do chat, widgets do OBS, configurações e conexão Twitch.
- A consulta somente leitura `GET /health` retornou `v0.6.0-b6ccd0f-alpha`, banco `connected`, API Twitch `not_configured` e nenhuma medição de ping.
- O cabeçalho visível mostrava somente “VERSÃO LOCAL”; na visão geral, o banco aparecia como “Verificando” e a API Twitch como “Conectando”.
- A inspeção do código encontrou `refresh()` atribuindo os valores dinâmicos e depois chamando `applyPanelCatalog()`. A aplicação das traduções substitui elementos com `data-i18n`, incluindo a versão e os estados de saúde. Isso explica a divergência sem indicar falha na API ou na imagem do contêiner.
- O estado vazio de filas diz “Use o formulário acima”, embora o formulário esteja em outra página. A ação da visão geral diz “Pronto para a live?” / “Abrir filas” mesmo sem canal Twitch conectado e sem filas.
- O seletor de idioma aparece no cabeçalho e em Configurações. No catálogo de comandos e nos textos auxiliares, vários rótulos são exibidos entre 9 e 11 px na visualização desktop inspecionada.
- A página de conexão mostra “Conectar com a Twitch” desabilitado antes do formulário de credenciais, mais abaixo, sem explicar em destaque esse pré-requisito.

## Perfil e tarefa

O usuário principal é o streamer operando a instalação local durante a configuração e a live. Ele precisa confiar no estado resumido, encontrar o próximo passo quando a configuração estiver incompleta e ler os controles ao gerenciar filas. Esta story não exige mudança no comportamento para viewers nem na integração Twitch.

## Achados e decisões de design

1. **Confiança primeiro:** versão e saúde das dependências devem permanecer dinâmicas após tradução e atualização. Usar `product_version` da resposta existente da API; não inferir a versão de um rótulo fixo.
2. **Um controle de idioma:** manter o idioma editável em Configurações e remover o seletor duplicado do cabeçalho. Isso abre espaço para a identidade de runtime e mantém um único local para a preferência.
3. **Próximo passo conforme o estado:** sem canal conectado, direcionar à conexão Twitch; canal conectado e elegível sem filas, direcionar à criação de fila; canal conectado, inelegível e sem filas, direcionar aos detalhes do canal; caso contrário, abrir operações das filas existentes.
4. **Estados vazios verdadeiros e acionáveis:** filas e operações financeiras devem explicar o que será exibido e oferecer o próximo caminho relevante. Não mencionar formulário que não esteja na página.
5. **Explicar pré-requisitos junto a controles desabilitados:** informar por que a conexão Twitch está indisponível e onde configurar as credenciais.
6. **Melhorar leitura com cuidado:** aumentar textos pequenos de operação e ajuda, preservar a identidade escura/roxa e verificar o comportamento responsivo sem introduzir um sistema visual novo.

## Limitações

- Há um relato de streamer e uma inspeção do painel local. Não foram feitas entrevistas, pesquisas, análise de métricas ou sessões moderadas de usabilidade.
- A auditoria inicial usou uma instalação não configurada. Uma sessão autorizada posterior forneceu um canal conectado, porém inelegível, para verificação somente leitura de status/interface; criação de recompensas, processamento de resgates, comandos de chat e escritas não foram exercitados.
- O console do navegador registrou um erro originado por uma extensão do Chrome; ele não foi atribuído à aplicação.

## Contexto de verificação posterior

Em 2026-10-07, o streamer conectou um canal autorizado que não é Afiliado nem Parceiro e ofereceu esse estado para testes seguros do painel. Uma consulta somente leitura a `/health` retornou banco `connected`, Twitch `ineligible` e medição de 197 ms. O Chrome confirmou a explicação localizada da inelegibilidade e, após a correção, a identidade do produto, os rótulos dos serviços, o ping e a próxima ação “Ver conexão”. O estado conectado/inelegível foi usado somente para verificar a interface; não houve escrita de recompensa, resgate, chat ou OAuth. Este teste não valida operação manual de filas/chat, planejada separadamente na FND-9.

## Encaminhamento

A story OPS-6 converte esses problemas observados em critérios de aceite testáveis. A validação deve incluir o painel local real depois da implementação e testes focados na exibição de estado e navegação. A mudança não deve alterar contratos da API, política de filas, OAuth ou textos escritos pelo streamer.
