# Especificação do Frontend: Painel Local da Operadora

[English](../front-end-spec.md) · Requisitos do produto: [PRD](../prd.md), FR-11 e AC-17/18.

## Usuários e tarefas principais

A streamer/operadora usa o navegador no mesmo computador para configurar a Twitch, inspecionar a saúde da integração, criar e operar filas, gerenciar comandos de chat e widgets do OBS, resolver operações de pontos incertas e consultar o histórico. O painel é uma área autenticada da operadora; não é um portal público para viewers. O overlay do OBS é servido pela mesma aplicação Next.js em rota e bundle separados (`/overlay`), autenticado por um link de capacidade por widget, e nunca expõe dados ou controles do painel.

## Arquitetura da informação

1. **Configuração e reconexão:** URL exata do callback, instruções do console de desenvolvedor da Twitch, substituição do Client ID/Secret, validação, conectar/reconectar, identidade e elegibilidade do canal.
2. **Visão geral:** versões local do produto/API/estado, saúde do banco/bot/chat/EventSub, última reconciliação, aviso de quantidade de recompensas e problemas financeiros ativos.
3. **Filas:** estado aberta/fechada/arquivada/exclusão pendente; configurações; criar/editar/abrir/fechar/arquivar/desarquivar/apagar com confirmação explícita.
4. **Detalhe da fila:** ordem de espera, pessoas chamadas, atendimentos em andamento e histórico terminal; adicionar manualmente, chamar, iniciar, concluir, remover, mover e repetir chamada com segurança.
5. **Pontos e recuperação:** operações pendentes, confirmadas, conflitantes ou desconhecidas, com ações de retry/reconciliação que não alteram a intenção registrada.
6. **Comandos:** catálogo e políticas de comandos de chat.
7. **Widgets:** criar, estilizar e pré-visualizar widgets de overlay; gerar, regenerar e revogar os links de uso único para o OBS.
8. **Configurações:** idioma do produto (que também define o idioma do chat) e preferências locais, como os rótulos de texto atual/padrão da conta e o comportamento de reset. Qualquer novidade em Configurações exige story própria.

## Interação e conteúdo

- A interface é localizada por catálogos de mensagens (`en`, `es`, `pt-BR`; padrão `pt-BR`). O idioma do produto é uma configuração do servidor (`product_locale`, versionada) compartilhada pelo painel e pelas respostas de chat; datas e números usam `Intl` com o idioma ativo do produto. Nenhum texto voltado à pessoa usuária fica fixo nos componentes. IDs técnicos e chaves de estado permanecem em inglês.
- Diferenciar estado pendente da confirmação Twitch. Nunca dizer que reembolso/consumo terminou antes da confirmação remota.
- Explicar que inclusão manual não cria resgate de pontos e que UID informado em modo oculto é descartado.
- Confirmar exclusão destrutiva de fila e exibir resumo de resgates/cancelamentos pendentes antes da confirmação.
- Desabilitar controles incompatíveis com ciclo de vida/estado e sempre revalidar a operação no servidor.
- Explicar estados carregando, vazio, desatualizado, desconectado, reconciliação parcial e erro com uma ação segura seguinte.
- Não mostrar o valor ou fragmentos do Secret após salvar. Usar placeholder visual fixo e ação para substituir e validar.
- Segredos de uso único (links de widget para o OBS) são exibidos uma vez, mascarados por padrão, copiados por botão com status visível de sucesso/falha e nunca registrados em log, persistidos ou anunciados em live regions; o diálogo não pode ser fechado por acidente, e fechar sem copiar exige confirmação explícita.
- Nomes e textos controlados por usuários são renderizados como texto, nunca HTML. Não repetir texto bruto rejeitado de resgate/chat.
- `/api/state` e rotas administrativas exigem sessão local; não se pressupõe uma visualização pública do estado.

## Apresentação de privacidade

A operadora pode ver UID somente com a fila em modo visível. Mensagens de chat, chamadas e a projeção de overlay seguem seus toggles independentes. Ocultar UID limpa os valores persistidos e invalida texto de notificação já renderizado; conteúdo da notificação é resolvido com as configurações de privacidade atuais no momento do envio.

## Acessibilidade e layout

Usar títulos semânticos, rótulos explícitos, controles operáveis por teclado, foco visível, contraste adequado e texto de status que não dependa somente de cor. Priorizar operação desktop legível durante live; formulários compactos e ações de fila fáceis de localizar. O painel é uma aplicação Next.js (App Router) com React 19; os estilos são CSS do projeto (`panel.css`, `overlay.css`). O código do overlay não pode importar módulos do painel (fronteira de bundle).

## Cobertura de aceitação

Testes de contrato da UI cobrem configuração, saúde, ciclo de vida da fila, entradas, estados financeiros, reconciliação, erros visíveis, projeções autenticadas e renderização segura de texto. A UI consome contratos API explícitos e não decide regras de segurança ou domínio.
