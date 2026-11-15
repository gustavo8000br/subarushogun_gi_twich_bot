# OPS-15 — Plano e revisão de UX para LA-12, LA-13, LA-16, LA-17 (lotes C4 e C5)

- Data: 2026-11-13
- Autora e revisora: `@ux-design-expert` (Uma), execução autônoma (somente planejamento, nenhum código alterado)
- Branch: `chore/emergency-snapshot-2026-11-12`
- Ledger: `docs/pt-BR/process/open-acceptance-criteria-2026-11-10.md` (linhas LA-12, LA-13, LA-16, LA-17; LA-11 é a validação visual que fecha a LA-13)
- Par em inglês: `docs/stories/OPS-15/ux-plan-c4-c5.md` (mesma estrutura)

## 0. Escopo e limites (leia primeiro)

**Coberto (revisão estática):** leitura de `apps/frontend/styles/overlay.css`, `apps/frontend/app/(overlay)/overlay/overlay-root.jsx`, `apps/shared/panel/overlay-renderer.mjs`, `apps/frontend/features/widgets/widgets-page-content.jsx`, `apps/frontend/scripts/dev-runtime-config.mjs`, `apps/frontend/scripts/dev-server.mjs`, `apps/frontend/features/panel-shell/panel-provider.jsx`, `apps/frontend/lib/api/client.mjs`, `apps/api/src/http/local-session.mjs`, os catálogos de overlay e painel (en, es, pt-BR) e `docs/stories/OPS-25/obs-native-runbook.md`. Os contrastes WCAG abaixo foram **calculados** com a fórmula de luminância relativa do WCAG 2.x (cálculo, não medição de pixels).

**NÃO coberto (exige validação visual do `@qa`, seção 6):** sem renderização, sem navegador real, sem OBS/CEF, sem amostragem de pixels, sem percurso por teclado, sem leitor de tela, sem execução real de `npm run dev:start`. As notas são de revisão estática para o escopo planejado e não certificam o resultado implementado.

**Pesquisa:** o `docs/research-index.md` foi consultado primeiro. A linha 3 (FND-7 OBS Browser Source/CEF) é SUFICIENTE e nenhuma LACUNA se aplica a estes quatro itens, então não se pediu pesquisa nova. Os limiares WCAG usados (1.4.3 = 4,5:1 para texto pequeno, 1.4.6 = 7:1 reforçado) são os valores publicados pela W3C; esta agente não tem ferramenta de internet e não reabriu as páginas. O que o Next 16.4 imprime como URL "Local" para cada `--hostname` é NÃO VERIFICADO e é tarefa de medição do `@dev` (item 3).

## 1. Resumo

| Item | Ledger | Decisão (uma linha) | Nota |
|---|---|---|---|
| 1 | LA-12 (FT-61, N-1) | A linha de status passa para dentro da caixa do widget; o formulário mostra a altura mínima ao vivo e um aviso que não bloqueia; o runbook traz a mesma fórmula | 9,1 |
| 2 | LA-13 (FT-62, N-2) | Estilo padrão: texto branco sobre faixa preta a 72%, com o esmaecimento "atrasado" retirado da linha de status; o dono pode trocar com duas variáveis CSS | 9,2 |
| 3 | LA-16 (FT-66) | O `dev:start` nunca imprime `127.0.0.1` para o painel; o Next sobe com hostname `localhost` e o `dev-server.mjs` imprime uma primeira linha própria com a URL `localhost` | 9,0 |
| 4 | LA-17 (FT-67) | Quando o host da página é `127.0.0.1` ou `[::1]`, o painel troca o erro genérico por uma mensagem específica com link para a URL `localhost` | 9,1 |
| **Geral** | | O menor item é 9,0, então o portão de 9,0 é atingido para o escopo revisado | **9,1** |

Por que ficam acima do portão: cada item tem uma decisão, texto exato em três idiomas, critérios de aceite mensuráveis e um plano alternativo nomeado para o risco principal. O risco residual está no que só navegador real ou OBS mostram (seção 6); por isso nenhuma nota passa de 9,2.

