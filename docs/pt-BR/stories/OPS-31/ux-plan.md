# OPS-31 — Plano de UX: devolução de pontos por grupo e avisos de fila

[English](../../../stories/OPS-31/ux-plan.md)

**Autora:** `@ux-design-expert` (Uma) — **Data:** 2026-11-11 — **Modo:** YOLO (dono ausente; decisões marcadas `[AUTO-DECISION]`).
**Story:** [story.md](story.md) (ACs 1-28) — **Design:** [architect-design.md](architect-design.md) (D-31-1..D-31-11, perguntas da seção 10) — **Pesquisa:** [nota queue-group-refund](../../research/2026-11-06-queue-group-refund/README.md) (só resumo; sem pesquisa nova).
**Classe de evidência:** **revisão estática** do design, da story e dos padrões de código do painel (`apps/frontend/features/queues/`, `outcome-region.jsx`, catálogos do painel). **Não validado:** ver seção 9.

## 1. Respostas às oito perguntas do `@architect`

| # | Pergunta | Decisão | Motivo |
|---|---|---|---|
| 1 | Devolver / não devolver: modal ou inline; como tornar "não devolver" definitivo sem segunda confirmação | **Modal `<dialog>` nativo** (mesmo padrão do diálogo de limpeza), **um passo**: dois botões de mesmo peso mais "Voltar". Cada botão **é** a confirmação. O rótulo diz a consequência ("Não devolver (definitivo)") e o corpo do diálogo diz em uma frase. Nenhuma escolha pré-selecionada, nenhum foco inicial em uma das escolhas (o foco vai para o título). | O painel já usa `<dialog>` com `showModal()` em ações destrutivas: armadilha de foco, `Esc` e fundo inerte de graça. O modal evita clique acidental na linha de trás. Um controle inline é fácil de errar numa live. Um passo mantém a live andando: o rótulo explícito é a "confirmação específica"; uma segunda confirmação só traria atrito (devolver também é irreversível, então as duas escolhas têm o mesmo peso) |
| 2 | Três marcas na linha da entrada | Selos de texto, nunca só cor: **"Pontos retidos até o fim"**, **"Verificar grupo"**, **"Aguardando sua decisão"**. Distintos das palavras da OPS-22 ("Estado desconhecido · revise no painel") e exibidos em outra tela | Palavras, lugar (tela de filas x tela de operações) e ação diferentes, como o design exige (D-31-8, regra 4) |
| 3 | Onde mora a lista de pendências | Uma **seção "Decisões pendentes" na página de Filas**, acima dos cartões, agrupada por fila, mais um **selo de contagem** em cada cartão de fila e no item "Filas" da navegação. Sem página nova | As entradas saem da fila, então uma lista na linha do cartão sumiria após uma limpeza. A página de Filas é onde o streamer já trabalha; a contagem no item de navegação sobrevive ao fim da live e ao próximo login. Não fica em Operações (não misturar com a OPS-22). Evita página nova (e a obrigação do `PageLayout`) |
| 4 | Escolha em lote de três e contagens | Estender o `<dialog>` de limpar/excluir: **linha de contagens** (do grupo, fora do grupo, a verificar) e **grupo de rádios com três opções** para quem é do grupo. **Nenhuma opção pré-selecionada**; "Confirmar" fica desabilitado com motivo visível até escolher (só quando há integrantes) | Escolha obrigatória e consciente, coerente com "nada é devolvido automaticamente". Rádios (não três botões) para que a pressão dos 15 s não empurre um clique |
| 5 | Chaves de grupo, "aguardando reconexão", texto de `moderation:read` | Fieldset "Quem recebe os pontos de volta" com quatro caixas. Um grupo sem o escopo pode ser marcado e salvo: mostra o selo **"Aguardando reconexão"** e, depois de salvar, o botão **"Reconectar com a Twitch"** (reaproveita `panel.connection.reconnect`). A linha de moderadores traz um motivo curto para a permissão ampla | D-31-5 regra 8 |
| 6 | Aviso de retenção e "verificado no momento da decisão" | Um parágrafo visível **logo abaixo do controle do momento** (não em tooltip), ligado por `aria-describedby`; texto na seção 6 | AC 11: no próprio controle |
| 7 | Textos e quais avisos começam ligados | Seção 7. Filas novas: **ligados** entrada, atendimento/vez, estado da fila, resultado dos pontos; **desligado** "reordenação". **Filas existentes migram com todos os avisos desligados** | Segue a regra de compatibilidade ("filas existentes se comportam como hoje", D-31-7); reordenar é frequente e barulhento |
| 8 | Posição de uma entrada adiada ou restaurada | **Confirmada: posição 2** (logo após a primeira entrada aguardando). Painel e chat informam a nova posição | A pessoa não vai para o fim e a próxima não é ultrapassada duas vezes; informar a posição tira a surpresa |

## 2. Telas e fluxos

### 2.1 Configurações da fila — bloco "Pontos" (FT-74)

Fica no formulário de configurações existente (`queue-settings-form.jsx`), depois das três chaves de reembolso, como `<fieldset>` com `<legend>` "Pontos do Canal".

1. **Momento** (grupo de rádios, 2 opções): "Usar os pontos quando o atendimento começar (padrão)" / "Devolver os pontos ao terminar o atendimento, para os grupos que eu escolher".
2. **Aviso de retenção** (parágrafo abaixo dos rádios, sempre visível com a segunda opção marcada, legível também com a primeira). `aria-describedby` do grupo de rádios.
3. **Grupos** (fieldset, quatro caixas, visível e habilitado só com o segundo momento; recolhido caso contrário): inscritos, moderadores, VIPs, minha lista própria (link "gerenciar a lista em Configurações"). O streamer sempre conta como integrante (uma linha explica).
4. **Conjunto vazio**: permitido, com dica não bloqueante "Nenhum grupo escolhido: ninguém terá os pontos devolvidos."
5. **Desabilitado com motivo** (AC 12): o modo de devolução inteiro mostra a primeira condição que falha como texto ao lado do rádio (`aria-describedby`), nunca só um controle cinza. Motivos: recompensa não criada por este app; pular a fila de solicitações ligado; canal não é afiliado/parceiro. Escopo ausente **não** é desabilitado (é "aguardando reconexão", ver 2.7).
6. **Avisos** (fieldset separado "Avisos no chat", cinco chaves, seção 7.2).
7. O controle do modo de devolução **não é renderizado** até a FT-76 ser entregue (a API o recusa), então nenhum texto de uma funcionalidade pela metade vai ao ar.
8. Salvar: reaproveita o retorno do formulário (`role="status"` / `role="alert"`). Se a fila já tem resgates retidos, mudar o momento mostra: "Esta mudança vale para novas decisões. Os pontos já retidos mantêm a regra com que foram decididos." (regra do snapshot, D-31-2 regra 5).

