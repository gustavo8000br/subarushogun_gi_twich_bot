# OPS-15 — Revisão de UX por página do painel Next (lente 2: código e textos estáticos)

- Data: 2026-10-21
- Revisora: `@ux-design-expert` (Uma), execução autônoma de agente
- Branch: `feat/ops-15-next-panel` (árvore de trabalho não commitada, como encontrada)
- Meta do proprietário: deixar cada página do painel Next o mais fácil possível para um streamer não técnico; alvo 10/10 por página.

## Escopo e limites (leia primeiro)

**Coberto:** leitura estática de `apps/frontend/app/(panel)/**`, `apps/frontend/app/(overlay)/**`, `apps/frontend/features/**`, `apps/frontend/styles/panel.css` e dos catálogos `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv` (paridade de chaves verificada por script; textos amostrados por busca, não lidos linha a linha nas 792 linhas).

**NÃO coberto:** nenhuma renderização visual, nenhum navegador real, nenhuma execução em 390×844, nenhum percurso só com teclado, nenhum leitor de tela (NVDA/VoiceOver/TalkBack), nenhum OBS/CEF, nenhuma Twitch ou worker, nenhuma medição de contraste. Toda nota abaixo é **apenas de código/texto estático**. Itens de "risco mobile" são previsões a partir do CSS, não observações.

As notas não cumprem o gate 9,0 do CLAUDE.md para implementar as correções; cada lote de correção ainda precisa de plano + revisão próprios registrados na story.

## Achados transversais

| # | Sev | Achado | Evidência | Correção |
|---|---|---|---|---|
| X1 | Alta | Jargão interno/inglês vaza nos textos pt-BR/es: "reward" (≈20 textos pt-BR misturam "reward" e "recompensa"), "toggle", "FIFO", "local-first", "projeção de overlay", "Client ID/Secret", "Page Permissions None", "callback", "reconciliar/conciliação". | `pt-BR.tsv`, chaves `panel.queue.delete.*`, `panel.commands.policy_help`, `panel.entry.priority_audit_hint`, `panel.footer.brand`, `panel.widget.obs_help` | Passada de glossário: um termo por conceito ("recompensa", "sincronizar"); manter termos da Twitch/OBS só quando forem o rótulo literal que o streamer verá lá, com explicação. |
| X2 | Alta | A marca "Fila Local" está fixa no shell (barra lateral + breadcrumb), então `es` mostra português embora o catálogo diga "Cola local". | `panel-shell.jsx` L44, L64 | Usar `t('panel.brand.name')`. |
| X3 | Média | Diálogos de confirmação genéricos: título "Confirmação" + botão "Confirmar"; ações destrutivas usam `button-primary` (não estilo de perigo). O streamer precisa ler um parágrafo longo para saber o que "Confirmar" faz. | `queue-lifecycle-actions.jsx`, diálogo de limpar em `queue-list.jsx`, confirmação de widgets | Títulos e botões com verbo ("Excluir fila", "Limpar 4 pessoas"), estilo de perigo em ações irreversíveis, foco inicial em Cancelar. |
| X4 | Média | Plurais não tratados em vários textos com contagem (`panel.queue.clear.done`, `panel.queue.clear.confirm`, `panel.queue.confirm.delete` "{count} entradas") → "1 pessoas". | catálogos | Usar `.one/.other(/.many)` como em `panel.reconciliation.*`. |
| X5 | Média | Validação HTML nativa (`required`, `pattern`, `min`) exibe mensagens no idioma do navegador, não no idioma do painel, e não há resumo de erros inline. | `new-queue-form.jsx`, entrada manual em `queue-list.jsx`, widgets | Erros inline próprios (`aria-invalid` + `aria-describedby`) no idioma do catálogo; manter o nativo como reserva. |
| X6 | Média | Navegação mobile: 8 itens em rolagem horizontal com só uma barra de 4px como indicação; em `es` o rótulo de Operações é "Sincronización con Twitch y devolución de puntos" (muito longo para um chip). | `panel.css` @620px; `es.tsv` | Rótulos curtos; esmaecimento na borda ou indicação de "mais"; verificar em 390×844. |
| X7 | Baixa | IDs duplicados quando há várias filas: `priority-reason-error` / `priority-reason-hint` em `ManualEntryForm` não incluem o id da fila. | `queue-list.jsx` L99–105 | Acrescentar `queue.id`. |
| X8 | Baixa | Identificadores brutos exibidos ao streamer (hash `Widget {id}`, identificador `code` da operação, "Revisão N" do catálogo de comandos). | card de widget, card de operação, cabeçalho de comandos | Esconder em "detalhes" ou remover. |

