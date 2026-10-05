# Painel do operador FND-6 — Pesquisa UX e diretrizes de interação

[English version](../../../stories/FND-6/ux-research.md)

**Data da pesquisa:** 2026-10-03
**Método:** Pesquisa documental em referências oficiais de produtos e na especificação fornecida. Não houve entrevistas com streamers, sessões de usabilidade, analytics ou observação deste projeto em produção. A proto-persona e as escolhas abaixo são hipóteses a validar, não resultados de pesquisa com usuários.

## Operador e contexto

O operador principal é o streamer que gerencia um canal Twitch no mesmo computador que hospeda a instalação Compose. Durante a live, ele divide a atenção entre jogo e chat. O painel precisa responder rapidamente: a Twitch está conectada? Quais filas aceitam resgates? Quem aguarda, foi chamado ou está em atendimento? Quais operações de pontos ainda precisam de confirmação?

Os erros mais graves são um resultado incorreto para os pontos, uma chamada duplicada ou atrasada, a exposição de UID depois de uma mudança de privacidade e a exclusão da recompensa antes da confirmação dos cancelamentos. A interface deve separar confirmação remota de intenção local, manter a recuperação visível e permitir revisar os efeitos destrutivos antes da confirmação.

## Referências consultadas

| Referência | Padrão observado | Aplicação ao painel |
| --- | --- | --- |
| Twitch Creator Dashboard | A superfície de controle da live agrupa ferramentas de transmissão, recompensas, moderação e configurações. | Priorizar estado das filas e conectividade; separar configuração e manutenção das ações frequentes durante a live. |
| Guia de Channel Points da Twitch | Configurações de recompensa ficam no Creator Dashboard; a Twitch documenta atualmente um limite de 50 recompensas personalizadas. | Exibir capacidade e propriedade gerenciada/não gerenciada com clareza no fluxo de recompensa. |
| Streamer.bot Actions e Action Queues | Ações operacionais são agrupadas e filas de ações podem ser pausadas, bloqueadas ou limpas. | Manter os controles junto à fila afetada; rótulos de estado e ações destrutivas devem ser explícitos. |
| Painel StreamElements | O painel apresenta navegação rápida, estado do serviço e feed de atividade filtrável com ações de acompanhamento. | Mostrar operações recentes e não resolvidas com estado claro e ação de recuperação direta. |
| Comando `!queue` do StreamElements | A resposta no chat é limitada a cinco nomes e à quantidade restante. | Usar resumos compactos no painel e deixar históricos longos em uma visualização separada. |

