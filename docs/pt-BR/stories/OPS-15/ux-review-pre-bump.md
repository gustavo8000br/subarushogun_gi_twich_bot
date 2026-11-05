# Plano e revisão de UX antes do bump 0.3.0-beta (2026-11-05)

English: `docs/stories/OPS-15/ux-review-pre-bump.md`. Autora: `@ux-design-expert` (Uma). Entradas: [po-validation-bugs-pre-bump.md](po-validation-bugs-pre-bump.md), [architect-note-pre-bump.md](architect-note-pre-bump.md), [ts-10-wave-note.md](ts-10-wave-note.md), story OPS-25 (seções do widget) e o código lido abaixo.

**Tipo de revisão: ESTÁTICA** (textos, catálogos, CSS, código dos componentes, contraste calculado a partir dos hex do CSS). **Não** é revisão visual, de navegador, de OBS/CEF nativo nem de tecnologia assistiva. Cada nota vale só para o escopo da sua linha.

**Pesquisa:** sem LACUNA em `docs/research-index.md` para estes itens (texto de chat, avisos do painel, redação de catálogo, dois valores de CSS). Nenhuma pesquisa na internet foi feita.

## 1. Notas

| # | Item | Nota | Escopo da nota | Veredito |
|---|---|---|---|---|
| 1 | Textos do `ping` (D-8) | **9,1** | redação final en/es/pt-BR, como os códigos chegam à pessoa streamer | GO |
| 2 | FT-53: texto do painel, região viva, foco | **9,1** | texto, mapeamento de `reason`, região e foco (leitura do código) | GO |
| 3 | FT-54: singular e "recompensa" | **9,2** | as quatro famílias singular/plural, regra de termo pt-BR | GO |
| 4 | Widget da conta no OBS (estados e textos) | **8,8** | só textos existentes e lógica de estados; sem evidência em pixels | ABAIXO de 9,0 (ver 3.4) |
| 5 | D1 (seletor de idioma), D3 (diálogos de recompensa) | **9,0** | comportamento e valores de CSS, estático | GO com condições |
| 6 | DP-4: checklist de celular | **9,0** | plano para o `@qa`, não execução | GO |
| | **Geral (itens com trabalho do `@dev`: 1, 2, 3, 5)** | **9,1** | | `@dev` pode começar |
| | Geral incluindo 4 e 6 | **9,0** | | |

O item 4 não bloqueia o `@dev` (não há código previsto para o widget), mas o AC-W-6 só fecha em 9,0 quando a execução nativa do `@qa` trouxer a evidência listada em 3.4. Quem resolve: o `@qa` (execução); depois o `@ux-design-expert` reavalia em um adendo curto.

## 2. Textos finais (chave -> en / es / pt-BR)

### 2.1 `ping` no chat (catálogos de chat)

O formato do dono é vinculante; a revisão confere leitura e tamanho (todas as respostas ficam bem abaixo de 500 caracteres).

| Chave | en | es | pt-BR |
|---|---|---|---|
| `chat.ping.response` (`{version}`, `{latency}` = ms inteiros) | `Pong 🏓 - {version} - {latency}ms.` | `Pong 🏓 - {version} - {latency}ms.` | `Pong 🏓 - {version} - {latency}ms.` |
| `chat.ping.error` (`{version}`, `{code}`) | `Pong 🏓 - {version} - no Twitch measurement ({code}).` | `Pong 🏓 - {version} - sin medición de Twitch ({code}).` | `Pong 🏓 - {version} - sem medição da Twitch ({code}).` |
| `chat.ping.unavailable` | remover (o grep deve provar que não há uso) | remover | remover |

Decisões:
- `[AUTO-DECISION]` a unidade "ms" fica colada ao número (`219ms`) nos três idiomas, porque o formato do dono e o AC-D8-1 a fixam. O custo é uma variação tipográfica pequena no es; aceito por uma linha de chat consistente.
- O texto antigo `Bot ativo`/`Twitch:` sai. "Pong" mais a versão basta para quem assiste; a forma de falha diz claramente "sem medição" em vez de "indisponível" (é uma afirmação sobre a medição, não um alarme sobre o bot).
- O código entre parênteses é jargão para quem assiste, mas é o único lugar em que a pessoa streamer vê a causa sem abrir logs. É curto, em maiúsculas e fica no fim, então o público pode ignorá-lo. Mantido (formato do dono). Nunca se imprime erro bruto, número ou stack.
- Nunca imprimir "0ms" em falha: a forma de erro vale para todo estado diferente de `ok` (contrato do arquiteto).

