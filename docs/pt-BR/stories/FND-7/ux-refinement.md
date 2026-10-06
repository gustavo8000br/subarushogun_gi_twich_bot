# Refinamento UX da FND-7 — Widgets do OBS

[English](../../../stories/FND-7/ux-refinement.md)

**Data:** 2026-10-06
**Responsável:** `$aiox-ux-design-expert` (Uma)
**Modo:** pesquisa documental YOLO, conforme instrução permanente do usuário.
**Status:** planejamento UX concluído; nenhuma UI do produto nem validação de usabilidade é alegada.

## Limites da pesquisa

Este é um briefing de design baseado nos requisitos aprovados da FND-7, estrutura/estilos atuais do painel, documento UX operacional da FND-6 e referências oficiais de OBS/Streamlabs/StreamElements. Não houve entrevistas, observação de streamers, análise de métricas ou teste de usabilidade. Persona e escolhas visuais são hipóteses até serem testadas por um streamer.

## Usuário e contexto de live

A pessoa principal é o streamer configurando um overlay local entre atividades da live. Durante a transmissão, a atenção se divide entre jogo, chat, cenas do OBS e painel. O trabalho é: escolher um único valor útil, deixá-lo legível sobre cenários variados, copiar o link uma vez e saber revogá-lo se for exposto. Os erros de maior impacto são escolher campo/fila/viewer errado, colocar a fonte errada no OBS, expor dados além do selecionado e perder o link de capability exibido uma única vez antes de copiá-lo.

Um contexto secundário é moderador/operador ajudando com as filas. URLs de capability do overlay continuam sob gestão do streamer no painel; permissões de chat não dão acesso à gestão dos widgets.

## Referências consultadas

| Referência | Padrão observado | Aplicação na FND-7 |
| --- | --- | --- |
| OBS Browser Source | URL, dimensões da viewport, CSS transparente padrão, opções para descarregar/recarregar, controle de atualização e Page Permissions configurável. A permissão padrão permite ler o status do OBS. | Mostrar dimensões na ajuda; orientar Page Permissions=None; explicar que fonte oculta descarregada recarrega e busca o estado atual. O overlay não pode precisar de API do OBS. |
| Editor de Overlays StreamElements | A pessoa adiciona e seleciona um widget, edita campos configuráveis num painel lateral e usa uma prévia; edição visual e edição de código ficam separadas. | Usar formulário focado, controles limitados e prévia ao vivo, sem editor de código/CSS arbitrário. |
| Dashboard de widgets Streamlabs | A página de um widget oferece ação para copiar URL e orienta adicionar Browser Source e configurar largura/altura. | Separar emissão única da URL das edições normais; tornar explícita a cópia e fornecer passos curtos de configuração do OBS. |
| Recomendações de desempenho do OBS | Muitas Browser Sources e viewports grandes podem elevar o uso de recursos. | Tratar oito páginas ativas como alvo de teste, não recomendação para adicionar fontes ilimitadas; sugerir a menor viewport útil. |