### 2.2 Decidir ao encerrar a entrada de um integrante de grupo (FT-76, FT-72; AC 20)

Gatilho: o streamer clica em remover, cancelar ou ausente numa linha. O botão fica `aria-busy` e uma linha `role="status"` diz "Verificando o grupo…" (a consulta roda no servidor; só em filas no modo de devolução com grupos). Três resultados:

- **Fora do grupo**: comportamento de hoje, sem pergunta.
- **Do grupo**: a API responde "escolha necessária"; o painel abre o **diálogo de decisão**.
- **Desconhecido**: a entrada é encerrada, os pontos continuam retidos e o retorno diz "Não foi possível verificar o grupo. Os pontos de {nome} continuam retidos. Decida em Decisões pendentes." com link para a seção.

**Diálogo de decisão** (um componente, usado também pela lista de pendências):

- Título (heading, recebe o foco): "Devolver os pontos de {nome}?"
- Corpo: "{nome} está em um grupo que recebe os pontos de volta. A entrada é encerrada sem um atendimento concluído."
- Botão 1 (estilo primário): **"Devolver os pontos"**. Ajuda: "Pedimos à Twitch a devolução dos pontos. A Twitch confirma depois."
- Botão 2 (estilo secundário, mesmo tamanho): **"Não devolver (definitivo)"**. Ajuda: "O resgate é concluído e os pontos não voltam. Isso não pode ser desfeito."
- Botão 3 (estilo link): "Voltar" — fecha sem nenhuma mudança; `Esc` faz o mesmo.
- Nenhuma escolha tem foco inicial ou é padrão; `Enter` no título não faz nada.
- Os dois textos de ajuda são `aria-describedby` do respectivo botão.
- Durante a requisição: os dois botões `disabled` + `aria-busy` e uma linha `role="status"` "Salvando sua decisão…". Em sucesso o diálogo fecha. Em "já decidido" (D-31-3): o diálogo fecha e o retorno do cartão diz "Já decidido: pontos devolvidos / não devolvidos." (`role="status"`).
- Pular: **sem pergunta**. Retorno: "{nome} foi para a posição {posição}. Os pontos continuam retidos até a pessoa sair da fila." (só integrantes).
- Gatilhos que não podem perguntar (ausência por temporizador, comandos de chat, pessoa sai): a entrada é encerrada e aparece em Decisões pendentes como "Aguardando sua decisão". O retorno no cartão (com o painel aberto) é uma linha `role="status"` "{nome} saiu da fila. Pontos aguardando sua decisão." com link para a seção.

### 2.3 Encerramento em lote: limpar e excluir (AC 26)

Estende os diálogos de `queue-clear` e de confirmação de exclusão.

1. Passo 1 (carregando, `role="status"`): "Verificando os grupos…". A falha aqui nunca bloqueia a limpeza: essas pessoas contam como "a verificar".
2. Linha de contagens (chaves de plural): "{members} em grupo, {others} fora do grupo, {check} para verificar."
3. Uma frase por faixa (texto visível): fora do grupo → "devolução solicitada como hoje"; a verificar → "ficam retidos em Decisões pendentes"; do grupo → escolha abaixo.
4. Grupo de rádios (legenda "Para as pessoas em um grupo"), **nenhum selecionado**: "Devolver os pontos de todos" / "Não devolver (definitivo)" / "Decidir um a um depois".
5. Botões, na ordem de tabulação depois dos rádios: "Confirmar" e depois "Voltar". "Confirmar" fica desabilitado, com `aria-describedby` "Escolha o que acontece com os pontos das pessoas em grupo.", até um rádio ser marcado. Sem integrantes o grupo de rádios não é renderizado e o diálogo fica como hoje mais as contagens.
6. A validade atual de 15 s é curta para uma decisão. `[AUTO-DECISION]` pedir ao `@dev` **60 s quando há integrantes** (a guarda do snapshot continua); quando o snapshot muda, o alerta "a fila mudou" existente aparece, as contagens são atualizadas e a seleção dos rádios é **zerada** (uma escolha feita para outros números não é reaproveitada).
7. Variante de exclusão: acrescenta "A fila continua em exclusão até que cada decisão pendente seja tomada." quando a escolha é "decidir um a um" ou há pessoas a verificar.
8. Resultado (`role="status"` no retorno do cartão): "{count} pessoas removidas. Devolução solicitada para {refunds}; {pending} aguardam sua decisão." Nunca "devolvidos" (D-31-6 regra 6).

### 2.4 Seção Decisões pendentes (FT-77; AC 21)

- Título "Decisões pendentes" (`h2`), contagem no título; aparece só com ao menos um item; do contrário o texto vazio aparece uma vez, discreto ("Nada aguardando decisão."), para o streamer aprender onde mora.
- Agrupada por fila (`<section aria-label>` por fila, título da fila em `h3`). Linha: nome de exibição, marca ("Aguardando sua decisão" ou "Verificar grupo"), para "Verificar grupo" o motivo em linguagem simples (7.4) e há quanto tempo.
- Linha **Aguardando sua decisão**: um botão "Decidir…" (abre o diálogo de decisão).
- Linha **Verificar grupo**: dois botões: "Verificar de novo" e "Decidir…" (diálogo com Devolver / Não devolver / "Decidir depois"; "Decidir depois" é o "manter" do AC 21 e não muda nada). Sob "Verificar de novo", dica visível: "Se a pessoa não estiver no grupo, o resgate é concluído sem devolução." (consequência antes do clique).
- Lote: caixa de seleção por linha, por fila, e uma barra "Selecionar tudo / {n} selecionadas" com "Decidir para as selecionadas…" (mesmo diálogo, texto "…das {n} pessoas selecionadas"). A caixa de cada linha tem o nome da pessoa como rótulo.
- Resultado de "Verificar de novo" (`role="status"`): no grupo e ainda em atendimento → "Está em um grupo. Os pontos continuam retidos até o fim."; no grupo e encerrada → "Está em um grupo. Decida sobre os pontos."; fora do grupo → "Não está em um grupo. Resgate concluído sem devolução."; ainda desconhecido → "Ainda não foi possível verificar. {motivo}".
- Sobrevive a limpeza, fim da live e reinício; nunca expira sozinha (AC 21).
- Responsivo: abaixo de 600 px as linhas empilham (nome e marca na primeira linha, botões em largura total abaixo).

### 2.5 Estados visíveis na fila e no widget