## 2. Item 1 — LA-12 (FT-61): altura mínima da Browser Source

### 2.1 Achado (estático)

`.overlay-status` é `position: absolute; top: 100%` (`overlay.css`), então a linha de status é desenhada **abaixo** da caixa do widget. O renderizador define `height` e `overflow: hidden` nos modos de estouro `clip` e `ellipsis`, e o OBS corta tudo fora da Browser Source. Resultado: quando a altura da Browser Source é igual à altura do texto, a linha de status fica fora da caixa e invisível. O formulário só diz "Altura (px ou auto)" e nunca menciona o OBS.

### 2.2 Decisão

1. **Layout:** a linha de status vira uma linha normal dentro da caixa. `.overlay-widget` passa a ser uma grade de duas linhas (valor, status). A linha de status some quando vazia (`.overlay-status:empty { display: none }`), então um widget saudável tem exatamente o tamanho de hoje. Com altura fixa, a grade fixa a linha de status na base (`grid-template-rows: 1fr auto`). `width: max-content` continua, então com largura automática a caixa cresce para caber o texto de status.
2. **Regra da altura mínima (fórmula única, usada em todo lugar):** `mínimo = ceil(tamanho da fonte x 1,4) + 20` px. Os 20 px são a linha de status (texto de 12 px em linha de 16 px mais 2 px de preenchimento acima e abaixo). Exemplo: fonte 32 dá 65 px; fonte 24 dá 54 px.
3. **Formulário:** sob o campo Altura, uma dica (sempre visível, ligada por `aria-describedby`) mostra o mínimo ao vivo para o tamanho de fonte atual. Se a Altura for um número abaixo do mínimo, aparece uma segunda mensagem (`role="status"`, sem bloquear, o botão Salvar continua ativo, porque altura abaixo do mínimo é escolha válida quando o dono nunca quer ver a linha de status).
4. **Runbook:** `docs/stories/OPS-25/obs-native-runbook.md` (e o par pt-BR) recebe a mesma fórmula e um passo de captura por estado.

### 2.3 Texto exato