Padrões positivos a manter: link para pular ao conteúdo, `aria-current` na navegação, `:focus-visible` global, alvos de 44px na maioria das ações, separação `role=alert` × `status`, referenceId sem dados internos, fluxos de recuperação de conflito (409), redação explícita de "solicitado / aguardando a Twitch" (`panel.queue.action_result.pending`, `panel.notice.reward_update_pending`, `panel.queue.clear.done` "reembolsos solicitados"); a confirmação de "resolver" em Operações diz explicitamente que **não** confirma reembolso.

## Revisão por página

### 1. Visão geral `/` — nota estática **7,0/10**

- **Jornada:** abrir o painel → ler o card de "próximo passo" → seguir o link (conectar / criar fila / abrir filas) → olhar saúde e contagens.
- **Atrito/jargão:** seis cards de saúde (Bot, Banco de dados, API da Twitch com ping em ms, Integração, Chat, Recompensas) + legenda + horário da "última reconciliação" — visão de engenharia, não de streamer. Chip de versão em destaque.
- **Estados:** o carregamento reutiliza `panel.health.database.checking` ("Verificando…") — mensagem errada para o carregamento do painel inteiro. Indisponível mostra `role=alert` sem botão de tentar de novo. Avisos de atualização ok; polling silencioso de 5 s é bom.
- **Teclado/leitor de tela:** saúde transmitida por texto (não só cor). Botão de atualizar com `aria-busy`.
- **Mobile:** cards em uma coluna em 620px; ações do cabeçalho em grid, em tese ok.
- **Veracidade:** ok — saúde vem do estado da API; nenhuma alegação de "confirmado".
- **i18n:** marca fixa (X2).
- **Correções:** A — resumir a saúde em uma frase simples ("Tudo funcionando" / "A Twitch precisa de atenção → Conexão") com detalhes em disclosure; A — botão de tentar de novo no estado indisponível; M — texto de carregamento próprio; B — versão para rodapé/configurações.
- **Só em navegador/TA:** polling sem roubar foco nem reanunciar; ordem de leitura.
- **Para chegar a 10:** resumo em linguagem simples, caminho de nova tentativa, ordem de leitura validada com NVDA + VoiceOver, revisão de captura em 390×844.

### 2. Filas `/queues` — nota estática **6,0/10**

- **Jornada:** escolher a fila → abrir/pausar entradas → "Próximo"/chamar → atender/concluir/remover → opcionalmente adicionar manualmente, editar opções, editar recompensa, limpar, excluir.
- **Atrito/jargão:** cada card mostra até ~9 botões secundários de mesmo peso (abrir/pausar, Próximo, Limpar, Excluir, Modo manual, Repetir, Editar recompensa, Resolver recompensa…) — a ação principal da live (chamar o próximo) tem o mesmo peso visual que Excluir. Rótulos em minúsculas "concluir", "remover". "Mover ↑/↓". Estados de sincronização "resultado desconhecido · revise no painel" (você já está no painel). A confirmação de limpar diz "vale por 15 segundos" sem contagem visível.
- **Estados:** vazio com CTA (bom); histórico com carregando/erro/tentar de novo (bom); recuperação de chamada com gestão de foco (muito bom); fluxo de atualização obrigatória ao limpar (bom); o `saving` é global e desabilita todas as filas.
- **Teclado/leitor de tela:** `aria-label` de mover para cima/baixo não inclui o nome e lê o glifo da seta; chamar/atender/concluir/remover incluem o nome (bom). Expiração anunciada em região de status (bom). IDs duplicados (X7). `<dialog>` nativo com `showModal` prende o foco.
- **Mobile:** linhas com 4–5 botões de 44px quebram em várias linhas por espectador; a linha de ações vira uma parede de botões; muita rolagem durante a live.
- **Veracidade:** boa — `pending` "Aguardando confirmação da Twitch", `uncertain` "pode ter sido registrada"; `panel.entry.add.refresh_failed` diz "A API aceitou" — correto, mas jargão ("API").
- **i18n:** plurais (X4); mistura "reward" (X1).
- **Correções:** A — hierarquia: primário "Chamar próximo", abrir/pausar como interruptor, ações destrutivas/raras em "Mais ações"; A — menu por linha para mover/prioridade no mobile; M — nome nos rótulos de mover, iniciais maiúsculas; M — contagem visível ou remover "15 segundos"; M — `saving` por fila; B — trocar "API" por "o app".
- **Só em navegador/TA:** retorno de foco dos diálogos, excesso de anúncios durante a contagem, quebra em 390px, precisão do timer.
- **Para chegar a 10:** redesenho de hierarquia revisado ≥9, percurso com leitor de tela de um ciclo completo de chamada, teste de usabilidade mobile em live.