- Selo no cartão da fila: "{n} aguardando sua decisão" (link para a seção), só com n > 0, com texto e um ícone do conjunto já usado pelo projeto (o arquivo de mapa de ícones `app/components/ui/icons/icon-map.ts` não existe neste repositório; usar os ícones que o painel já usa e **não inventar nenhum**; a marca também precisa ser legível como texto).
- Linha em atendimento de integrante: marca "Pontos retidos até o fim" e, sob o botão concluir, a dica "Ao concluir, solicitamos a devolução dos pontos." (`aria-describedby` de "concluir"). Depois de concluir: retorno do cartão "Atendimento concluído. Devolução solicitada; a Twitch vai confirmar." (`role="status"`).
- Marca "Verificar grupo" em qualquer linha: com link "Decida em Decisões pendentes".
- Adiado / restaurado: o retorno informa a nova posição.
- **Widget "próximo" (AC 8):** uma linha extra "Próximo: {nome}" dentro do widget da conta, menor que o nome atual, na cor de texto configurada do widget (o contraste segue as cores já existentes do editor; ≥ 4,5:1 contra o fundo configurado é verificação do `@qa`). Uma linha, `text-overflow: ellipsis`, sem UID nem login. **Sem entrada aguardando: a linha nem é renderizada** (nada de "Próximo: —", nem caixa vazia). Sem chave liga/desliga nesta story `[AUTO-DECISION]` (não está nos ACs; reabrir a pedido). O widget é lido dentro do OBS, então não tem região viva. A prévia do editor mostra o exemplo "Próximo: Nome de exemplo".

### 2.6 Lista própria (Configurações, FT-74; AC 10)

- Seção "Lista própria de devolução" nas Configurações do canal: "Pessoas de confiança. Usada por toda fila com este grupo marcado. Fica guardado: o número da conta da Twitch e um rótulo."
- Formulário: login (resolvido uma vez ao adicionar; reaproveita o erro `twitch_user_not_found`), rótulo (opcional, máx. 40; **preenchido com o login digitado**, editável, para a lista ser legível `[AUTO-DECISION]`, guardado como rótulo), "Adicionar". Contador "{n} de 500".
- Lista (`<ul>`): rótulo, data de inclusão, "Remover" por linha (sem diálogo, reversível adicionando de novo; resultado `role="status"` "{rótulo} removido.", foco vai para a próxima linha ou para o título quando a lista esvazia).
- "Limpar tudo": abre um `<dialog>` com a contagem "Remover as {n} pessoas da lista? As filas que usam este grupo não devolverão ninguém dela."; botões "Voltar" / "Limpar lista".
- Vazio: "Ainda não há ninguém na lista." Erros: não encontrado, já na lista, limite atingido (7.5).

### 2.7 Reautorização por escopo (FT-75; AC 16)

1. O streamer marca um grupo cujo escopo falta e **salva**. O grupo mostra "Aguardando reconexão" e o texto: "Para verificar {grupo}, a Twitch precisa da sua permissão. {motivo}". O botão de reconexão aparece **só quando o formulário não tem alterações não salvas** (senão a dica "Salve primeiro e depois reconecte.").
2. "Reconectar com a Twitch" sai para a autorização da Twitch (navegação completa). O painel não promete o que a Twitch vai listar (o item 6 do teste real está aberto).
3. Na volta, a região de resultado anuncia: sucesso → "Twitch reconectada. Permissão de {grupo} concedida." e o foco vai para a região de resultado; não concedida → "A permissão de {grupo} não foi concedida. O grupo continua aguardando reconexão." (`alert`).
4. Motivo dos moderadores (escopo amplo): "A Twitch agrupa a leitura de moderadores em uma permissão ampla de moderação, somente leitura. O app só pergunta se a pessoa é moderadora."
5. Até ser concedido, as consultas desse grupo falham → "Verificar grupo" com motivo `scope_missing`; a linha em Decisões pendentes oferece "Reconectar com a Twitch" ao lado de "Verificar de novo".
6. Conexões existentes continuam funcionando: os escopos obrigatórios não mudam; sem aviso nem reconexão forçada para quem nunca ativa um grupo.

### 2.8 Erros e vazios

Falhas genéricas usam o texto genérico localizado do painel com `referenceId` (o OutcomeRegion mostra). Nunca mensagem da Twitch, UID ou stack. Tabela de textos em 7.5.

## 3. Mapeamento para os padrões existentes (reaproveitar e conflitos)

| Necessidade | Reaproveitar | Conflito / adaptação |
|---|---|---|
| Decisões em modal | `<dialog class="operation-confirmation">`, `showModal()`, `aria-labelledby`/`describedby` (diálogo de limpeza, de recompensa) | O diálogo de limpeza foca o primeiro controle; aqui o foco vai ao **título** (`tabindex="-1"`) para nenhuma escolha ficar armada |
| Mensagens de resultado | `queue-action-feedback` no cartão com `role=status`/`alert` (queue-list); `OutcomeRegion` para resultados da página (dois elementos vivos sempre montados, papel nunca trocado) | Não montar região viva nova por diálogo; escrever nas regiões existentes. Resultados de reconexão vão ao `OutcomeRegion` |
| Foco ao fechar | Padrão do chamar-próximo (`statusRef.current.focus()`) | A linha do gatilho pode ter sumido (entrada removida): focar a região de retorno do cartão (`tabindex="-1"`) e depois o título da seção de pendências |
| Botões | `small-action`, `button button-secondary` | A classe `.small-action` não tem definição encontrada nos estilos lidos; a altura **não foi verificada** (item do checklist) |
| Plurais | Chaves de plural do `OutcomeRegion` (`.one/.other`) | Chaves de contagem novas precisam de `.one` e `.other` nos três idiomas |
| Chaves liga/desliga | Chaves `queue_settings.*` existentes | Avisos e grupos são fieldsets novos, não três linhas a mais na lista antiga |
| Reconectar | `panel.connection.reconnect` | — |

## 4. Acessibilidade e responsividade

- **Regiões vivas:** resultados `role="status"`; recusas/falhas `role="alert"`; as duas ficam montadas (regra do projeto). A linha "Verificando o grupo…" é `role="status"` e o botão que a disparou fica `aria-busy`. Nenhuma região troca de papel com texto.
- **Foco:** abrir diálogo → título; fechar → gatilho ou, se sumiu, região de retorno; volta da reconexão → região de resultado; "Remover" da lista → próxima linha; nada rouba foco por temporizador.
- **Ordem de tabulação:** configurações: rádios do momento → aviso de retenção (não focável) → caixas de grupo → reconectar (quando exibido) → chaves de aviso → Salvar. Diálogo de decisão: título → Devolver → Não devolver → Voltar. Diálogo em lote: título → rádios → Confirmar → Voltar. Lista de pendências: ação(ões) da linha na ordem visual; barra de lote antes das linhas.
- **Alvos:** todo botão, caixa e rádio novo com ao menos 44 x 44 px incluindo a área do rótulo, em 320, 390 e 768 px; 8 px entre os dois botões de decisão; em 320 px os botões de decisão ficam em largura total, empilhados.
- **Contraste:** texto e texto de selo com ao menos 4,5:1, texto grande e bordas de controle 3:1; marcas usam texto + ícone, nunca só cor; o "definitivo" é texto, não só vermelho. O `@qa` mede; os valores da paleta não foram recalculados aqui.
- **Ações destrutivas:** "Não devolver (definitivo)" (diálogo de decisão, lote, pendências), "Limpar lista". Cada uma nomeia a consequência no próprio rótulo ou ajuda, como confirmação específica.
- **Zoom/reflow:** diálogos rolam internamente em 320 px e zoom 200%; sem rolagem horizontal; nomes longos quebram (`overflow-wrap: anywhere`).
- **Movimento:** nenhum estado exige animação.
- **Idioma:** `lang` segue o idioma do painel; os textos de chat seguem o idioma do canal.
- **Leitores de tela:** projetado para eles, **não testado**; risco aceito pelo dono.