Como a pessoa streamer vê os códigos (`TWITCH_PROBE_FAILED`, `TWITCH_NOT_CONNECTED`): na própria resposta do chat e, explicados na página de comandos, ampliando uma chave de descrição que já existe (sem chave nova de painel, sem marcação nova). O `/health` e o cartão da visão geral mantêm `panel.health.ping_unavailable` ("Sem medição" / "No measurement" / "Sin medición"), que já combina com o texto do chat.

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.command.description.global_queue_ping` | Check the bot, its version, and Twitch latency. With no measurement, the reply shows a code: TWITCH_NOT_CONNECTED (channel not connected) or TWITCH_PROBE_FAILED (Twitch did not answer the measurement). | Comprobar el bot, su versión y la latencia de Twitch. Sin medición, la respuesta muestra un código: TWITCH_NOT_CONNECTED (canal no conectado) o TWITCH_PROBE_FAILED (Twitch no respondió a la medición). | Verificar o bot, sua versão e a latência da Twitch. Sem medição, a resposta traz um código: TWITCH_NOT_CONNECTED (canal não conectado) ou TWITCH_PROBE_FAILED (a Twitch não respondeu à medição). |

### 2.2 FT-53 (catálogos do painel)

Estado lido: `queue-lifecycle.mjs` mapeia `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` para a chave existente `panel.queue.delete.cancel.remote_delete_attempted`, e o resultado é renderizado por `queue-lifecycle-actions.jsx` como `<p class="queue-action-feedback is-error" role="alert">`. O texto existente já diz "pode ter chegado à Twitch" e "a leitura não confirmou". Está correto e seguro para todo `reason`, exceto o 401, em que falta o próximo passo útil (reautorizar).

| Chave | en | es | pt-BR |
|---|---|---|---|
| **nova** `panel.queue.delete.cancel.remote_delete_attempted_reauthorize` (só quando `reason === 'authorization_required'`) | The request to delete the reward may have reached Twitch, but Twitch refused the authorization, so we could not check whether the reward still exists. The deletion was not cancelled. Reauthorize the channel on the Twitch connection page, refresh the panel, and review the queue before trying to cancel again. | La solicitud para eliminar la recompensa puede haber llegado a Twitch, pero Twitch rechazó la autorización y no se pudo comprobar si la recompensa sigue existiendo. La eliminación no se canceló. Vuelve a autorizar el canal en la página Conexión de Twitch, actualiza el panel y revisa la cola antes de intentar cancelar de nuevo. | O pedido para excluir a recompensa pode ter chegado à Twitch, mas a Twitch recusou a autorização e não foi possível conferir se ela ainda existe. A exclusão não foi cancelada. Reautorize o canal na página Conexão Twitch, atualize o painel e confira a fila antes de tentar cancelar de novo. |
| existente `panel.queue.delete.cancel.remote_delete_attempted` (usada para `verification_unavailable`, `reward_absent`, `reward_diverged`, `reward_not_paused`, `reason` ausente ou desconhecido) | sem mudança | sem mudança | sem mudança |

Regras para o `@dev`:
- Use o rótulo exato de `panel.navigation.connection` em cada idioma ("Twitch connection", "Conexión de Twitch", "Conexão Twitch"); um teste de contrato pode comparar o texto com essa chave.
- O texto NÃO pode prometer que cancelar vai funcionar depois de reautorizar (limite do AC 16 da OPS-22: uma tarefa de pausa restaurada para `unknown/failed` não é rearmada; é preciso "tentar agora"). A frase "confira a fila antes de tentar cancelar de novo" respeita isso.
- Escolha a chave específica só com `reason === 'authorization_required'`, por checagem de allowlist (`Object.hasOwn`); qualquer outro valor, um não-string ou campo ausente usa a chave genérica existente. A string de `reason` nunca é renderizada.
- Sem textos por motivo para os outros quatro `reason`: o texto genérico é correto para cada um e evita revelar o estado da Twitch em mais detalhe que o necessário.
- A frase é longa (cerca de 50 palavras). Ela é dividida em três frases curtas (o que pode ter acontecido, o que não foi feito, o que fazer). Não acrescente link dentro do alerta (mantém o alerta como um único nó de texto, ver abaixo).

Região viva e foco (leitura estática):
- Mantenha `role="alert"` (já escolhido por `outcome.element === 'alert'`): a pessoa acabou de acionar "cancelar exclusão" e precisa ouvir a falha. Não use `status` neste caso.
- Não mova o foco. O botão "cancelar exclusão" continua renderizado e focado; mover o foco ao alerta esconderia o contexto. O alerta é um parágrafo simples, então não há armadilha de foco.
- Limite conhecido: se o mesmo texto de alerta aparecer duas vezes seguidas (segunda falha com o mesmo `reason`), o conteúdo não muda e o leitor de tela pode não anunciar de novo. Mitigação barata para o `@dev`: limpar o aviso quando o cancelamento começa (a linha `deletion.cancelling` já aparece), de modo que o próximo alerta seja uma inserção nova. O `@qa` deve verificar com leitor de tela (checklist).
- Não se espera ID de referência neste 409 (não é erro inesperado); a renderização existente de `referenceId` não muda.

### 2.3 FT-54 (catálogos do painel)

Reconhecimento das quatro famílias (AC-F54-1): `panel.queue.confirm.delete_local.one` e `panel.queue.confirm.delete_converted.one`, em en, es e pt-BR, foram lidas.

- **Formas no singular, en/es/pt-BR: reconhecidas, sem mudança.** A concordância está correta ("{count} active entry will be removed", "Se quitará {count} entrada activa", "{count} entrada ativa será removida"); os marcadores `{title}` e `{count}` são idênticos aos do plural. O pt-BR tem `one`, `many` e `other`; o es tem `one`, `many`, `other`; o en tem `one`, `other` (categorias CLDR por idioma).
- **Regra de termo (pt-BR):** "recompensa" para reward, "resgate" para redemption, e nunca a palavra inglesa "reward" fora de nome próprio entre aspas. Gênero e artigo seguem o português ("a recompensa", "da Twitch", nunca "a reward Twitch").
- **Obrigatório nesta fatia (a família de exclusão do AC-F54-2):** `panel.queue.confirm.delete_local.{one,many,other}`, `panel.queue.confirm.delete_converted.{one,many,other}`, `panel.operation.confirm.continue_delete`, `panel.queue.delete.cancel.{already_deleted,reward_absent,reward_diverged,unverified,processing}`, `panel.queue.delete.done`, `panel.queue.delete.pending`, `panel.queue.confirm.retry_delete_converted`, `panel.queue.status.pending_local_delete`. Edite só a palavra e o artigo.
- **Chaves do widget (AC-F54-4): SIM, entram nesta fatia.** Ficam visíveis no editor de widgets ao lado de "recompensa" na mesma página.

| Chave | pt-BR (final) |
|---|---|
| `panel.queue.confirm.delete_local.one` | Excluir a fila local “{title}”? {count} entrada ativa será removida. Não há recompensa nem resgate da Twitch vinculados a esta fila. |
| `panel.queue.confirm.delete_local.many` / `.other` | Excluir a fila local “{title}”? {count} entradas ativas serão removidas. Não há recompensa nem resgate da Twitch vinculados a esta fila. |
| `panel.queue.confirm.delete_converted.{one,many,other}` | texto atual com: "A reward Twitch permanecerá…" -> "A recompensa da Twitch permanecerá…" (mantenha o resto e o verbo no singular/plural) |
| `panel.widget.queue_label` | Fila / recompensa vinculada |
| `panel.widget.source.help` | Para exibir dados de uma fila, selecione a fila específica abaixo. A recompensa de Pontos do Canal vinculada é selecionada junto com ela, quando houver. |
| demais chaves da família | troque "a reward" -> "a recompensa", "esta reward" -> "esta recompensa", "a reward Twitch" -> "a recompensa da Twitch", "da reward" -> "da recompensa" |

Achado além do escopo do PO (recomendação; o `@dev` pode ampliar o scan Red): 28 valores do painel pt-BR ainda contêm a palavra inglesa "reward"/"rewards" (varredura do catálogo inteiro, não só da família). As outras 12 fora da família e do widget são: `queue_mode_transition_pending`, `panel.reward_settings.eyebrow` ("CUSTOM REWARD DA FILA" -> "RECOMPENSA PERSONALIZADA DA FILA"), `manual_mode_retry`, `mode_transition.failed`, `mode.converted`, `pending_local_delete_diverged`, `retry_delete_converted_diverged`, `form.section_reward`, `form.mode_channel_points_hint`, `form.twitch_setup_required` e as duas já listadas. A mesma regra vale; ampliar o scan ao catálogo pt-BR inteiro é um teste só e evita uma terceira passada. Não é obrigatório para o gate.

Correção opcional de paridade no es (não bloqueia): `delete_converted.*` no es diz "la comunicación con Twitch" onde en/pt-BR dizem "solicitações de sincronização" ("solicitudes de sincronización con Twitch"). Sugestão para o es: "…hasta confirmar todos los canjes conocidos, las solicitudes de sincronización con Twitch y las devoluciones de puntos relacionadas." Aplicar a `one`, `many` e `other`.

### 2.4 Estados do widget (subconjunto da OPS-25)

Os textos já existem nos catálogos de overlay (`overlay.status.*`); nenhuma chave nova.

| Estado | O que a audiência vê | Texto para a pessoa streamer (chave) | en / es / pt-BR |
|---|---|---|---|
| Carregando (primeira consulta) | nada (valor e status vazios) | nenhum | nenhum |
| Conectado (autorizado) | só o rótulo da conta, branco, sem linha de status | nenhum | nenhum |
| Atrasado (consulta falhou, último valor mantido) | o rótulo a 82% de opacidade mais uma linha pequena | `overlay.status.stale` | `Update delayed` / `Actualización retrasada` / `Atualização atrasada` |
| Dados indisponíveis (primeira consulta falhou) | só a linha pequena | `overlay.status.data_unavailable` | `Data temporarily unavailable` / `Datos no disponibles temporalmente` / `Dados temporariamente indisponíveis` |
| Erro / não autorizado / revogado | só a linha pequena; sem rótulo, sem detalhes internos | `overlay.status.unavailable` | `Source unavailable` / `Fuente no disponible` / `Fonte indisponível` |

Os textos en/es acima são as traduções pretendidas dos textos pt-BR; o `@dev` ou o `@qa` confirmam se batem com `overlay/en.tsv` e `overlay/es.tsv` como estão (esta revisão leu só o catálogo pt-BR; se os outros divergirem, trate como observação, não como mudança).

Decisão `[AUTO-DECISION]`: manter os três textos sem mudança. Eles não trazem termo técnico, token, URL nem código de erro, e uma pessoa que assiste entende ("fonte indisponível"). Esconder o estado não autorizado deixaria a pessoa streamer às cegas (uma fonte vazia é idêntica a "carregando"). A story proíbe redesenho do widget; qualquer mudança vai para uma story própria com plano próprio.

## 3. Revisão por item

### 3.1 Item 1, `ping` (9,1)
Pontos fortes: uma forma fixa, uma frase curta, mesma estrutura nos três idiomas, sem erro bruto. Perdas de nota: o código é jargão para quem assiste (formato do dono, aceito); "ms" colado ao número no es (formato do dono). Não validado: como o chat da Twitch renderiza o emoji em cada cliente; valores reais de latência (OW-17).

### 3.2 Item 2, FT-53 (9,1)
Pontos fortes: dois fatos em um texto, seguro por construção (`reason` fechado), nenhuma interação nova, o comportamento do alerta e do foco já serve. Perdas: sem link clicável para a página de conexão (omitido de propósito para manter o alerta simples; o nome da página coincide com o rótulo da navegação); um alerta idêntico repetido pode não ser reanunciado (mitigação acima). Não validado: saída de leitor de tela.

### 3.3 Item 3, FT-54 (9,2)
Pontos fortes: as formas no singular já estão corretas; regra de termo mecânica, com teste. Perda: deriva de paridade no es ("la comunicación"; correção opcional). Não validado: layout das strings pt-BR mais longas no diálogo.

### 3.4 Item 4, widget (8,8)
O que o código mostra: `overlay.css` define `html, body { overflow: hidden }`, a largura do rótulo é `max-content` e `.overlay-status` é `position: absolute; top: 100%` (abaixo do rótulo), branco a 78% de alfa, 12 px, sem sombra nem fundo.
Riscos que a revisão estática não fecha:
1. **Corte:** se a altura da Browser Source no OBS for igual à do rótulo, a linha de status fica fora da caixa e é cortada (`overflow: hidden`). A pessoa streamer veria uma fonte vazia nos estados não autorizado e dados indisponíveis, igual a "carregando". É o principal ponto que o `@qa` deve observar no AC-W-5.
2. **Legibilidade:** branco a 78% em texto de 12 px tem 12,4:1 contra preto, mas não há garantia sobre cena clara ou movimentada (sem sombra de texto nem fundo). Não mensurável sem a cena real.
3. **Tempo:** sem texto de carregamento, há 1 a 5 s de fonte vazia após o reload; aceitável para a audiência, mas o `@qa` registra o tempo real (AC-W-1).
O que falta para chegar a 9,0: evidência em pixels da execução no OBS nativo desta máquina (estados sobre fundo transparente e escuro, status visível dentro da caixa da fonte). Quem resolve: o `@qa` executa AC-W-1..5 e registra capturas dos três estados; o `@ux-design-expert` reavalia com um adendo curto. Se o risco 1 se confirmar, vira story de bug separada (o subconjunto não permite correção).

### 3.5 Item 5, D1 e D3 (9,0)
**D1 (seletor de idioma, só comportamento):** o código (`language-picker.jsx`) cai para pt-BR quando o locale salvo não tem catálogo e mantém o locale escolhido durante o salvamento. Sem mudança de marcação, então a ordem de tabulação não muda (o select, e nada mais) e o nome acessível não muda (`aria-label`). O fallback combina com o aviso existente `panel.locale.incomplete` ("o idioma salvo não está completo; Português brasileiro está ativo temporariamente"), então o que o select mostra e o que o aviso diz concordam. Em salvamento com falha, o select volta ao valor persistido e aparece o aviso de erro; correto.
Preocupações (todas pré-existentes, nenhuma piorada; tratar como follow-up, não bloqueio):
- O select fica `disabled` durante o salvamento; navegadores tiram o foco de um controle que passa a desabilitado, então quem usa teclado perde o lugar após escolher o idioma. Sugestão de follow-up: devolver o foco ao select quando o salvamento termina (ou usar `aria-disabled`).
- `.language-picker .locale-notice.is-error { color: var(--danger) }` usa `--danger`, que não está definido no CSS encontrado (só `--text`, `--muted`, `--purple`, `--green`, `--surface*`). A declaração é inválida em tempo de cálculo e o texto herda a cor do pai, então o aviso de erro não é vermelho. Continua legível (a mensagem é transmitida pelo texto), mas a cor de erro pretendida se perde. Sugestão: usar a cor de erro já usada `#ffc5ca` (11,5:1 sobre o fundo do diálogo).
- O select e o aviso usam texto de 10 px (`.language-picker select`), abaixo do mínimo de 12 px usado no resto. Não faz parte do D1; sinalizar ao dono.