### 3. Nova fila `/new-queue` — nota estática **7,5/10**

- **Jornada:** nome → comando sugerido → modo de entrada (Pontos do Canal/manual) → campos da recompensa → atendimento → mensagem de chamada com prévia → criar.
- **Atrito/jargão:** "Aliases", "Modo do UID"/"Solicitar UID", marcadores `{user}{queue}{position}{uid}{account}`; a nota do UID exige conhecer outras duas opções. Custo padrão 1000 sem explicação.
- **Estados:** retorno salvando/confirmado/pendente/aviso/incerto com link para filas (bom); envio desabilitado em `uncertain` (evita duplicação). Aviso de Twitch não conectada com link (bom).
- **Teclado/leitor de tela:** fieldsets com legendas; erro da mensagem com `aria-describedby`; demais campos dependem da validação nativa (X5).
- **Mobile:** coluna única em 620px; barra de ações com 44px.
- **Veracidade:** resultados distinguem revisão/recuperada (bom).
- **Correções:** M — explicar o UID em uma linha (o que é, por que pedir); M — chips de inserção de marcadores no lugar de digitar chaves; M — validação inline localizada; B — explicar o custo padrão.
- **Para chegar a 10:** erros por campo no idioma, explicação do UID, teste de preenchimento em navegador + leitor de tela.

### 4. Comandos `/commands` — nota estática **7,5/10**

- **Jornada:** ler a ajuda → mudar o cargo mínimo por comando → salvar → (seguidores) autorizar na Twitch.
- **Atrito/jargão:** "toggle", "Cargos superiores herdam acesso", chip "Revisão N"; o rótulo do select repete a sintaxe completa.
- **Estados:** carregando, erro + recarregar, vazio, conflito 409 + recarregar, permissão de seguidor perdida/necessária (todos presentes). O aviso "alterações não salvas" é `role=status` e anuncia a cada edição.
- **Teclado/leitor de tela:** cards rotulados por título; select com `htmlFor`.
- **Mobile:** comportamento do grid em 390px não verificado.
- **Veracidade:** o texto de consentimento de seguidor diz que não altera as permissões salvas (bom); redirecionamento OAuth validado.
- **Correções:** M — reescrever a ajuda em linguagem simples, sem "toggle"; B — remover chip de revisão; B — rótulo de select mais curto.
- **Para chegar a 10:** reescrita dos textos, teste em navegador da ida e volta OAuth.

### 5. Conexão `/connection` — nota estática **6,5/10**