Chaves novas nos catálogos `panel` (o marcador `{min}` é um inteiro).

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.widget.height_hint` | Minimum height for this font size: {min} px (text plus 20 px for the status line). In OBS, set the Browser Source height to at least {min} px, or the status line is cut off. | Altura mínima para este tamaño de letra: {min} px (texto más 20 px para la línea de estado). En OBS, pon la altura de la fuente Navegador en al menos {min} px; si no, la línea de estado se corta. | Altura mínima para este tamanho de fonte: {min} px (texto mais 20 px para a linha de status). No OBS, deixe a altura da fonte Navegador em pelo menos {min} px, ou a linha de status será cortada. |
| `panel.widget.height_below_min` | This height is below {min} px. The status line may be cut off while it is shown. | Esta altura es menor que {min} px. La línea de estado puede cortarse mientras se muestra. | Esta altura é menor que {min} px. A linha de status pode ser cortada enquanto aparece. |

Parágrafo do runbook (en): "**Height.** The widget status line (for example "Update delayed") is drawn inside the widget box. Set the widget height, and the OBS Browser Source height, to at least `ceil(font size x 1.4) + 20` px. Example: font size 32 needs 65 px. With a smaller height the status line is cut off by OBS."
Parágrafo do runbook (pt-BR): "**Altura.** A linha de status do widget (por exemplo, "Atualização atrasada") é desenhada dentro da caixa do widget. Deixe a altura do widget, e a altura da fonte Navegador (Browser Source) do OBS, em pelo menos `ceil(tamanho da fonte x 1,4) + 20` px. Exemplo: fonte 32 precisa de 65 px. Com altura menor, o OBS corta a linha de status."

A chave de rótulo existente (`panel.widget.style.height`) não muda.

### 2.4 Critérios de aceite (verificáveis)

- CA-12.1 (unitário): uma função pura `minimumWidgetHeight(fontSize)` devolve `ceil(fontSize * 1.4) + 20`; casos 8 -> 32, 24 -> 54, 32 -> 65, 128 -> 200.
- CA-12.2 (unitário, jsdom): o campo Altura tem `aria-describedby` apontando para a dica; a dica contém o número do tamanho de fonte atual e se atualiza quando a fonte muda; a mensagem de abaixo-do-mínimo aparece só quando a Altura é numérica e menor que o mínimo, nunca para `auto`, e o Salvar continua ativo.
- CA-12.3 (catálogo): as duas chaves existem em en, es, pt-BR com o mesmo marcador `{min}`; `npm run validate:localization` passa.
- CA-12.4 (unitário sobre o contrato de `overlay.css`/renderizador): `.overlay-status` não é `position: absolute` e não tem `top: 100%`; `.overlay-status:empty` é `display: none`.
- CA-12.5 (navegador, `@qa`): com altura = mínimo para a fonte e `overflow: clip`, nos estados atrasado, indisponível e dados indisponíveis, toda a faixa de status está dentro da caixa: em captura de tela, a borda inferior da faixa fica na borda inferior da caixa ou acima (0 px da faixa fora).
- CA-12.6 (docs): runbook en e pt-BR com a fórmula e o exemplo; os dois arquivos atualizados juntos.

### 2.5 Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| O fator 1,2 é uma aproximação da altura de linha `normal` real da fonte (system-ui, Arial, Verdana, Georgia, Courier New diferem) | Média | O CA-12.5 roda nas cinco famílias do formulário; se alguma precisar de mais que 1,2, sobe-se o fator ao pior valor medido (a fórmula continua de uma linha) |
| Widgets já salvos com altura fixa pequena cortam o texto do valor enquanto há status | Baixa | Só durante estado de erro/atraso; a mensagem de abaixo-do-mínimo avisa o dono; sem migração de dados |
| Texto de status mais largo que uma largura fixa estreita quebra em segunda linha (não contada no mínimo) | Baixa | Aceito e documentado: o status quebra em vez de ser truncado, sem perda de informação |
| Deslocamento de layout quando o status aparece (altura automática cresce 20 px) | Baixa | Só em erro/atraso; a Browser Source já precisa ter a altura mínima |

### 2.6 Nota: 9,1

Pontos fortes: causa raiz achada no código (posição fora da caixa), uma fórmula reaproveitada no formulário, no aviso e no runbook, sem bloquear. Pontos que seguram a nota: o fator 1,2 não foi medido nas fontes (precisa de execução em OBS/navegador).

## 3. Item 2 — LA-13 (FT-62): legibilidade da linha de status

### 3.1 Achado (estático, com contraste calculado)

Estilo atual: texto `rgb(255 255 255 / 78%)`, sem sombra e sem fundo. Calculado contra uma cor de cena uniforme:

| Cor da cena | Contraste atual | Observação |
|---|---|---|
| Branco `#FFFFFF` | 1,00:1 | invisível |
| Cinza médio `#808080` | 3,08:1 | reprova 4,5:1 |
| Preto `#000000` | 12,41:1 | passa |

Um segundo defeito: `.overlay-widget.is-stale { opacity: .82 }` esmaece o widget inteiro, inclusive a linha de status, justamente quando o status precisa ser lido. Uma faixa com 72% de preto sob essa opacidade calcula 4,35:1 sobre branco, abaixo de 4,5:1.

### 3.2 Opções consideradas

| Opção | Veredito |
|---|---|
| A. Só sombra de texto | Rejeitada. Uma sombra fina em 12 px não cria razão de contraste garantida sobre cena clara ou movimentada, e a legibilidade não pode ser dita em número |
| B. **Fundo translúcido sólido ("faixa") + texto branco** | **Escolhida.** O fundo fixa um piso de luminância sob o texto, então a razão é a mesma em qualquer cena; o pior caso é uma cena branca pura |
| C. Faixa preta opaca | Rejeitada como padrão: mais pesada em cenas escuras e esconde mais da cena sem ganho sobre 72% |

### 3.3 Decisão (padrão proposto; o dono ainda não definiu o estilo e pode trocá-lo)