**D3 (diálogos de recompensa, CSS visível):** `.reward-resolution-dialog .operation-confirmation-actions { gap: 12px }` (era 9 px) e `.connection-notice, .hint { font-size: 14px }` (era 13 px), restritos a `.reward-resolution-dialog`. Achados estáticos:
- Foco e ordem de tabulação: inalterados (só CSS, sem `order`, sem novo elemento focável); o contorno `:focus-visible` roxo de 2 px continua.
- Contraste (calculado dos hex, fundos dos avisos misturados sobre o fundo do diálogo `#15141d`): erro `#ffc5ca` 11,5:1, atenção `#e7cf8c` 10,8:1, sucesso `#9ae4be` 11,2:1, texto de dica `#f2f1f8` sobre `#11121a` 16,6:1, resumo da fila `#c4bfd2` 10,2:1, rótulos `#d8d5e0` 12,6:1. Tudo acima de 4,5:1; a mudança de tamanho não altera a cor.
- Layout: a linha de ações é `flex-wrap: wrap`; os botões têm 44 px de altura, então +3 px de espaço só deixa o layout quebrado mais solto. O diálogo tem `max-height: calc(100dvh - 28px)` com `overflow-y: auto`, então +1 px de texto não empurra conteúdo para fora do alcance. O diálogo de configurações tem barra de ações fixa (`bottom: -22px`); um alerta de erro mais longo a 320 px pode ficar sob ela, o que só uma execução visual mostra (checklist).
- Avisos de 14 px melhoram a leitura; aceito.
Revisão estática em 390x844 e 768x900: nenhuma regra de breakpoint se aplica a essas classes, então o layout é o mesmo do desktop com largura `min(540px, 100vw - 28px)` (362 px em 390; 540 px em 768). A confirmação visual é do `@qa`.