- **Jornada:** criar app no console da Twitch → colar Client ID/Secret → validar e salvar → conectar (OAuth) → voltar com sucesso/recusa/erro → sincronizar.
- **Atrito/jargão:** a página mais difícil para quem não é técnico: "aplicativo confidencial", "callback", "Client ID/Client Secret" sem tradução; sem passos numerados; URL de callback em `<code>` sem botão de copiar; link do console abre nova aba sem avisar. Já conectado, o formulário de credenciais continua em destaque (risco de sobrescrever credenciais que funcionam).
- **Estados:** validando/salvo/salvo-sem-atualizar/erro; aviso do retorno OAuth limpo da URL (bom). O aviso aparece no fim da página — longe do botão no mobile.
- **Teclado/leitor de tela:** campos dentro de labels; chip de estado e linhas de saúde em texto.
- **Mobile:** URL de callback longa em `code` pode estourar em 390px (nenhuma regra de quebra observada para `.connection-callback-url` nesta revisão).
- **Veracidade:** "Twitch conectada com sucesso" depende do parâmetro do callback do servidor — aceitável; resultado da sincronização separa concluído × pendências.
- **Correções:** A — assistente de 3 passos numerados com botão de copiar a URL de callback e explicação curta de ID/Secret; A — recolher credenciais em "Trocar credenciais" quando conectado; M — avisos junto da ação; M — dica "abre em nova aba"; B — quebrar URL longa.
- **Para chegar a 10:** assistente revisado ≥9 e testado de ponta a ponta com app Twitch real por uma pessoa não técnica.

### 6. Operações `/operations` — nota estática **6,5/10**

- **Jornada:** ver sincronizações Twitch / devoluções de pontos / confirmações de resgate pendentes → tentar de novo ou registrar resolução manual → sincronizar agora.
- **Atrito/jargão:** o conceito é técnico; estados "Conflito · requer revisão", "Estado desconhecido · revise no painel"; ação "Reconciliar / tentar novamente"; tipo reserva "OPERAÇÃO TWITCH" em maiúsculas; identificador bruto em `code`. Falta, por item, dizer *o que o streamer deve fazer*.
- **Estados:** carregando, erro com referência + tentar de novo, vazio com dica, falha de atualização mantendo dados, plurais da reconciliação (bom — o melhor tratamento de estados do painel).
- **Teclado/leitor de tela:** cards rotulados; diálogo nativo com Escape bloqueado durante o salvamento. Polling de 5 s substitui a lista — pode perder o foco se um item sumir (checar no navegador).
- **Veracidade:** excelente — tentar de novo diz pendente; resolução manual explicitamente não confirma reembolso.
- **Correções:** A — frase "o que fazer" por estado; M — verbos simples ("Tentar de novo", "Marcar como resolvido por mim"); M — esconder identificadores em detalhes; B — tipo reserva sem caixa alta.
- **Para chegar a 10:** orientação por estado, teste com leitor de tela de que o polling não atrapalha foco/anúncios.

### 7. Configurações `/settings` — nota estática **8,0/10**

- **Jornada:** renomear rótulo da conta atual / rótulo padrão → salvar.
- **Atrito:** a diferença entre rótulo "atual" e "padrão" não é óbvia; só dois campos, impacto baixo.
- **Estados:** alterado/sem alterações, salvando, salvo, salvo-sem-atualizar (aviso), inválido, erro genérico — completos.
- **Teclado/leitor de tela:** `htmlFor` correto, seções com `aria-labelledby`.
- **Correções:** M — exemplo de uma linha de onde cada rótulo aparece; B — página enxuta; o seletor de idioma poderia ficar aqui também.
- **Para chegar a 10:** explicar o propósito com exemplo, checagem no navegador.

### 8. Widgets `/widgets` — nota estática **6,0/10**