- Texto: `#FFFFFF`, 100% de opacidade, 12 px em linha de 16 px, peso 500.
- Faixa: fundo `rgb(0 0 0 / 72%)`, preenchimento `2px 6px`, raio `3px`, `justify-self: start`.
- Sem sombra de texto (acrescenta desfoque sem razão garantida).
- O esmaecimento "atrasado" vale só para `.overlay-value`, não para a faixa de status.
- O estilo fica em duas variáveis CSS locais em `.overlay-status`: `--overlay-status-fg` e `--overlay-status-bg`. É CSS local do overlay, não um token do design system, então não há aprovação de token envolvida. Se o dono quiser outro estilo, só esses dois valores mudam.
- O efeito do próprio widget (contorno, sombra) e as cores continuam valendo só para o valor.

### 3.4 Contraste calculado da proposta (WCAG 2.x, texto branco sobre a faixa composta)

| Cor da cena sob a faixa | Faixa composta | Contraste |
|---|---|---|
| Branco `#FFFFFF` (pior caso) | `rgb(71 71 71)` | 9,23:1 |
| Amarelo `#FFFF00` | `rgb(71 71 0)` | 9,62:1 |
| Cinza médio `#808080` | `rgb(36 36 36)` | 15,55:1 |
| Vermelho `#FF0000` | `rgb(71 0 0)` | 16,52:1 |
| Preto `#000000` | `rgb(0 0 0)` | 21,00:1 |

Branco puro é o fundo mais claro possível, então 9,23:1 é o piso para qualquer cena uniforme ou fotográfica. Passa 4,5:1 (1.4.3) e 7:1 (1.4.6). Alfas alternativos, para o dono: 60% dá 5,74:1 sobre branco (passa só 4,5:1); 80% dá 12,63:1.

### 3.5 Texto exato

Nenhum texto novo para a pessoa usuária. As três mensagens existentes permanecem:

| Chave | en | es | pt-BR |
|---|---|---|---|
| `overlay.status.unavailable` | Source unavailable | Fuente no disponible | Fonte indisponível |
| `overlay.status.data_unavailable` | Data temporarily unavailable | Datos temporalmente no disponibles | Dados temporariamente indisponíveis |
| `overlay.status.stale` | Update delayed | Actualización retrasada | Atualização atrasada |

### 3.6 Critérios de aceite (verificáveis)

- CA-13.1 (teste de contrato de CSS): `.overlay-status` declara fundo com alfa >= 0,70 e cor de texto `#fff` a 100% de opacidade; nenhuma `opacity` é aplicada em `.overlay-widget.is-stale` em si (a regra mira `.overlay-value`).
- CA-13.2 (unitário): um teste calcula a razão WCAG a partir dos valores padrão das duas variáveis CSS contra branco e falha se ficar abaixo de 7,0.
- CA-13.3 (navegador, `@qa`, medição de pixels): nos estados atrasado, indisponível e dados indisponíveis sobre quatro fundos (`#FFFFFF`, `#808080`, `#000000` e uma foto movimentada com áreas brancas), amostrar o pixel do fundo da faixa e o do texto numa captura e calcular a razão WCAG; toda amostra >= 7,0:1 (piso duro 4,5:1).
- CA-13.4 (navegador, `@qa`): estado atrasado com o valor esmaecido: o pixel do texto de status continua branco puro (255,255,255), sem esmaecer.
- CA-13.5 (OBS/CEF, `@qa`, LA-11): os mesmos quatro fundos como cenas do OBS (Browser Source com fundo transparente sobre cada cena); capturas anexadas à story. Qualquer leitura abaixo de 4,5:1 reprova.
- CA-13.6: com `prefers-reduced-motion: reduce` nada anima (regra existente mantida).

### 3.7 Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| O dono não gosta do visual da faixa | Baixa | Duas variáveis; tabela de alfas acima; o OK do dono é registrado antes do `rc`, conforme o ledger |
| O CEF renderiza o alfa `rgb(0 0 0 / 72%)` (sintaxe com espaço) diferente do Chromium | Baixa | Usar `rgba(0, 0, 0, 0.72)` no CSS por segurança; confirmado no CA-13.5 |
| A faixa cobre parte da cena na borda inferior | Baixa | Tem 20 px de altura e só aparece em estado de erro/atraso |