### 3.6 Item 6, DP-4 (9,0)
Ver o checklist na seção 5.

## 4. O que NÃO foi validado
- Nenhuma revisão visual em navegador; nenhuma captura de tela; nenhuma execução em 320/390/768 px.
- Nenhuma execução no OBS/CEF nativo (widget); nenhuma checagem de legibilidade sobre fundo claro.
- Nenhum leitor de tela (NVDA, VoiceOver, Orca, TalkBack) e nenhuma execução só com teclado.
- O contraste foi calculado dos valores hex do CSS, não medido em pixels renderizados (misturas de alfa, antisserrilhado e a cena do OBS não estão cobertos).
- Os catálogos de overlay en/es não foram lidos; os textos pt-BR do overlay foram.
- O comportamento real da Twitch (401 após DELETE, `ping` ao vivo) é evidência do dono/`@qa`, não de UX.
- Nenhum código foi alterado por esta revisão.

## 5. Checklist para o `@qa` e o dono

Celular (DP-4), depois da remoção do painel antigo, no painel Next em **320x568, 390x844 e 768x1024** (retrato; também 768 paisagem se houver), aparelho real ou emulação registrada como tal:
1. **Sem rolagem horizontal** a 320 px em filas, operações, comandos, widgets, conexão e visão geral (WCAG 1.4.10, reflow).
2. **Empilhamento:** cabeçalho, navegação, seletor de idioma e conteúdo se empilham em ordem lógica; a ordem do DOM é a ordem de leitura.
3. **Alvos de toque:** botões, links e selects com pelo menos 44x44 px CSS (padrão do projeto; mínimo WCAG 2.2 de 24 px). Confira o select do seletor de idioma (padding pequeno) e os botões de ação das entradas da fila (texto de 13 px).
4. **Foco:** contorno `:focus-visible` visível em todo controle no tema escuro; abrir um diálogo move o foco para dentro dele; fechar devolve ao elemento que o abriu; Tab não alcança o conteúdo atrás do modal; Escape fecha os diálogos de confirmação.
5. **Diálogos a 320 e 390 px:** os diálogos de resolução e de configurações de recompensa rolam dentro de si; a barra de ações fixa do diálogo de configurações não esconde o último campo nem um alerta de erro longo; as ações quebram linha sem sobrepor (D3: espaço de 12 px, avisos de 14 px).
6. **Zoom:** 200% de zoom de texto (e 320 px) sem texto cortado nem controles perdidos.
7. **Áreas seguras e teclado:** no celular, o teclado na tela não cobre o campo focado no formulário de configurações.