- **Jornada:** criar widget → escolher fonte (texto fixo / dados da fila) → estilizar → salvar → copiar URL de uso único → adicionar Fonte Navegador no OBS.
- **Atrito/jargão:** 19 campos de estilo de uma vez (margens, sombra X/Y, contorno, overflow); opções dos selects **sem tradução, valores brutos** (`left/center/right`, `none/outline/shadow`, `wrap/clip/ellipsis`, `system-ui`, pesos `300…900`); largura/altura em texto livre "auto"; ajuda do OBS mistura inglês ("Page Permissions None"); "Fila / reward vinculada".
- **Estados:** carregando/erro/vazio/atualizar conflito/substituir rascunho (bom). Contador mostra `/240` enquanto `maxLength=960` (limite comunicado de forma inconsistente).
- **Risco do link de uso único (Alta):** o diálogo da URL secreta fecha com clique no fundo e com Escape; o texto diz que fechar perde o link. Um clique acidental força gerar outro (se isso invalida a URL já colada no OBS precisa ser checado na API).
- **Teclado/leitor de tela:** `role=dialog` próprio com armadilha de foco escrita à mão; `alertdialog` de confirmação tem título, mas sem `aria-describedby` com a consequência; "×" rotulado (bom).
- **Mobile:** editor vira uma coluna e a prévia sobe (boa intenção); 19 campos → rolagem muito longa.
- **Veracidade:** ok.
- **Correções:** A — traduzir todas as opções; A — diálogo do link não dispensável por fundo/Escape até "Copiado" ou "Fechar mesmo assim"; A — predefinições ("Simples", "Com contorno", "Com sombra") com disclosure "Avançado"; M — limite de caracteres consistente; M — passos do OBS localizados e numerados; B — esconder id do widget.
- **Só em navegador/TA:** armadilha de foco, falha da API de área de transferência, fidelidade da prévia × OBS.
- **Para chegar a 10:** predefinições + opções traduzidas + diálogo seguro, depois validação em navegador e OBS/CEF.

### 9. Overlay `/overlay` — nota estática **7,0/10** (escopo limitado)

- **Jornada:** OBS carrega a URL → widget mostra o texto; a "UX" do streamer é acertar a configuração; o público vê o resultado.
- **Notas:** marcação mínima com `aria-live` (irrelevante no OBS, mas inofensivo). A apresentação de erro/link revogado está em `apps/web/overlay-renderer.mjs` (não revisado aqui). O streamer não consegue ver no painel se o OBS está consultando.
- **Correções:** M — indicador "visto pelo OBS por último" no painel (exige story/API; não inventar); B — mensagem amigável no overlay para link revogado.
- **Para chegar a 10:** validação nativa em OBS/CEF (transparência, tamanho, link revogado) — impossível estaticamente.

## Tabela de notas (somente estática)

| Página | Nota | Principal bloqueio para 10 |
|---|---|---|
| Visão geral | 7,0 | Grade técnica de saúde, sem nova tentativa |
| Filas | 6,0 | Hierarquia de ações plana, parede de botões no mobile |
| Nova fila | 7,5 | Jargão de UID/marcadores, validação nativa |
| Comandos | 7,5 | Jargão na ajuda |
| Conexão | 6,5 | Sem assistente guiado, termos de credencial sem tradução |
| Operações | 6,5 | Sem "o que fazer" por estado |
| Configurações | 8,0 | Propósito dos rótulos pouco claro |
| Widgets | 6,0 | Opções sem tradução, 19 campos, link de uso único dispensável |
| Overlay | 7,0 | Exige validação em OBS/CEF |

## 8 principais correções (em ordem)

1. Widgets: traduzir todas as opções de estilo; predefinições + "Avançado".
2. Widgets: diálogo do link de uso único não dispensável por fundo/Escape antes de copiar.
3. Filas: hierarquia de ações (primário "Chamar próximo", menu "Mais ações" para destrutivas/raras).
4. Passada de glossário removendo "reward/toggle/FIFO/local-first/callback/reconciliar" de pt-BR/es.
5. Conexão: assistente numerado, botão de copiar callback, credenciais recolhidas quando conectado.
6. Visão geral: resumo de estado em linguagem simples no lugar dos seis cards técnicos; nova tentativa quando indisponível.
7. Operações: uma frase "o que fazer" por estado; verbos simples.
8. Plurais + diálogos com verbo e estilo de perigo; localizar a marca "Fila Local".

## Evidências ainda necessárias (impossíveis estaticamente)

Navegador real em 390×844 e desktop; percurso só com teclado em cada jornada; passadas com NVDA + Firefox e VoiceOver + Safari; medição de contraste da paleta de `panel.css`; renderização do overlay em OBS/CEF; ida e volta OAuth com app Twitch real; caminho de falha da área de transferência.