### 3.8 Nota: 9,2

Pontos fortes: o contraste está em números, o pior caso é coberto por construção e achou-se um defeito alheio (esmaecimento "atrasado") que teria quebrado a correção. Pontos que seguram a nota: calculado e não medido em pixels, e a renderização no CEF não verificada.

## 4. Item 3 — LA-16 (FT-66): banner do `dev:start`

### 4.1 Achado (estático)

O `dev-runtime-config.mjs` sobe o Next com `--hostname 127.0.0.1` (fora do Codespaces) e `--port 3000`. O Next imprime a própria linha "Local:" a partir desse hostname, então a primeira URL que uma pessoa nova vê é `https://127.0.0.1:3000`, onde a sessão do painel não funciona (LA-17). O `panelDevOrigin` já é `https://localhost:3000`; só o banner está errado. O `dev-server.mjs` não imprime nada sobre o endereço do painel.

### 4.2 Decisão

1. Subir o Next com `--hostname localhost` fora do Codespaces (o Codespaces mantém `0.0.0.0` e a URL encaminhada).
2. O `dev-server.mjs` imprime uma linha própria logo após criar os processos filhos, com a URL exata do painel: usa o `config` (`PANEL_DEV_ORIGIN`), nunca um texto fixo.
3. O `@dev` **mede** duas coisas antes de fechar o passo 1: (a) o que o Next 16.4.1 imprime com `--hostname localhost`; (b) quais interfaces ele abre (`ss -ltn` na porta 3000): os hosts permitidos da API e o certificado TLS precisam continuar valendo para `localhost`. **Plano alternativo** se `localhost` abrir só IPv6 ou quebrar o proxy: manter `127.0.0.1` no bind, manter o passo 2 e filtrar o stdout do filho para reescrever a linha "Local:"; seja qual for a escolha, o aceite abaixo não muda.
4. O `127.0.0.1:3109` interno da API não é endereço de pessoa usuária e nunca é impresso como tal.

### 4.3 Texto exato (saída de CLI)

A saída de desenvolvimento deste script hoje é só em inglês, então a linha de CLI fica em inglês; os outros dois idiomas são dados para o runbook.

| | Texto |
|---|---|
| en (CLI e runbook) | Open the panel at https://localhost:3000 — use localhost, not 127.0.0.1. |
| es (runbook) | Abre el panel en https://localhost:3000: usa localhost, no 127.0.0.1. |
| pt-BR (runbook) | Abra o painel em https://localhost:3000: use localhost, não 127.0.0.1. |

A porta no texto vem de `NEXT_DEV_PORT`, então é `3000` apenas por padrão.

### 4.4 Critérios de aceite (verificáveis)

- CA-16.1 (unitário): os argumentos do frontend em `buildDevRuntimeConfig()` contêm `--hostname localhost` quando `CODESPACE_NAME` não está definido e `0.0.0.0` quando está; os testes de contrato existentes do `dev-runtime-config` são atualizados.
- CA-16.2 (unitário): a função do banner devolve uma linha que contém `config.panelDevOrigin` e não contém a subcadeia `127.0.0.1`.
- CA-16.3 (execução real, `@dev` e depois `@qa`, Linux): capturar todo o stdout e stderr de `npm run dev:start` por 30 s; o texto contém `https://localhost:3000` e nenhuma ocorrência de `127\.0\.0\.1:3000`. O relatório cita as linhas capturadas.
- CA-16.4 (execução real): `https://localhost:3000` carrega o painel e uma ação que muda estado funciona; a saída de `ss -ltn` para a porta 3000 é registrada na story.
- CA-16.5 (docs): os documentos de instalação/runbooks que mostram a URL de desenvolvimento usam `localhost`; um grep em `docs/` por `127.0.0.1:3000` devolve só registros históricos.