## 5. Contraste com a story e com o design

- Pular não pergunta (design D-31-4) — implementado como em 2.2. É o único ponto em que o AC 20 lista "pular" e o design restringe; o plano segue o design.
- A marca "Verificar grupo" nunca usa o vocabulário da OPS-22 (design D-31-8): "desconhecido" nunca aparece para ela.
- "Verificar de novo" nas pendências tem consequência final para quem não é do grupo; ela é dita antes do clique em vez de um segundo diálogo (o caminho normal também a concluiria).

## 6. Texto do aviso de retenção

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.settlement.retention` | The group is checked when service starts or when the entry is closed, not when the person joins. For people in a chosen group, the redemption stays pending on Twitch and the points only come back after you finish the service. Everyone else is served as usual. | El grupo se comprueba cuando empieza la atención o se cierra la entrada, no cuando la persona se une. Para quien está en un grupo elegido, el canje queda pendiente en Twitch y los puntos solo vuelven cuando termines la atención. A los demás se les atiende como siempre. | O grupo é verificado quando o atendimento começa ou a entrada é encerrada, não quando a pessoa entra na fila. Para quem está em um grupo escolhido, o resgate fica pendente na Twitch e os pontos só voltam depois que você concluir o atendimento. As demais pessoas são atendidas como sempre. |

## 7. Chaves de catálogo

Regras: sem jargão; sem UID nem erro bruto; o pt-BR mantém "recompensa" para a reward; "Pontos do Canal" para os pontos; "resgate" para a redemption; textos de chat curtos (bem abaixo de 500 caracteres; o remetente compõe listas com `more_suffix`). `{user}` e `{queue}` seguem o estilo de marcador já existente. Chaves de plural têm `.one` e `.other` nos três idiomas (o espanhol também `.many` onde a ferramenta de catálogo exigir, como as chaves existentes).

### 7.1 Avisos de chat (catálogo `chat`; as chaves do `@architect` mais as marcadas **nova**)

| Key | en | es | pt-BR |
|---|---|---|---|
| `chat.notice.joined` | @{user}, you joined {queue} at position {position}. We will tell you when it is your turn. | @{user}, entraste en la cola {queue} en la posición {position}. Te avisaremos cuando sea tu turno. | @{user}, você entrou na fila {queue} na posição {position}. Avisaremos quando for a sua vez. |
| `chat.notice.joined_many` | {count} people joined {queue}. Use the queue command to see your position. | {count} personas entraron en la cola {queue}. Usa el comando de la cola para ver tu posición. | {count} pessoas entraram na fila {queue}. Use o comando da fila para ver sua posição. |
| `chat.notice.refused.queue_closed` | @{user}, {queue} is closed. This redemption was refused and the return of your points was requested. | @{user}, la cola {queue} está cerrada. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, a fila {queue} está fechada. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.refused.queue_paused` | @{user}, {queue} is paused. This redemption was refused and the return of your points was requested. | @{user}, la cola {queue} está en pausa. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, a fila {queue} está em pausa. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.refused.duplicate_entry` | @{user}, you are already in {queue}. This redemption was refused and the return of your points was requested. | @{user}, ya estás en la cola {queue}. Este canje se rechazó y se solicitó la devolución de tus puntos. | @{user}, você já está na fila {queue}. Este resgate foi recusado e a devolução dos seus pontos foi solicitada. |
| `chat.notice.queue_paused` | {queue} is paused. New redemptions will be refused and the points returned. | La cola {queue} está en pausa. Los canjes nuevos se rechazarán y se devolverán los puntos. | A fila {queue} está em pausa. Novos resgates serão recusados e os pontos devolvidos. |
| `chat.notice.queue_closed` | {queue} is closed. New redemptions will be refused and the points returned. | La cola {queue} está cerrada. Los canjes nuevos se rechazarán y se devolverán los puntos. | A fila {queue} foi fechada. Novos resgates serão recusados e os pontos devolvidos. |
| `chat.notice.queue_reopened` | {queue} is open again. Redeem the reward to join. | La cola {queue} está abierta otra vez. Canjea la recompensa para entrar. | A fila {queue} foi reaberta. Resgate a recompensa para entrar. |
| `chat.notice.service_ended` | @{user}, your service in {queue} is finished. Thank you! | @{user}, tu atención en la cola {queue} terminó. ¡Gracias! | @{user}, seu atendimento na fila {queue} terminou. Obrigado! |
| `chat.notice.service_ended_next` (**nova**) | @{user}, your service in {queue} is finished. Next: @{next}. | @{user}, tu atención en la cola {queue} terminó. Sigue: @{next}. | @{user}, seu atendimento na fila {queue} terminou. Próximo: @{next}. |
| `chat.notice.next_up` (**nova**) | @{user}, you are next in {queue}. Be ready! | @{user}, eres el siguiente en la cola {queue}. ¡Prepárate! | @{user}, você é o próximo da fila {queue}. Fique atento! |
| `chat.notice.no_show` | @{user}, you did not answer the call in {queue} and were marked absent. | @{user}, no respondiste a la llamada en la cola {queue} y se te marcó como ausente. | @{user}, você não respondeu à chamada na fila {queue} e foi marcado como ausente. |
| `chat.notice.skipped` | @{user}, your turn in {queue} was moved. You are now at position {position}. | @{user}, tu turno en la cola {queue} se aplazó. Ahora estás en la posición {position}. | @{user}, sua vez na fila {queue} foi adiada. Você agora está na posição {position}. |
| `chat.notice.restored` | @{user}, your absence was undone. You are back in {queue} at position {position}. | @{user}, se deshizo tu ausencia. Volviste a la cola {queue} en la posición {position}. | @{user}, sua ausência foi desfeita. Você voltou à fila {queue} na posição {position}. |
| `chat.notice.reordered` | The order of {queue} changed. Use the queue command to see your position. | El orden de la cola {queue} cambió. Usa el comando de la cola para ver tu posición. | A ordem da fila {queue} mudou. Use o comando da fila para ver sua posição. |
| `chat.notice.cleared.one` | {queue} was cleared. {count} person removed. | Se vació la cola {queue}. Se quitó {count} persona. | A fila {queue} foi limpa. {count} pessoa removida. |
| `chat.notice.cleared.other` | {queue} was cleared. {count} people removed. | Se vació la cola {queue}. Se quitaron {count} personas. | A fila {queue} foi limpa. {count} pessoas removidas. |
| `chat.notice.cleared_refunds` (**nova**, sufixo) | Points return requested for {refunds}. | Devolución de puntos solicitada para {refunds}. | Devolução de pontos solicitada para {refunds}. |
| `chat.notice.cleared_pending` (**nova**, sufixo) | {pending} waiting for a decision. | {pending} esperan una decisión. | {pending} aguardam uma decisão. |
| `chat.notice.points.refund_requested` | @{user}, we asked Twitch to return your points. We will tell you when it is confirmed. | @{user}, pedimos a Twitch que devuelva tus puntos. Te avisaremos cuando se confirme. | @{user}, pedimos à Twitch a devolução dos seus pontos. Avisaremos quando for confirmada. |
| `chat.notice.points.refunded` | @{user}, your Channel Points were returned. | @{user}, tus puntos del canal fueron devueltos. | @{user}, seus Pontos do Canal foram devolvidos. |
| `chat.notice.points.not_refunded` | @{user}, your redemption was completed and the points will not be returned this time. | @{user}, tu canje se completó y los puntos no se devolverán esta vez. | @{user}, seu resgate foi concluído e os pontos não serão devolvidos desta vez. |
| `chat.notice.points.pending_decision` | @{user}, you left {queue}. The streamer will decide about your points. | @{user}, saliste de la cola {queue}. El streamer decidirá sobre tus puntos. | @{user}, você saiu da fila {queue}. O streamer vai decidir sobre os seus pontos. |
| `chat.notice.more_suffix.one` / `.other` | ` and {count} more` | ` y {count} más` | ` e mais {count}` |

Regras: `refunded` só é enviado depois que a Twitch confirma (D-31-10); "Verificar grupo" **não** envia mensagem no chat (revelaria um estado interno); a família de recusa nunca usa as palavras da família de pontos (AC 28); o texto de fim de atendimento usa `service_ended_next` quando há alguém aguardando e `service_ended` caso contrário.

### 7.2 Painel — configurações e avisos

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.settlement.legend` | Channel Points | Puntos del canal | Pontos do Canal |
| `panel.settlement.mode.start` | Use the points when service starts (default) | Usar los puntos cuando empieza la atención (predeterminado) | Usar os pontos quando o atendimento começar (padrão) |
| `panel.settlement.mode.end` | Return the points when service ends, for the groups I choose | Devolver los puntos al terminar la atención, para los grupos que elija | Devolver os pontos ao terminar o atendimento, para os grupos que eu escolher |
| `panel.settlement.retention` | (seção 6) | (seção 6) | (seção 6) |
| `panel.settlement.groups.legend` | Who gets points back | Quién recibe los puntos de vuelta | Quem recebe os pontos de volta |
| `panel.settlement.groups.self` | You always count as a member of the chosen groups. | Tú siempre cuentas como miembro de los grupos elegidos. | Você sempre conta como membro dos grupos escolhidos. |
| `panel.settlement.group.subscriber` | Subscribers (paid, gifted and Prime) | Suscriptores (de pago, regalados y Prime) | Inscritos (pagos, presenteados e Prime) |
| `panel.settlement.group.moderator` | Moderators | Moderadores | Moderadores |
| `panel.settlement.group.vip` | VIPs | VIP | VIPs |
| `panel.settlement.group.own_list` | My own list | Mi propia lista | Minha lista própria |
| `panel.settlement.group.manage_list` | Manage the list in Settings | Gestionar la lista en Ajustes | Gerenciar a lista em Configurações |
| `panel.settlement.group.empty_hint` | No group chosen: nobody will get points back. | Ningún grupo elegido: nadie recibirá puntos de vuelta. | Nenhum grupo escolhido: ninguém terá os pontos devolvidos. |
| `panel.settlement.group.pending_reconnect` | Waiting for reconnection | Esperando reconexión | Aguardando reconexão |
| `panel.settlement.group.needs_scope` | To check {group}, Twitch needs your permission. | Para comprobar {group}, Twitch necesita tu permiso. | Para verificar {group}, a Twitch precisa da sua permissão. |
| `panel.settlement.group.reason.moderator` | Twitch groups the reading of moderators under a wide, read-only moderation permission. The app only asks whether a person is a moderator. | Twitch agrupa la lectura de moderadores en un permiso amplio de moderación, solo de lectura. La app solo pregunta si una persona es moderadora. | A Twitch agrupa a leitura de moderadores em uma permissão ampla de moderação, somente leitura. O app só pergunta se a pessoa é moderadora. |
| `panel.settlement.group.save_first` | Save first, then reconnect. | Guarda primero y luego reconecta. | Salve primeiro e depois reconecte. |
| `panel.settlement.group.reconnect` | Reconnect to Twitch | Reconectar con Twitch | Reconectar com a Twitch |
| `panel.settlement.unavailable.reward_not_owned` | Not available: this reward was not created by this app. | No disponible: esta recompensa no la creó esta app. | Indisponível: esta recompensa não foi criada por este app. |
| `panel.settlement.unavailable.skip_queue` | Not available: the reward skips the request queue on Twitch. | No disponible: la recompensa se salta la cola de solicitudes de Twitch. | Indisponível: a recompensa pula a fila de solicitações da Twitch. |
| `panel.settlement.unavailable.not_affiliate` | Not available: the channel must be affiliate or partner. | No disponible: el canal debe ser afiliado o socio. | Indisponível: o canal precisa ser afiliado ou parceiro. |
| `panel.settlement.change_applies_later` | This change applies to new decisions. Points already held keep the rule they were decided under. | Este cambio se aplica a decisiones nuevas. Los puntos ya retenidos mantienen la regla con la que se decidieron. | Esta mudança vale para novas decisões. Os pontos já retidos mantêm a regra com que foram decididos. |
| `panel.notice_settings.legend` | Chat notices | Avisos en el chat | Avisos no chat |
| `panel.notice_settings.joined` | Say the position when someone joins | Decir la posición cuando alguien entra | Avisar a posição quando alguém entrar |
| `panel.notice_settings.service` | Announce end of service, next person, absences and skips | Avisar fin de atención, siguiente, ausencias y aplazamientos | Avisar fim de atendimento, próximo, ausências e adiamentos |
| `panel.notice_settings.state` | Announce when the queue is paused, closed, reopened or cleared | Avisar cuando la cola se pausa, cierra, reabre o vacía | Avisar quando a fila for pausada, fechada, reaberta ou limpa |
| `panel.notice_settings.reordered` | Announce when you reorder the queue | Avisar cuando reordenes la cola | Avisar quando você reordenar a fila |
| `panel.notice_settings.points` | Tell the person what happened to their points | Decir a la persona qué pasó con sus puntos | Contar à pessoa o que aconteceu com os pontos dela |
| `panel.notice_settings.hint` | Messages are limited so the chat is never flooded; the "your turn" call always goes first. | Los mensajes están limitados para no saturar el chat; el aviso de turno siempre va primero. | As mensagens têm limite para não inundar o chat; a chamada de "sua vez" sempre vai primeiro. |

