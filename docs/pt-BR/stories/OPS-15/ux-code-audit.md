# Auditoria UX do código Next da OPS-15

## Revisão

- Revisora: `$aiox-ux-design-expert` (Uma)
- Escopo: todas as rotas Next implementadas, composição das páginas, shell/provider compartilhados e seletor de idioma, módulos de fila e visão geral, helpers de API/i18n, estilos do painel/overlay e entrada atual do overlay.
- Referências: pesquisa UX da FND-6, pesquisa UX da OPS-6, refinamento UX da FND-7 e critérios de paridade OPS-15.
- Método: revisão estática de código e sistema de design. A revisora não alterou arquivos. Contraste no navegador, layout responsivo e percurso por teclado continuam pendentes.
- Score UX antes deste refinamento: **6/10**.

## Achados e resolução

1. Landmarks `<main>` aninhados e ausência de link para pular navegação. Corrigido mantendo o único landmark main do shell e adicionando link localizado para o conteúdo.
2. Nova fila não tinha hierarquia no formulário, explicação dos modos, distinção de limites opcionais, ação de cancelar nem feedback próximo. Reorganizada nas seções identificação, forma de entrada, reward e privacidade/atendimento; adicionadas orientações de modo/apelidos/comando, comando editável sugerido pelo nome e área persistente de ações/feedback.
3. Configurações da fila misturavam atendimento, privacidade do UID e políticas de pontos e não mostravam alterações pendentes. Controles agrupados por propósito; adicionados status de alteração/sem mudanças e ação de cancelar/restaurar. O feedback de salvamento permanece no formulário.
4. Controles e estados da fila ao vivo eram pequenos. Tamanho do texto e alvos interativos aumentados; linhas/ações agora podem quebrar em larguras menores.
5. A próxima ação da visão geral era estática e o texto de migração aparecia mesmo com dados carregados. Agora uma instalação vazia aponta para criação de fila e uma instalação configurada aponta para filas ao vivo; durante o carregamento, mostra uma mensagem localizada.
6. A apresentação mínima do overlay focada em OBS foi aprovada para preservação; não aplicar o tema do painel à transparência configurável pelo streamer.

## Gate reutilizável de design para UI futura

Antes de criar uma rota, módulo de feature ou componente compartilhado, registrar tarefa, hierarquia de conteúdo/ações, estados de carregamento/vazio/erro/pendente/confirmado/desatualizado, comportamento em telas estreitas e com teclado, rótulos localizados e critérios de acessibilidade aplicáveis. Reutilizar padrões compartilhados de cabeçalho, seção/cartão, campo/ajuda/erro, badge de status, estado vazio, barra de ações e resumo de confirmação. Manter textos funcionais legíveis, status compreensíveis sem depender de cor, roxo contido e verde reservado a resultados confirmados. Preservar o escopo WCAG AA da FND-7 para controles/cromos do editor de overlay.

## Revisão no navegador e score atual

- Após a primeira inspeção no navegador identificar três problemas, Uma reavaliou as quatro rotas em 390×844, 768×900 e 1440×900: a barra de ações de Nova fila cobria campos da reward em tablet/desktop; o nome acessível redundante do link da marca falhava no axe; e o overlay renderizava dois landmarks `<main>`.
- Correções: a barra de ações permanece no fluxo normal do documento em todas as larguras; o link da marca usa o texto visível como nome acessível; o wrapper da página do overlay é `<div>` e o widget mantém um único landmark `<main>`.
- **Score UX: 10/10 para as correções revisadas e os estados padrão/vazios nos viewports solicitados.** O axe encontrou zero violações WCAG 2.1 A/AA nas quatro rotas. Títulos e um landmark main estavam presentes; não houve overflow horizontal nem erros de página. A primeira tecla Tab revelou o link de pulo, e o foco por teclado permaneceu visível ao percorrer campos e ações.
- Re-revisão QA independente: **10/10 PASS** para as três correções finais (barra de ações no fluxo, nome acessível da marca e main único no overlay) e seus testes focados. Este é um score QA separado e delimitado.
- Limites do escopo: o estado de fila/configurações preenchidas não foi renderizado no navegador porque o banco de desenvolvimento isolado está vazio; o conteúdo do overlay não foi renderizado porque não havia referência/capability de widget disponível. Nenhum dado foi inserido e nenhuma chamada à Twitch foi feita. Este score não representa a paridade completa da OPS-15.
- Evidência automatizada: testes focados de shell/overlay/Nova fila passaram **8/8**; a suíte completa, exceto `tests/integration/next-static-export.test.js`, passou em **125 arquivos / 1.101 testes** enquanto o servidor Next ativo usa `.next`. `npm run lint`, `npm run typecheck`, localização, versão, denylist de portas e `git diff --check` passaram.

## Reavaliação de estados preenchidos de Operações

- Uma revisou `/operations/`, já aprovada por UX, com dados simulados e um interceptor geral que respondeu todos os métodos/caminhos esperados e abortou qualquer request desconhecido. A revisão final não fez requests reais à API, ao banco ou à Twitch.
- Viewports: 390×844, 768×900 e 1440×900. O shell móvel rola o item ativo da navegação até a área visível (revisão de 390 px: `scrollLeft=284`); não houve overflow horizontal. Grupos/status de operações permaneceram legíveis.
- Diálogos: resolução manual e continuação da exclusão passaram axe WCAG 2.1 A/AA sem violações. Os diálogos cabem em todos os viewports; Cancelar e Escape fecham; o foco por teclado começa em Cancelar, Tab chega à confirmação destrutiva e Enter chama somente a mutação interceptada. A mensagem resultante declara que a Twitch ainda não confirmou.
- Reconciliação e feedback de estado foram revisados com respostas interceptadas. Não houve erros no navegador nem requests de API sem mock.
- **Score UX: 10/10** somente para Operações preenchida, shell móvel, diálogos e estados mockados. Este score não representa paridade completa da OPS-15.
- QA independente final: **10/10 PASS**, sem achados restantes no escopo de Operações. Testes focados passaram 85/85 na rodada QA; a última rodada local focada passou 87/87. A suíte completa está registrada separadamente no handoff ativo.
- Uma tentativa anterior de auditoria por teclado enviou um POST com ID sintético `r` que passou por um mock incompleto. Não houve chamada à Twitch; o ID de outbox obrigatório é UUID, e a rota o consulta antes de qualquer escrita. Não foi capturado status HTTP/log dessa tentativa. Todas as rodadas finais usaram interceptação/abort geral e não a repetiram.