### 4.5 Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| `--hostname localhost` abre só `::1` em alguns Linux/Windows, quebrando quem chama `127.0.0.1` (o proxy usa `https://localhost:3109`) | Média | Passo de medição 3(b); o plano alternativo declarado; testar também na rodada Windows (LB-01) |
| O texto "Local:" do Next muda numa versão futura | Baixa | O CA-16.3 é teste de saída real; o banner próprio é o sinal principal |
| O banner rola para fora da tela sob logs posteriores | Baixa | A linha é impressa uma vez no início e repetida no README; a mensagem de host errado no painel (item 4) é a rede de segurança |

### 4.6 Nota: 9,0

No limite do portão: a decisão é clara e a causa raiz é conhecida, mas o que o Next imprime e abre para `localhost` não está verificado, então o plano depende de uma medição com alternativa nomeada. Subiria com a captura da saída real.

## 5. Item 4 — LA-17 (FT-67): mensagem de sessão em host errado

### 5.1 Achado (estático)

Quando a página é aberta em `https://127.0.0.1:3000`, o `apiClient.initializeSession()` falha ou as primeiras requisições são recusadas (`local-session.mjs` devolve JSON 401/403 para `/api/*` sem sessão válida), o `panel-provider.jsx` define `status = 'unavailable'` e `panel.error.local_load`: "Não foi possível conectar à API local. Confira se o serviço está ativo e atualize a página." É conselho errado: o serviço está ativo e atualizar nunca ajuda. A mesma chave é usada em `operations-page-content.jsx`. O catálogo pt-BR de reserva (`load-first-party-panel-fallback.mjs`) permite ao painel mostrar texto mesmo quando a chamada do catálogo falhou.

### 5.2 Decisão

1. Um auxiliar puro `wrongHostForPanel(location)` devolve `{ host, url }` quando `location.hostname` é `127.0.0.1` ou `[::1]`, e `null` nos demais casos. A `url` é `https://localhost:` + a porta atual + o caminho atual, **sem** query string nem hash (assim parâmetros únicos de resultado nunca são copiados).
2. Quando o carregamento falha e o auxiliar devolve valor, o painel mostra `panel.error.wrong_host` mais um link com o texto `panel.error.wrong_host_action`, no lugar de `panel.error.local_load`. Mesmo contêiner de hoje (cartão `role="alert"` em `panel-shell.jsx`), então o anúncio não muda. O `operations-page-content.jsx` usa o mesmo auxiliar.
3. O link é uma âncora normal para a URL `localhost` (sem redirecionamento automático: ele esconde a causa, e cookies e confiança no certificado são por host).
4. Para qualquer outra falha o texto genérico permanece.
5. **Idioma:** no host errado os catálogos não carregam, então o texto vem do catálogo de reserva embutido (pt-BR). O `@dev` verifica se a reserva pode levar os três idiomas e então escolhe por `navigator.language`; se não puder, aparece pt-BR e a URL, neutra quanto ao idioma, é a parte acionável. Aceito para este escopo.
6. A mensagem não declara causa além do que se sabe (o host difere de `localhost`); não culpa o certificado nem o cookie.

### 5.3 Texto exato

`{host}` é o host do navegador, por exemplo `127.0.0.1`; `{url}` é o endereço corrigido.

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.error.wrong_host` | The session is not valid at {host}. This panel only works at localhost. | La sesión no es válida en {host}. Este panel solo funciona en localhost. | A sessão não vale em {host}. Este painel só funciona em localhost. |
| `panel.error.wrong_host_action` | Open {url} | Abrir {url} | Abrir {url} |

### 5.4 Critérios de aceite (verificáveis)

- CA-17.1 (unitário): `wrongHostForPanel` devolve o objeto para `127.0.0.1` e `[::1]` com a porta e o caminho certos e sem query nem hash; devolve `null` para `localhost`, um host de Codespaces, um IP de rede local e texto vazio.
- CA-17.2 (unitário, jsdom): com o carregamento rejeitado e host `127.0.0.1`, o alerta mostra o texto de host errado e um link cujo `href` é `https://localhost:<porta>/<caminho>`; com host `localhost` mostra `panel.error.local_load`.
- CA-17.3 (catálogo): as duas chaves existem em en, es, pt-BR com marcadores `{host}`/`{url}` iguais; `npm run validate:localization` passa.
- CA-17.4 (navegador, `@qa`): abrir `https://127.0.0.1:3000/`; o alerta mostra a mensagem, o link é alcançável por teclado, tem anel de foco visível, e ativá-lo leva a `https://localhost:3000/` com o painel funcionando.
- CA-17.5: nenhum texto de erro do console nem stack aparece para a pessoa; a mensagem não contém `referenceId`, token nem dados de cookie.
- CA-17.6 (a11y, estático mais `@qa`): o cartão mantém `role="alert"`; o texto do link faz sentido fora de contexto (contém a URL).