### 7.3 Painel — diálogo de decisão, marcas, lote

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.entry.mark.held` | Points held until the end | Puntos retenidos hasta el final | Pontos retidos até o fim |
| `panel.entry.mark.check_group` | Check group | Comprobar grupo | Verificar grupo |
| `panel.entry.mark.awaiting_choice` | Waiting for your decision | Esperando tu decisión | Aguardando sua decisão |
| `panel.entry.hint.complete_held` | On finishing, we request the return of the points. | Al finalizar, solicitamos la devolución de los puntos. | Ao concluir, solicitamos a devolução dos pontos. |
| `panel.entry.action.skip` / `_aria` | skip / Skip {user} | aplazar / Aplazar a {user} | pular / Pular {user} |
| `panel.entry.action.restore` / `_aria` | restore / Bring {user} back to the queue | restaurar / Devolver a {user} a la cola | restaurar / Trazer {user} de volta à fila |
| `panel.entry.checking_group` | Checking group… | Comprobando el grupo… | Verificando o grupo… |
| `panel.entry.moved_position` | {user} moved to position {position}. | {user} pasó a la posición {position}. | {user} foi para a posição {position}. |
| `panel.entry.moved_position_held` | {user} moved to position {position}. Points stay held until the entry leaves the queue. | {user} pasó a la posición {position}. Los puntos siguen retenidos hasta que salga de la cola. | {user} foi para a posição {position}. Os pontos continuam retidos até a pessoa sair da fila. |
| `panel.entry.group_unchecked` | The group could not be checked. The points of {user} stay held. Decide in Pending decisions. | No se pudo comprobar el grupo. Los puntos de {user} siguen retenidos. Decide en Decisiones pendientes. | Não foi possível verificar o grupo. Os pontos de {user} continuam retidos. Decida em Decisões pendentes. |
| `panel.entry.left_awaiting` | {user} left the queue. Points waiting for your decision. | {user} salió de la cola. Puntos esperando tu decisión. | {user} saiu da fila. Pontos aguardando sua decisão. |
| `panel.entry.completed_refund_requested` | Service finished. Refund requested; Twitch will confirm. | Atención finalizada. Devolución solicitada; Twitch la confirmará. | Atendimento concluído. Devolução solicitada; a Twitch vai confirmar. |
| `panel.settlement.choice.title` | Return the points of {user}? | ¿Devolver los puntos de {user}? | Devolver os pontos de {user}? |
| `panel.settlement.choice.title_many` | Return the points of the {count} selected people? | ¿Devolver los puntos de las {count} personas seleccionadas? | Devolver os pontos das {count} pessoas selecionadas? |
| `panel.settlement.choice.body` | {user} is in a group that gets points back. The entry is closed without a finished service. | {user} está en un grupo que recibe puntos de vuelta. La entrada se cierra sin una atención terminada. | {user} está em um grupo que recebe os pontos de volta. A entrada é encerrada sem um atendimento concluído. |
| `panel.settlement.choice.refund` | Refund the points | Devolver los puntos | Devolver os pontos |
| `panel.settlement.choice.refund_help` | We ask Twitch to return the points. Twitch confirms later. | Pedimos a Twitch que devuelva los puntos. Twitch lo confirma después. | Pedimos à Twitch a devolução dos pontos. A Twitch confirma depois. |
| `panel.settlement.choice.no_refund` | Do not refund (final) | No devolver (definitivo) | Não devolver (definitivo) |
| `panel.settlement.choice.no_refund_help` | The redemption is completed and the points are not returned. This cannot be undone. | El canje se completa y los puntos no se devuelven. No se puede deshacer. | O resgate é concluído e os pontos não voltam. Isso não pode ser desfeito. |
| `panel.settlement.choice.later` | Decide later | Decidir después | Decidir depois |
| `panel.settlement.choice.back` | Back | Volver | Voltar |
| `panel.settlement.choice.saving` | Saving your decision… | Guardando tu decisión… | Salvando sua decisão… |
| `panel.settlement.choice.already_refund` | Already decided: points refunded. | Ya decidido: puntos devueltos. | Já decidido: pontos devolvidos. |
| `panel.settlement.choice.already_no_refund` | Already decided: points not refunded. | Ya decidido: puntos no devueltos. | Já decidido: pontos não devolvidos. |
| `panel.queue.clear.settlement.counts` | {members} in a group, {others} outside the group, {check} to check. | {members} en un grupo, {others} fuera del grupo, {check} por comprobar. | {members} em grupo, {others} fora do grupo, {check} para verificar. |
| `panel.queue.clear.settlement.others` | Outside the group: refund requested as today. | Fuera del grupo: devolución solicitada como hasta ahora. | Fora do grupo: devolução solicitada como hoje. |
| `panel.queue.clear.settlement.check` | To check: they stay held in Pending decisions. | Por comprobar: quedan retenidos en Decisiones pendientes. | Para verificar: ficam retidos em Decisões pendentes. |
| `panel.queue.clear.settlement.legend` | For the people in a group | Para las personas en un grupo | Para as pessoas em um grupo |
| `panel.queue.clear.settlement.refund_all` | Refund everyone's points | Devolver los puntos de todos | Devolver os pontos de todos |
| `panel.queue.clear.settlement.no_refund` | Do not refund (final) | No devolver (definitivo) | Não devolver (definitivo) |
| `panel.queue.clear.settlement.one_by_one` | Decide one by one later | Decidir uno por uno después | Decidir um a um depois |
| `panel.queue.clear.settlement.choose` | Choose what happens to the points of the people in a group. | Elige qué pasa con los puntos de las personas en un grupo. | Escolha o que acontece com os pontos das pessoas em grupo. |
| `panel.queue.delete.settlement_wait` | The queue stays being deleted until every pending decision is made. | La cola sigue en eliminación hasta que se tome cada decisión pendiente. | A fila continua em exclusão até que cada decisão pendente seja tomada. |
| `panel.queue.clear.settlement.done` | {count} people removed. Refund requested for {refunds}; {pending} waiting for your decision. | Se quitaron {count} personas. Devolución solicitada para {refunds}; {pending} esperan tu decisión. | {count} pessoas removidas. Devolução solicitada para {refunds}; {pending} aguardam sua decisão. |

(variantes de plural `.one/.other` são obrigatórias para `counts` e `done`; `done` e `choice.title_many` seguem a convenção de plural do `OutcomeRegion`.)

### 7.4 Painel — lista de pendências e motivos

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.pending.title` | Pending decisions | Decisiones pendientes | Decisões pendentes |
| `panel.pending.empty` | Nothing waiting for a decision. | Nada espera una decisión. | Nada aguardando decisão. |
| `panel.pending.card_badge` | {count} waiting for your decision | {count} esperando tu decisión | {count} aguardando sua decisão |
| `panel.pending.decide` | Decide… | Decidir… | Decidir… |
| `panel.pending.recheck` | Check again | Comprobar de nuevo | Verificar de novo |
| `panel.pending.recheck_hint` | If the person is not in the group, the redemption is completed without refund. | Si la persona no está en el grupo, el canje se completa sin devolución. | Se a pessoa não estiver no grupo, o resgate é concluído sem devolução. |
| `panel.pending.select_all` / `.selected` | Select all / {count} selected | Seleccionar todo / {count} seleccionadas | Selecionar tudo / {count} selecionadas |
| `panel.pending.decide_selected` | Decide for selected… | Decidir para las seleccionadas… | Decidir para as selecionadas… |
| `panel.pending.recheck.held` | In a group. Points stay held until the end. | En un grupo. Los puntos siguen retenidos hasta el final. | Está em um grupo. Os pontos continuam retidos até o fim. |
| `panel.pending.recheck.awaiting` | In a group. Decide about the points. | En un grupo. Decide sobre los puntos. | Está em um grupo. Decida sobre os pontos. |
| `panel.pending.recheck.not_member` | Not in a group. Redemption completed without refund. | No está en un grupo. Canje completado sin devolución. | Não está em um grupo. Resgate concluído sem devolução. |
| `panel.pending.recheck.still_unknown` | Still could not check. {reason} | Sigue sin poderse comprobar. {reason} | Ainda não foi possível verificar. {reason} |
| `panel.pending.reason.scope_missing` | Twitch permission missing. Reconnect to Twitch. | Falta el permiso de Twitch. Reconecta con Twitch. | Falta a permissão da Twitch. Reconecte com a Twitch. |
| `panel.pending.reason.unauthorized` | Twitch no longer accepts the connection. Reconnect to Twitch. | Twitch ya no acepta la conexión. Reconecta con Twitch. | A Twitch não aceita mais a conexão. Reconecte com a Twitch. |
| `panel.pending.reason.forbidden` | Twitch did not allow this check. Reconnect to Twitch. | Twitch no permitió esta comprobación. Reconecta con Twitch. | A Twitch não permitiu esta verificação. Reconecte com a Twitch. |
| `panel.pending.reason.rate_limited` | Twitch asked us to wait. Try again in a moment. | Twitch pidió esperar. Inténtalo en un momento. | A Twitch pediu para aguardar. Tente de novo em instantes. |
| `panel.pending.reason.twitch_unavailable` | Twitch is not answering right now. Try again later. | Twitch no responde ahora. Inténtalo más tarde. | A Twitch não está respondendo agora. Tente mais tarde. |
| `panel.pending.reason.timeout` | The check took too long. Try again. | La comprobación tardó demasiado. Inténtalo de nuevo. | A verificação demorou demais. Tente de novo. |
| `panel.pending.reason.malformed_response` / `.lookup_error` | The check failed. Try again; if it repeats, decide by hand. | La comprobación falló. Inténtalo de nuevo; si se repite, decide a mano. | A verificação falhou. Tente de novo; se repetir, decida manualmente. |
| `panel.pending.reason.channel_not_eligible` | This channel is not affiliate or partner, so Twitch does not share this list. | Este canal no es afiliado ni socio, así que Twitch no comparte esta lista. | Este canal não é afiliado nem parceiro, então a Twitch não compartilha esta lista. |
| `panel.pending.age` | {time} ago | hace {time} | há {time} |
| `panel.reconnect.granted` | Twitch reconnected. Permission for {group} granted. | Twitch reconectada. Permiso de {group} concedido. | Twitch reconectada. Permissão de {group} concedida. |
| `panel.reconnect.not_granted` | Permission for {group} was not granted. The group stays waiting for reconnection. | No se concedió el permiso de {group}. El grupo sigue esperando reconexión. | A permissão de {group} não foi concedida. O grupo continua aguardando reconexão. |