Fontes: [Twitch Creator Dashboard](https://help.twitch.tv/s/article/creator-dashboard), [Twitch Channel Points Guide](https://help.twitch.tv/s/article/channel-points-guide), [Streamer.bot Actions](https://docs.streamer.bot/guide/actions/), [Streamer.bot Action Queues](https://docs.streamer.bot/api/sub-actions/core/action-queues), [StreamElements Dashboard Overview](https://support.streamelements.com/hc/en-us/articles/10474723554962-StreamElements-Dashboard-Overview), [StreamElements Queue Command](https://docs.streamelements.com/chatbot/commands/default/queue).

## Arquitetura de informação proposta

1. **Visão ao vivo:** conexões Twitch/EventSub/banco, data da última reconciliação, conta atual, estado das filas e operações de pontos não resolvidas.
2. **Filas:** grupos aguardando, chamados e em atendimento; adição manual; chamar, atender, concluir, remover, mover, abrir/fechar, arquivar e histórico.
3. **Configuração da fila:** título/custo/descrição da recompensa, privacidade do UID, modelo/prazo da chamada, limites e sincronização remota.
4. **Pontos e recuperação:** operações solicitadas, pendentes, confirmadas, em conflito, falhas ou desconhecidas; reconciliar antes de repetir quando o estado remoto for incerto.
5. **Conexão Twitch:** instruções do callback, validação do app, OAuth, elegibilidade do canal, escopos, saúde do token e reconexão.
6. **Operação local:** versão, saúde, última reconciliação e instruções objetivas para logs e reinício.

## Fluxos principais

### Primeira configuração

Mostrar primeiro o callback exato e as instruções. Validar Client ID/Secret por Client Credentials antes de salvar. Nunca retornar nem revelar o Secret após salvar. Iniciar OAuth vinculado à sessão; mostrar identidade e elegibilidade do canal autorizado; habilitar criação de recompensa somente depois de confirmar a capacidade de Channel Points.

### Operação da fila durante a live

Usar um cartão por fila. Mostrar primeiro quantidade aguardando e até cinco entradas, depois grupos separados de chamados e em atendimento. A ação pode atualizar o estado local imediatamente, enquanto o estado remoto dos pontos permanece como pendente até confirmação. A interface só deve dizer “chamada enviada” após confirmação da Helix; falhas precisam de ação disponível e não podem estender o prazo silenciosamente.

### Recuperação de operação financeira

Exibir viewer, fila, resultado solicitado, tentativas, código seguro do último erro e próxima tentativa. Para estado remoto desconhecido, oferecer reconciliação e resolução explícita apenas nos casos permitidos pela política. Preservar a distinção entre “solicitado” e “confirmado”.

### Privacidade e ações destrutivas

Explicar que UID visível pode aparecer em saídas selecionadas. Ao trocar para oculto, informar que os UIDs armazenados serão apagados. Antes de limpar ou excluir, resumir entradas afetadas e solicitações de pontos; exigir confirmação vinculada ao ator e prazo especificados. Desabilitar envio duplicado enquanto uma operação está em andamento.

## Direção visual e de interação

- Superfície escura e pouco brilhante, adequada ao lado do jogo; roxo discreto para ações primárias e verde somente para estado confirmado/saudável.
- Usar fontes do sistema e recursos locais; a aplicação não deve buscar assets de terceiros durante a execução.
- Priorizar texto de leitura confortável e usar monospace compacto apenas para IDs, slugs, versão e estado técnico.
- Estado sempre combina texto e ícone com cor; pendente, desconhecido, conflito e confirmado devem continuar distintos sem percepção de cor.
- Visão ao vivo responsiva, operável por teclado e útil em janela estreita. Diálogos de confirmação nomeiam a fila e listam as consequências.
- Polling preserva o contexto do operador e anuncia mudanças de estado sem mover o foco.

## Tokens visuais provisórios

| Token | Valor | Uso |
| --- | --- | --- |
| `surface` | `#111318` | Fundo da página |
| `surface-panel` | `#191B22` | Painéis de fila e configuração |
| `text-primary` | `#EEEFF2` | Conteúdo principal |
| `text-muted` | `#9297A3` | Detalhes secundários |
| `action-primary` | `#B69AFF` | Ação primária e destaque de foco |
| `state-confirmed` | `#B6EC84` | Estado confirmado/saudável com rótulo |
| `state-attention` | `#E6C27A` | Pendente/recuperação necessária |
| `state-conflict` | `#E6A7A7` | Falha/conflito que exige atenção |

## Plano e limites de validação

Antes de considerar o painel completo, testar os fluxos com ao menos um streamer que não conheça o código: configuração, abertura da fila, remoção de resgate aguardando, distinção entre reembolso pendente/confirmado e ocultação de UID visível anteriormente. Registrar achados e atualizar o design. Essa validação ainda não ocorreu. A interface atual segue provisória e não pode ser considerada a revisão UX final.

## Gate de TDD e implementação

Este documento atende somente ao pré-requisito de planejamento. Não comprova teste de usabilidade e não conclui FND-6. Comportamentos de API e produto continuam exigindo testes antes da implementação; ajustes visuais devem preservar contratos de segurança, privacidade e operações de pontos.