### 5.5 Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| A falha em `127.0.0.1` aparece por outra rota (por exemplo um 403 numa ação posterior, não no carregamento) | Média | O auxiliar é compartilhado; o `@dev` o acrescenta onde `local_load` e `SESSION_INITIALIZATION_FAILED` aparecerem; o CA-17.4 percorre o fluxo real |
| pt-BR mostrado a quem lê inglês ou espanhol | Baixa | Aceito, ver 5.2(5); a URL é a parte acionável |
| O catálogo de reserva não contém as chaves novas | Média | CA-17.2 e um teste de catálogo que lê a saída do carregador de reserva; o `@dev` acrescenta as chaves à fonte da reserva se ela for separada |
| A pessoa abre o app por um endereço de rede local, não 127.0.0.1 | Baixa | Fora do escopo: o texto genérico permanece; o auxiliar é limitado de propósito aos IPs de loopback |

### 5.6 Nota: 9,1

Pontos fortes: causa específica, saída em um clique, nenhuma afirmação falsa, URL segura (sem query). Pontos que seguram a nota: a reserva de idioma e a rota exata da falha em `127.0.0.1` não foram verificadas em navegador.

## 6. Revisão estática versus o que ainda exige validação real (`@qa`)

| Verificação | Tipo | Situação |
|---|---|---|
| Leitura de código, causas raiz, contrato de layout/CSS | Revisão estática | Feita neste documento |
| Razões WCAG de 3.4 | Calculadas pela fórmula | Feito; não medido em pixels |
| Texto em três idiomas, paridade de marcadores | Revisão estática | Feito; `validate:localization` a rodar |
| Contraste em pixels sobre quatro fundos (CA-13.3, 13.4) | Navegador real | **Pendente `@qa`** |
| Status dentro da caixa nas cinco famílias de fonte (CA-12.5) | Navegador real | **Pendente `@qa`** |
| Cenas OBS/CEF, fundo transparente, claras e escuras (CA-13.5, LA-11) | OBS/CEF nativo | **Pendente `@qa`** |
| Saída real do `npm run dev:start` e interfaces abertas (CA-16.3, 16.4) | Execução real | **Pendente `@dev` e depois `@qa`** |
| Fluxo de host errado em `https://127.0.0.1:3000` (CA-17.4) | Navegador real | **Pendente `@qa`** |
| Percurso por teclado da dica do formulário, do aviso e do link | Navegador real | **Pendente `@qa`** |
| Anúncio por leitor de tela (NVDA/VoiceOver) | Tecnologia assistiva | Fora deste escopo; acompanhado como LB-05 |
| Rótulos "Navegador" (es, pt-BR) iguais à interface localizada do OBS | Interface do OBS | **Pendente `@qa`**; ajustar as três dicas se o OBS usar outra palavra |

## 7. O que o `@dev` implementa (nesta ordem)