### 7.5 Painel — lista própria, erros, vazios

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.refund_list.title` | Own refund list | Lista propia de devolución | Lista própria de devolução |
| `panel.refund_list.description` | People you trust. Used by any queue that has this group ticked. Stored: the Twitch account number and a label. | Personas de tu confianza. La usa toda cola con este grupo marcado. Se guarda: el número de la cuenta de Twitch y una etiqueta. | Pessoas de confiança. Usada por toda fila com este grupo marcado. Fica guardado: o número da conta da Twitch e um rótulo. |
| `panel.refund_list.label` | Label (optional) | Etiqueta (opcional) | Rótulo (opcional) |
| `panel.refund_list.add` | Add | Añadir | Adicionar |
| `panel.refund_list.count` | {count} of {max} | {count} de {max} | {count} de {max} |
| `panel.refund_list.added_on` | Added on {date} | Añadido el {date} | Adicionado em {date} |
| `panel.refund_list.remove_aria` | Remove {label} from the list | Quitar a {label} de la lista | Remover {label} da lista |
| `panel.refund_list.removed` | Removed {label}. | Se quitó a {label}. | {label} removido. |
| `panel.refund_list.clear` | Clear all | Vaciar todo | Limpar tudo |
| `panel.refund_list.clear_confirm` | Remove all {count} people from the list? Queues using this group will refund nobody from it. | ¿Quitar a las {count} personas de la lista? Las colas que usen este grupo no devolverán a nadie de ella. | Remover as {count} pessoas da lista? As filas que usam este grupo não devolverão ninguém dela. |
| `panel.refund_list.clear_done` | List cleared. | Lista vaciada. | Lista limpa. |
| `panel.refund_list.empty` | No one on the list yet. | Aún no hay nadie en la lista. | Ainda não há ninguém na lista. |
| `panel.refund_list.error.duplicate` | This person is already on the list. | Esta persona ya está en la lista. | Esta pessoa já está na lista. |
| `panel.refund_list.error.limit` | The list is full ({max} people). Remove someone to add another. | La lista está llena ({max} personas). Quita a alguien para añadir otra. | A lista está cheia ({max} pessoas). Remova alguém para adicionar outra. |
| `panel.refund_list.error.not_found` | reutilizar `panel.entry.error.twitch_user_not_found` | reutilizar | reuse |
| `panel.settlement.error.generic` | Could not save the decision. Nothing was changed. Try again. | No se pudo guardar la decisión. No se cambió nada. Inténtalo de nuevo. | Não foi possível salvar a decisão. Nada foi alterado. Tente de novo. |
| `panel.settlement.error.stale` | This entry changed. Refresh the queue and review it. | Esta entrada cambió. Actualiza la cola y revísala. | Esta entrada mudou. Atualize a fila e revise. |
| `panel.settlement.error.uncertain` | The decision may have been saved. Refresh before trying again. | La decisión pudo haberse guardado. Actualiza antes de reintentar. | A decisão pode ter sido salva. Atualize antes de tentar de novo. |
| `widget.queue.next` (overlay catalog) | Next: {name} | Siguiente: {name} | Próximo: {name} |

Falhas inesperadas: o texto genérico localizado com `referenceId` (já existente), nunca o motivo bruto.


## 8. Notas (revisão estática, 0-10; mínimo 9,0)

| Item | Nota | Motivo principal / resíduo |
|---|---|---|
| Configurações por fila (momento, grupos, texto de retenção, motivos de desabilitado) | 9,3 | Texto no próprio controle; reaproveita padrões de formulário. Ocultar até a FT-76 evita funcionalidade pela metade |
| Diálogo de decisão (devolver / não devolver) | 9,3 | Um passo, mesmo peso, consequência no rótulo. Resíduo: velocidade numa live não medida |
| Escolha em lote e contagens (AC 26) | 9,1 | Sem padrão evita decisão silenciosa; a janela de 60 s é um pedido ao `@dev` |
| "Verificar grupo" (lista, motivos, ações) | 9,2 | Motivos simples, consequência dita antes de "Verificar de novo". Resíduo: contraste de vocabulário com a OPS-22 |
| Marcas, selo na fila, widget "próximo" | 9,0 | Marcas são texto; contraste do widget depende das cores do usuário; escolha de ícone não validada |
| Reautorização por escopo | 9,0 | Passos claros; o conteúdo da segunda autorização da Twitch é desconhecido (item 6 do teste real) |
| Textos (painel + chat, 3 idiomas) | 9,2 | Curtos, sem jargão; espanhol e redação sem revisão de falante nativo |
| Acessibilidade e responsividade (design) | 9,1 | Reaproveita padrões provados; todas as medições estão pendentes |
| Seção Decisões pendentes | 9,2 | Sobrevive a limpeza/reinício; sem página nova |
| **Geral** | **9,1 / 10** | Vale só para este escopo e só como revisão **estática** |

## 9. O que NÃO foi validado

- Sem navegador, sem verificação visual, sem captura, sem teste em 320/390/768 px: layout, espaçamento, quebra de linha e alvos de 44 px são intenção de design, não medidos. O tamanho de `.small-action` é desconhecido.
- Sem medição de contraste (valores da paleta não recalculados).
- Sem leitor de tela (NVDA, VoiceOver, TalkBack): risco aceito pelo dono. O fluxo só por teclado não foi executado.
- Sem execução real na Twitch: telas de reconexão, latência da consulta (quanto dura "Verificando o grupo…"), comportamento do limitador de chat, widget no OBS nativo.
- O código do painel foi lido só pelos padrões (diálogo, regiões, foco), não linha a linha; o arquivo de mapa de ícones citado nas regras do agente não existe neste repositório, então nenhum ícone foi escolhido.
- Textos em espanhol e português escritos pelo agente; sem revisão nativa. As regras de plural `.many` do espanhol não foram conferidas contra o validador de localização.
- Fatos abertos do design continuam abertos: expiração na Twitch de um resgate `UNFULFILLED` (se for curta, o parágrafo de retenção muda após o teste real), restauração dos limites da recompensa após cancelar, conteúdo da segunda autorização.

## 10. Checklist para o `@qa`

**Navegador, em 320, 390 e 768 px (e zoom de 200% em 320):**
- [ ] Configurações: rádios do momento, parágrafo de retenção visível e ligado por `aria-describedby`; caixas de grupo; motivos de desabilitado aparecem como texto; dica de conjunto vazio; selo "aguardando reconexão"; botão de reconexão oculto enquanto o formulário está alterado.
- [ ] Diálogo de decisão: título focado ao abrir; `Esc` e "Voltar" fecham sem efeito; as duas escolhas com o mesmo tamanho; nenhuma escolha armada; botões empilhados em largura total em 320; texto "Não devolver (definitivo)" presente; resultado cai na região do cartão; "já decidido" aparece numa segunda aba.
- [ ] Pular um integrante não pergunta nada e informa a nova posição (2); ausência por temporizador lista o item como aguardando.
- [ ] Diálogos de limpar e excluir: contagens corretas para 0 integrantes, só integrantes, misto, alguns desconhecidos; rádios sem padrão; Confirmar desabilitado com motivo visível; seleção zerada quando o snapshot muda; texto de resultado diz "solicitada", nunca "devolvidos".
- [ ] Decisões pendentes: aparece após uma limpeza e após recarregar; selo no cartão e na navegação; resultados de "Verificar de novo" (quatro textos); seleção em lote com rótulos por nome; dica antes de "Verificar de novo"; linhas empilhadas abaixo de 600 px.
- [ ] Lista própria: adicionar (login resolvido uma vez, rótulo preenchido), duplicado, limite, remover (foco se move), diálogo de limpar tudo, texto vazio.
- [ ] Widget "próximo": exibido com entrada aguardando, ausente sem ela, reticências em nome longo, sem UID/login; OBS nativo é outra classe (método da OPS-25).
- [ ] Avisos de chat (fake e depois real): textos em en, es, pt-BR; nenhum texto acima de 500 caracteres; famílias de recusa e de pontos nunca misturadas; "devolvidos" só após confirmação; nenhuma mensagem para "verificar grupo".
- [ ] Alvos de ao menos 44 px em todo controle novo; 8 px entre os dois botões de decisão.
- [ ] Contraste de ao menos 4,5:1 para texto e marcas (medir); marcas legíveis sem cor.
- [ ] Regiões vivas: um `status` e um `alert` permanecem montados; sem troca de papel com texto; sem roubo de foco por temporizador.
- [ ] Só teclado: ordem de tabulação completa como na seção 4; diálogos prendem e restauram o foco (ou caem na região de retorno).
- [ ] Validação de catálogo: `npm run validate:localization` com as chaves novas, formas de plural nos três idiomas, nenhuma chave faltando em nenhum idioma.

**Leitor de tela:** não solicitado (risco aceito pelo dono); registrar como "não executado".

## 11. Notas para outros agentes

- `@po`: itens novos para o texto da story: padrão dos avisos (filas novas ligadas, exceto "reordenação"; filas migradas todas desligadas), posição 2 de adiado/restaurado, widget sem chave liga/desliga, rótulo da lista própria preenchido com o login, "Decidir depois" como o "manter" do AC 21, pedido da janela de 60 s.
- `@architect`: chaves de chat novas `service_ended_next`, `next_up`, `cleared_refunds`, `cleared_pending` além da sua lista; confirme que "verificar grupo" não envia mensagem no chat; confirme que a consequência de "Verificar de novo" para quem não é do grupo bate com D-31-5 regra 7.
- `@dev`: não invente ícones; leia o `OutcomeRegion` e o diálogo de limpeza antes de construir; mantenha um único componente de diálogo de decisão para a linha, a lista de pendências e o lote.