Fontes: [OBS Browser Source](https://obsproject.com/kb/browser-source), [recomendações de desempenho do OBS](https://obsproject.com/kb/encoding-performance-troubleshooting), [Overlays e widgets StreamElements](https://docs.streamelements.com/overlays), [editor de widget personalizado StreamElements](https://docs.streamelements.com/overlays/first-custom-widget), [guia de URLs de widgets Streamlabs](https://support.streamlabs.com/hc/en-us/articles/41706358816667-How-to-Locate-and-Use-Streamlabs-Widget-URLs). Documentação consultada em 2026-10-06. A FND-7 deliberadamente não copia execução de código remoto nem comportamento hospedado na nuvem desses serviços.

## Arquitetura da informação

Adicionar **Widgets do OBS** como item próprio na barra lateral atual, depois de **Comandos do chat** e antes de **Configurações**. Manter assistente/reconexão, filas, recuperação financeira e políticas de comandos nas páginas existentes. A página é um espaço de gestão e nunca uma página pública.

### Página da biblioteca de widgets

- Título **Widgets do OBS**; texto curto explica que cada widget mostra um valor escolhido numa Browser Source local.
- Ação principal **Criar widget**.
- Um cartão por widget, ordenado pelo que foi editado mais recentemente. Cada cartão mostra fonte selecionada e fila quando aplicável, pequena prévia textual segura, resumo de dimensões e estado da capability: **Link ativo**, **Revogado** ou **Widget indisponível**. Não mostrar segredo nos cartões nem nas respostas de listagem/estado.
- Ações por linha: **Editar**, **Copiar link** somente durante o fluxo de emissão única atual (caso contrário, orientar a regenerar), **Regenerar link**, **Revogar**, **Excluir**. Pedir confirmação explícita para revogar/excluir e explicar qual fonte do OBS deixará de receber dados.
- Estado vazio: explicar o benefício em uma frase, com **Criar primeiro widget** e **Como adicionar ao OBS**.
- Aviso operacional liga à ajuda de HTTPS/CA e informa que OBS e bot precisam estar no mesmo computador.

Identidade do widget: como combinações repetidas de fonte/estilo são permitidas e os requisitos não preveem nome persistido, distinguir cartões pela fonte mais um ID local curto e estável. Se houver fontes idênticas, destacar o ID e incluí-lo nos nomes acessíveis. Não adicionar silenciosamente um campo de nome ou comportamento de schema; se o proprietário quiser nomes personalizados, isso exige refinamento de requisito separado.

### Fluxo de criação/edição

Usar formulário de coluna única com prévia persistente ao lado em telas largas e acima do formulário em telas estreitas. Manter seções curtas e progressivas:

1. **O que exibir** — selecionar uma fonte atômica: rótulo da conta; nome/estado/quantidade aguardando da fila (então escolher exatamente uma fila); pessoa chamada/nome ou posição original da espera; pessoa em atendimento; texto fixo. Marcar seleção de fila como obrigatória somente para campos associados à fila. Para pessoa chamada, explicar que chamadas simultâneas mostram a mais antiga; posição é o valor persistido no momento da chamada.
2. **Quando não houver valor** — texto fallback, limitado a 240 pontos de código Unicode; prévia diferencia fallback de valor atual.
3. **Aparência** — controles limitados: cor do texto, fundo opcional e opacidade, menu de fonte, tamanho, peso, alinhamento, efeito, dimensões, margens por lado e overflow. Usar color/number/select nativos com limites inline; nunca exibir campo de CSS/código.
4. **Prévia** — renderizar o widget real em canvas quadriculado/transparente com alternância de fundo claro/escuro para avaliar contraste. Usar valores fictícios inertes e identificar simulação vs dado ao vivo; nunca revelar UID de viewer. Teclado alcança cada controle e a prévia tem descrição acessível curta.
5. Ação de salvar: **Salvar widget**. Alterar fonte/estilo não rotaciona o link. Mostrar sucesso sem expor nem emitir novamente o segredo.

Estilo inicial recomendado (proposta UX): fundo transparente, texto branco `#FFFFFF`, `system-ui`, 32px, peso 700, centralizado, sem contorno/sombra, viewport 640×100, margem 8px e quebra de linha. A prévia deve avisar que texto branco perde contraste em cenas claras e sugerir fundo escuro dentro dos limites com 80% de opacidade quando necessário. São valores editáveis, não limites impostos. Se a medição apontar baixa legibilidade, manter o estilo escolhido e exibir dica específica, sem alterá-lo silenciosamente.

### Link de uso único e transição para OBS

Após criação ou regeneração bem-sucedida, mostrar diálogo focado **Link do widget — copie agora**. Exibir URL HTTPS local completa uma vez, botão **Copiar link** e aviso claro de que o segredo não poderá ser mostrado novamente. Não fechar automaticamente nem navegar antes de copiar ou confirmar o aviso. Após fechar, leituras normais não recuperam o segredo; a ação de recuperação é **Regenerar link**, que invalida o antigo.

Mostrar um cartão curto numerado:

1. No OBS, adicione **Fonte > Navegador (Browser Source)**.
2. Cole a URL HTTPS e configure largura/altura iguais às da prévia.
3. Defina **Page Permissions** como **None**.
4. Mantenha a validação de certificado. Se o OBS mostrar erro, siga apenas passos de confiança do SO/OBS que o projeto já verificou; não use HTTP nem ignore o aviso.
5. Se **Shutdown source when not visible** estiver ativo, a página recarrega ao aparecer e busca o estado atual do widget.

Incluir ações para copiar URL e marcar instruções como lidas; não tentar abrir nem configurar o OBS automaticamente.

## Estados e microcopy

| Estado | Exibição do overlay | Texto/ação no painel |
| --- | --- | --- |
| Primeira projeção carregando | Estado neutro, sem dados sensíveis | “Carregando prévia…” |
| Valor carregado | Somente o texto selecionado | “Prévia atualizada” |
| Campo vazio com sucesso | Fallback configurado | “Sem valor agora — mostrando o texto alternativo.” |
| Falha transitória inicial | Indisponível neutro; sem inventar valor | “Não foi possível carregar. Tentaremos novamente.” |
| Falha transitória depois de um valor | Manter valor com marcador visível **Desatualizado** | “Conexão temporariamente indisponível. O valor pode estar desatualizado.” |
| Recuperação | Valor atual; remover marcador stale | “Conexão restaurada.” |
| 401/403/404 | Limpar valor imediatamente | “Este link não está ativo. Gere um novo link no painel.” Não revelar se outro widget existe. |
| Link revogado | Sem dados | “Link revogado. A fonte do OBS não recebe mais dados.” |
| Conflito de edição/versão | Manter valores atuais do editor e a prévia | “As configurações mudaram em outra tela. Atualize antes de salvar.” |
| Falha de confiança do certificado CEF | Sem fallback inseguro | “O OBS não confiou no certificado HTTPS local. Consulte os passos verificados para esta versão.” |

Status nunca depende só de cor. Não incluir stack trace, token, UID ou segredo de certificado em mensagens. Polling/avisos de atualização usam região viva polite e nunca movem o foco do teclado.

## Direção visual e acessibilidade

Reutilizar superfícies escuras locais da FND-6, roxo contido para ação/foco principal, fontes do sistema, bordas e espaçamentos. Separar visualmente a prévia do editor para deixar claro que ela é um canvas de exemplo, não parte da transmissão. Não adicionar fontes, imagens, scripts externos nem telemetria.

Meta WCAG AA: foco visível, ordem semântica de títulos, labels/unidades explícitas, controles de fonte/estilo operáveis por teclado, status por texto e ícone/forma, contraste adequado no painel, respeito a redução de movimento e erro legível próximo ao campo correspondente. A saída escolhida pelo streamer pode ter contraste baixo; avisar na prévia, sem sobrescrevê-la.

## Wireframe

```text
┌ Barra lateral ───────┐  ┌ Widgets do OBS ────────────────────────────────────────┐
│ Visão geral          │  │ Cada widget mostra um dado numa fonte Browser local...│
│ Filas e atendimentos│  │                                  [Criar widget]        │
│ Nova fila            │  ├────────────────────────────────────────────────────────┤
│ Operações financeiras│ │ Fila: Abismo · Pessoas aguardando      Link ativo       │
│ Comandos do chat     │  │ Prévia: 4 aguardando · 640 × 100                         │
│ Widgets do OBS   ←   │  │ [Editar] [Regenerar link] [Revogar] [Excluir]             │
│ Configurações        │  ├────────────────────────────────────────────────────────┤
│ Conexão Twitch       │  │ Conta atual · ...                                         │
└──────────────────────┘  └────────────────────────────────────────────────────────┘

Editor: [Fonte e fila] → [Fallback] → [Aparência] → [Prévia] → [Salvar widget]
Depois de criar/regenerar: [URL secreta de uso único + Copiar] → [Passos OBS]
```

## Decisões para handoff da implementação

- Manter o catálogo de fontes atômico e todas as fontes aprovadas disponíveis.
- Usar regra determinística para chamadas definida na spec; não transformar overlay em lista de pessoas.
- DTOs de listagem/leitura nunca carregam segredo. URL completa aparece apenas no fluxo de criação/regeneração bem-sucedido.
- Mostrar URL HTTPS atual do app; FND-7 não acrescenta modo HTTP nem outro serviço runtime.
- Verificar SO/OBS/CEF alvo antes de publicar instruções de certificado ou compatibilidade.
- Nenhum teste visual de usabilidade ocorreu. Antes de concluir FND-7, pedir a um streamer que não implementou o código para criar widget, copiar, adicioná-lo ao OBS, reconhecer estados stale/revogado e revogar/regenerar; registrar problemas observados sem antecipar resultado.

## Gate de implementação

Este artefato é handoff de design, não implementação. Ele conclui a entrega de planejamento UX da FND-7. A implementação de UI ainda segue o plano de 24 tarefas, ciclos test-first, testes PostgreSQL reais, gates HTTPS/OBS nativo e verificações de acessibilidade documentadas.