Leitor de tela e teclado (dono ou `@qa` com leitor de tela):
8. FT-53: provoque o 409 (fixture PG ou real) e confirme que o alerta é anunciado uma vez, o foco fica no botão "cancelar exclusão" e uma segunda falha idêntica é anunciada de novo (ou registre que não é).
9. Seletor de idioma: troque o idioma só com teclado; registre se o foco se perde quando o select fica desabilitado; confirme o fallback para Português (Brasil) com um locale sem catálogo e que o aviso é anunciado.
10. Diálogos de confirmação de exclusão (caso singular, `{count} = 1`): leia em pt-BR, en, es; confirme que a frase soa natural para um leitor de tela.

Contraste em pixels reais:
11. Meça com conta-gotas em captura real: avisos do D3 (erro, atenção, sucesso) e dica, resumo da fila e rótulos nos diálogos de recompensa (esperado >= 4,5:1, calculado 10,2 a 16,6:1); o aviso de erro do seletor de idioma depois da correção de `--danger`.
12. Widget no OBS nativo (AC-W-5/6): captura de carregando, autorizado, atrasado/indisponível e não autorizado sobre cena transparente e escura, mais uma cena clara; confirme que a linha de status fica dentro da caixa da fonte; registre as versões do OBS e do CEF.

Pendências do dono:
- OK para a cor `--danger` e um possível mínimo de 12 px no seletor de idioma (follow-up, fora deste bump).
- OW-17, `ping` ao vivo (AC-D8-9), e a mensagem real de chat do widget (AC-W-8).
- Decidir se a varredura de "reward" no catálogo pt-BR inteiro (mais 12 chaves) entra nesta fatia ou na próxima.