1. **C4-a (LA-12 + LA-13, uma mudança):** grade em `overlay.css`, linha de status dentro da caixa, estilo de faixa com as duas variáveis CSS, esmaecimento "atrasado" só no valor; `overlay-root.jsx` sem mudança, salvo se faltar uma classe; auxiliar `minimumWidgetHeight`; dica e aviso em `widgets-page-content.jsx`; as duas chaves nos catálogos `panel` (en, es, pt-BR); parágrafo do runbook em en e pt-BR. Testes: CA-12.1 a 12.4, 12.6, 13.1, 13.2.
2. **C4-b:** colher a evidência dos CA-12.5 e CA-13.3 a 13.5 com o `@qa` (o script ou os passos manuais entram no runbook).
3. **C5-a (LA-16):** medir antes a saída do Next e as interfaces abertas com `--hostname localhost`; depois alterar o `dev-runtime-config.mjs`, acrescentar a linha de banner no `dev-server.mjs`, atualizar o teste de contrato da configuração, rodar o `dev:start` e anexar a saída capturada. Testes: CA-16.1 a 16.3, 16.5.
4. **C5-b (LA-17):** auxiliar `wrongHostForPanel`, usá-lo em `panel-provider.jsx`/`panel-shell.jsx` e `operations-page-content.jsx`, as duas chaves nos catálogos `panel` e na reserva, marcação do link. Testes: CA-17.1 a 17.3, 17.5.
5. Atualizar checklist e lista de arquivos da story; en e pt-BR juntos; nenhuma mudança em tokens do design system.

Não fazer: sombra de texto na linha de status, redirecionamento automático a partir de `127.0.0.1`, bloquear o salvamento por altura baixa, nem imprimir `127.0.0.1` como endereço do painel.

## 8. Nota de medição: fator da altura de linha (2026-11-13)

Medido no navegador desta máquina: a fonte `system-ui` tem altura de linha `normal` de 1,344 x o tamanho da fonte, e o chip da status ficava 4 px fora da caixa com `ceil(tamanho da fonte x 1,2) + 20`. Seguindo a mitigação de risco da seção 5, o fator subiu para **1,4** (o pior valor medido, arredondado para cima): `mínimo = ceil(tamanho da fonte x 1,4) + 20` (fonte 8 -> 32 px, 24 -> 54 px, 32 -> 65 px, 128 -> 200 px). As outras quatro famílias (Arial, Verdana, Georgia, Courier New) ainda precisam da execução do CA-12.5 com o `@qa`; se alguma passar de 1,4, sobe-se o fator de novo. Nenhum crédito de aceite é dado aqui.

## 9. Nota de medição: contraste da faixa de status no OBS nativo (2026-11-13, D-2)

O `@qa` mediu a faixa de status no OBS nativo 32.2.2 (CEF 127) sobre uma cena branca pura: **3,19:1** com `rgba(0, 0, 0, 0.72)`, abaixo do piso de 4,5:1 do CA-13.5. O mesmo widget no Chrome medeu 9,29:1. O OBS compõe a camada do navegador em **luz linear**, então 72% de preto sobre branco vira o pixel 144 em vez de 71. As seções 3 e 4 (4,35:1 e 9,23:1) foram calculadas em sRGB e superestimam o resultado no OBS.

Candidatos medidos sobre cena branca / cinza (128) / escura no OBS (fonte: `qa-c4-c5-live-2026-11-13.md`, seção 2.3):

| Alfa | Branca | Cinza | Escura |
|---|---|---|---|
| 0,72 (anterior) | 3,19:1 | 9,59:1 | 21:1 |
| 0,85 | 5,25:1 | 12,82:1 | 21:1 |
| **0,90 (adotado)** | **7,11:1** | 14,74:1 | 21:1 |
| 1,00 | 21:1 | 21:1 | 21:1 |

Decisão: `--overlay-status-bg` passa a ser `rgba(0, 0, 0, 0.9)` (meta de 7:1 atingida; não totalmente opaco, então a cena ainda aparece um pouco). As duas variáveis continuam, e o dono ainda pode sobrescrevê-las. O teste unitário exige alfa >= 0,90 e modela a mistura em luz linear. **Regra: meça contraste e legibilidade no OBS, não só no Chrome**, porque os dois misturam de forma diferente. Esta seção substitui o valor de 72% das seções 2 a 4 e do CA-13.5. O `@qa` deve repetir a medição do OBS sobre cena branca; nenhum crédito de aceite é dado aqui.
