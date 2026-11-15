# OPS-15 — Plano e revisão de UX para o E7: mostrar o `referenceId` quando a visão geral falha ao carregar

- Data: 2026-11-13
- Autora e revisora: `@ux-design-expert` (Uma), execução autônoma (somente planejamento, nenhum código alterado)
- Branch: `chore/emergency-snapshot-2026-11-12`
- Decisão do proprietário (2026-11-13): na falha de carga da visão geral (painel Next, E7), mostrar o `referenceId` do erro junto da mensagem genérica localizada, para a pessoa informá-lo no suporte. Regra de erros do projeto: texto genérico localizado + `referenceId`; nunca mensagem, stack ou dados internos.
- Par em inglês: `docs/stories/OPS-15/ux-plan-e7-reference-id.md` (mesma estrutura)

## 0. Escopo e limites (leia primeiro)

**Coberto (revisão estática):** `apps/frontend/lib/api/client.mjs`, `apps/frontend/features/panel-shell/panel-provider.jsx`, `wrong-host-message.jsx`, `outcome-region.jsx`, `load-panel-snapshot.mjs`, `apps/frontend/features/widgets/widget-link-dialog.jsx` (padrão de cópia existente), `apps/frontend/styles/panel.css`, `apps/api/src/http/safe-http-error-handler.mjs`, `queue-routes.mjs`, `local-session.mjs`, `apps/shared/panel/panel-catalog.mjs`, os catálogos do painel (en, es, pt-BR) e `tests/e2e/overview-degraded-browser-only.mjs`.

**NÃO coberto (exige `@qa`, seção 8):** sem renderização, sem navegador real, sem percurso por teclado, sem leitor de tela, sem amostragem de contraste em pixels. As notas são de revisão estática só para este escopo e não certificam a implementação.

**Pesquisa:** regra do `docs/research-index.md` aplicada; nenhuma pesquisa nova foi pedida (sem LACUNA: reaproveita um padrão que o painel já tem). Os limiares WCAG (1.4.3 = 4,5:1) são os valores publicados do W3C; esta agente não tem ferramenta de internet.

## 1. Achados (estáticos)

1. O cliente já captura o id: `client.mjs` coloca `referenceId` no erro lançado, vindo de `payload.referenceId` ou do cabeçalho `x-error-reference` da resposta (só para respostas não-2xx com corpo do servidor).
2. A API cria o id: `safe-http-error-handler.mjs` (erros inesperados, HTTP 500, corpo `{ code: 'INTERNAL_ERROR', error, referenceId }` mais o cabeçalho `x-error-reference`) e `queue-routes.mjs` (o mesmo par nos caminhos 5xx/503). O id vem de `reportDiagnostic`, então bate com o log estruturado do servidor.
3. A chave `panel.error.reference` ("Reference: {id}", es "Referencia: {id}", pt-BR "Referência: {id}") já existe nos três catálogos, no fallback first-party (`panel-catalog.mjs`, placeholder `id`) e é exibida por `outcome-region.jsx` e pelas telas de operações e filas. O caminho de carga da visão geral é o único que a descarta: `panel-provider.jsx` (`.catch((loadError) => ...)`) define só `status = 'unavailable'` e uma chave de mensagem. O E2E registra essa lacuna como `boundary('E7', ...)`.
4. O formato do id já é validado em todo lugar com `^[A-Za-z0-9_.-]{1,64}$` (`SAFE_REFERENCE`). Essa é a única lista de permissão a reutilizar.
5. Na falha da primeira carga, a requisição do catálogo faz parte do mesmo `Promise.all`; por isso o painel aparece com o **fallback first-party** pt-BR (o E2E afirma isso). O texto novo precisa existir também nesse fallback.
6. O padrão de cópia existente (`widget-link-dialog.jsx`): `navigator.clipboard.writeText`, uma região `role="status"` para sucesso e uma `role="alert"` para falha, com alternativa manual.

## 2. Decisão

### 2.1 Onde

Dentro do mesmo cartão `role="alert"` que mostra a mensagem genérica (`PanelLoadError` em `wrong-host-message.jsx`, classe `status-card error-card`), como segunda linha **depois** da mensagem. Sem região nova, sem modal, sem toast: o alerta é anunciado uma vez, mensagem e id juntos, e nada move o foco.

Estrutura (um cartão):

```
[mensagem genérica localizada]
Referência: <code>overview-ref-9</code>   [Copiar referência]
[ "Referência copiada" em região status, vazia até o uso ]
```

### 2.2 Aparência e comportamento

- **Rótulo e formato:** a chave existente `panel.error.reference` ("Referência: {id}"). O id fica em `<code>` (monoespaçado, `user-select: all`, `overflow-wrap: anywhere` para que 64 caracteres nunca estourem uma janela estreita). O id aparece exatamente como recebido, sem truncar, sem mudar caixa, sem agrupar.
- **Copiar:** um `<button type="button">` comum com o texto visível "Copiar referência" (o nome acessível é igual ao texto visível, WCAG 2.5.3). Usa `navigator.clipboard.writeText` só com o id (não a frase). Altura mínima de 44 px, reaproveitando o estilo `.status-card button` (já existe em `panel.css`, sem tokens novos).
- **Retorno:** o texto de sucesso vai para um elemento `role="status"` separado ("Referência copiada"); a falha vai para um `role="alert"` separado ("Não foi possível copiar automaticamente. Selecione o código e copie."). Os dois elementos existem desde a primeira renderização e começam vazios, para o anúncio ser confiável. Na falha o id continua selecionável (`user-select: all`), então há caminho manual sem permissão de área de transferência.
- **Foco:** nada move o foco ao carregar. Depois de acionar o botão, o foco permanece nele (sem remontar). O id é texto simples na ordem de leitura, alcançável no modo de navegação do leitor de tela; não precisa de parada de Tab.
- **Leitores de tela:** o alerta anuncia "mensagem. Referência: overview-ref-9". O id é lido como digitado (sem reescrever com `aria-label`). `<code>` não ganha papel extra. O `lang` do id não muda.
- **Contraste:** o texto do cartão é `#ffc5ca` sobre o fundo `surface-raised`; o id herda essa cor, sem cor nova. O `@qa` mede (seção 8); piso 4,5:1, meta 7:1. Não esmaecer o id com opacidade.
- **Largura da janela:** a linha quebra abaixo da mensagem (flex-wrap), e o botão nunca encolhe abaixo do seu rótulo.

### 2.3 Quando o id aparece (por origem da falha)

| Falha | Tem id? | Mostra? | Motivo |
|---|---|---|---|
| HTTP 500 de `/api/state` (ou outra requisição do snapshot) com `referenceId` no corpo ou no cabeçalho `x-error-reference` | Sim (feito pelo servidor, mesmo id do log) | **Sim** | O caso principal da decisão do proprietário |
| HTTP 5xx/503 dos caminhos de `queue-routes.mjs` no snapshot (por exemplo `/api/queues`) | Sim | **Sim** | Mesmo contrato do handler |
| Timeout de leitura (`REQUEST_TIMEOUT`, `timedOut: true`, chave `panel.error.read_timeout`) | Não: o cliente abortou, não houve resposta do servidor, qualquer id seria inventado | **Não**; o texto de timeout fica sozinho | Sem invenção (Constitution IV); um id gerado no cliente não bateria com nenhum log |
| Falha de rede / conexão recusada (`REQUEST_FAILED`, `status: 0`) | Não | **Não** | Idem |
| Host errado (`panel.error.wrong_host`, LA-17) | Não se aplica: a mensagem já traz a própria correção; 401/403 sem sessão não têm `referenceId` (`local-session.mjs` não devolve) | **Não** | Um código de referência distrairia da única ação útil (o link para localhost); o AC-17.5 do plano C4/C5 continua válido |
| 4xx com código fechado (sessão, CSRF) sem id | Não | **Não** | Nada a informar |
| Corpo ou cabeçalho do servidor traz valor que não passa em `^[A-Za-z0-9_.-]{1,64}$` | Rejeitado | **Não** | Nunca exibir texto do servidor sem validar |

Se várias requisições do snapshot falharem, a primeira rejeição do `Promise.all` é a que o provider já recebe; o id dela é o exibido (uma falha, um id). Documentado, sem alterar.

### 2.4 Texto exato

Chaves existentes (sem mudança, nos três catálogos e no fallback): `panel.error.local_load`, `panel.error.read_timeout`, `panel.error.reference`.

Chaves novas (catálogos `panel` en, es, pt-BR **e** a lista do fallback first-party em `panel-catalog.mjs`; nenhuma tem placeholder):

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.error.reference_copy` | Copy reference | Copiar referencia | Copiar referência |
| `panel.error.reference_copied` | Reference copied | Referencia copiada | Referência copiada |
| `panel.error.reference_copy_failed` | Could not copy automatically. Select the code and copy it. | No se pudo copiar automáticamente. Selecciona el código y cópialo. | Não foi possível copiar automaticamente. Selecione o código e copie. |

Opcional (não exigido pela decisão do proprietário): uma dica de uma linha "Informe esta referência ao pedir suporte." (en: "Quote this reference when you ask for support."; es: "Indica esta referencia al pedir soporte."). **Decisão: não adicionar**; o rótulo "Referência" já é o vocabulário existente e a tela é densa. Rever só se o `@qa` ou o proprietário acharem que as pessoas não sabem o que fazer com o código.

### 2.5 Auxiliar e ligação (para o `@dev`, sem código escrito aqui)

1. Reutilizar (não duplicar) a lista de permissão: um `safeReferenceId(error)` exportado (já existe uma versão em `operations-page-content.jsx`; mover para um módulo compartilhado do panel-shell e importar nos dois lugares).
2. `panel-provider.jsx`: no `.catch` da carga, guardar `loadErrorReference = wrongHostForPanel() || loadError?.timedOut ? null : safeReferenceId(loadError)` junto de `error`; limpar quando a carga der certo ou reiniciar.
3. `PanelLoadError` recebe `referenceId` e desenha a linha e o botão (componente pequeno novo `ReferenceLine`, reutilizável na falha de atualização abaixo).
4. Secundário, mesmo auxiliar (DEVERIA): a falha da atualização na própria página (`panel.overview.refresh_failed`, segunda metade do E7) passa o id pelo `outcome-region.jsx` existente (`outcome.referenceId`); sem UI nova, o texto já exibe a referência.
5. Nunca registrar, guardar ou enviar o id a partir do navegador; ele vive só no estado do React. Sem mudança em API, `client.mjs` ou tokens do design system.

## 3. Critérios de aceite (verificáveis)

- AC-E7.1 (unitário): `safeReferenceId` devolve o id para `overview-ref-9`, `a.b_c-1` e 64 caracteres; devolve `null` para 65 caracteres, vazio, espaços, `<script>`, uma URL, um número, `null`.
- AC-E7.2 (unitário, jsdom): com a carga rejeitada por um erro `{ status: 500, referenceId: 'overview-ref-9' }`, o cartão `role="alert"` contém a mensagem genérica **e** "Referência: overview-ref-9" **e** um botão chamado "Copiar referência"; o id está dentro de `<code>`.
- AC-E7.3 (unitário, jsdom): rejeição com `timedOut: true`, com `status: 0`, com id inválido e no host `127.0.0.1`: sem linha de referência e sem botão de copiar.
- AC-E7.4 (unitário, jsdom): clicar no botão chama `clipboard.writeText` exatamente com o id (não a frase); o elemento `role="status"` passa a conter "Referência copiada"; um `writeText` que rejeita e a ausência de `navigator.clipboard` põem o texto de falha no elemento `role="alert"`; o foco permanece no botão.
- AC-E7.5 (unitário, jsdom): os elementos de status e alerta do retorno da cópia estão no DOM antes do clique e vazios.
- AC-E7.6 (catálogo): as três chaves novas existem em en, es, pt-BR e no fallback first-party; `npm run validate:localization` passa; um teste lê a saída do fallback e encontra as chaves e a `panel.error.reference` existente.
- AC-E7.7 (privacidade): um teste com o corpo 500 da fixture do E2E (`private server copy`, `secretFrame`, `INTERNAL_ERROR`) prova que nenhuma dessas strings chega ao DOM; só o id da lista de permissão.
- AC-E7.8 (E2E, `overview-degraded-browser-only.mjs`): a fixture existente com `x-error-reference: overview-ref-9`; o cartão mostra o id; a linha antiga `boundary('E7', ...)` (lacuna) é removida e substituída pelas asserções abaixo.
- AC-E7.9 (a11y, `@qa`): o id é selecionável com duplo e triplo clique; o botão é alcançável por Tab, tem anel de foco visível e alvo de 44 px; o contraste do texto do id é medido >= 4,5:1.
- AC-E7.10: sem linha de referência e sem botão depois de uma recarga bem-sucedida (etapa de recuperação do E2E); nenhum texto novo aparece no caso de timeout.

## 4. Testes

### 4.1 jsdom (`tests/unit`, ao lado de `wrong-host-panel.test.jsx` e `next-overview-panel.test.jsx`)

Um `overview-load-reference.test.jsx` novo cobre AC-E7.1 a AC-E7.7. Reutilizar o harness de provider existente; simular `navigator.clipboard` com um espião; usar timers falsos para o caso de timeout de leitura (como os testes do cliente).

### 4.2 E2E (`tests/e2e/overview-degraded-browser-only.mjs`)

Mudanças no fluxo existente, mantendo a estrutura:

1. Depois de `alert.waitFor`, afirmar que o texto do alerta contém o `panel.error.reference` do fallback pt-BR renderizado com `overview-ref-9` (montar o texto esperado a partir do catálogo com o id, sem fixar a frase).
2. Afirmar que `code` dentro do alerta tem o texto `overview-ref-9` e que o botão com o nome do `panel.error.reference_copy` do fallback está visível.
3. Conceder permissão de área de transferência no contexto do Playwright, clicar no botão, ler `navigator.clipboard.readText()` e afirmar que é `overview-ref-9`; afirmar que o texto de status aparece.
4. Manter a asserção de privacidade (sem `private server copy`, `secretFrame`, `INTERNAL_ERROR`).
5. Após a recuperação (`stateMode = 'ok'` e recarga), afirmar que não restam `code` com o id nem botão de copiar.
6. Adicionar uma segunda passada sem cabeçalho e sem id no corpo (fixture sem `x-error-reference`): o cartão mostra a mensagem genérica sem linha de referência.
7. Adicionar uma terceira passada para o timeout de leitura usando a opção de atraso do harness se existir; caso contrário, deixar para o teste jsdom (AC-E7.3) e registrar como limite.
8. Remover a linha de lacuna `boundary('E7', ...)` e a frase do comentário de cabeçalho que diz que o painel não exibe o id.

### 4.3 Mutações sugeridas (cada uma deve fazer ao menos um teste falhar)

| # | Mutação | Teste que deve falhar |
|---|---|---|
| M1 | Descartar `loadErrorReference` (nunca passar a `PanelLoadError`) | AC-E7.2, E2E etapa 1 |
| M2 | Remover a lista de permissão em `safeReferenceId` (exibir qualquer string) | AC-E7.1, AC-E7.7 |
| M3 | Mostrar um id criado no cliente para `timedOut` ou `status: 0` | AC-E7.3 |
| M4 | Mostrar o id também no host `127.0.0.1` | AC-E7.3 |
| M5 | Copiar a frase inteira em vez do id | AC-E7.4, E2E etapa 3 |
| M6 | Renderizar a linha de referência fora do cartão `role="alert"` | AC-E7.2 |
| M7 | Criar o elemento de status da cópia só depois do clique | AC-E7.5 |
| M8 | Engolir em silêncio a falha da área de transferência (sem texto de falha) | AC-E7.4 |
| M9 | Deixar o id após uma recarga bem-sucedida (estado velho) | AC-E7.10, E2E etapa 5 |
| M10 | Apagar as chaves novas só da lista do fallback | AC-E7.6 |
| M11 | Renderizar `error.message` ou `payload.error` ao lado do id | AC-E7.7 |

## 5. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| O fallback pt-BR é o único idioma numa primeira carga que falhou; quem lê inglês ou espanhol vê rótulos em pt-BR | Baixa | Aceito (igual ao LA-17); o id em si é neutro quanto ao idioma e é a parte acionável. Es/en passam a valer quando os catálogos carregam |
| `navigator.clipboard` indisponível em contexto não seguro ou negado | Baixa | O painel roda em `https://localhost` (seguro); texto de falha mais `user-select: all` é a alternativa |
| A pessoa confunde o id com uma senha/segredo | Baixa | O rótulo "Referência" é o vocabulário do projeto; o id não é segredo, é feito pelo servidor e seguro pela lista de permissão |
| O id quebra mal numa janela estreita | Baixa | `overflow-wrap: anywhere`; o AC-E7.9 verifica 320 px |
| `Promise.all` mostra o id de só uma entre várias falhas | Baixa | Um id basta para o suporte achar o log; documentado |
| Quem ajuda pode não alcançar os logs do servidor | Baixa | Fora de escopo: este plano só torna o código visível |

## 6. Nota

| Item | Nota |
|---|---|
| Onde/como (um cartão de alerta, sem mudar o foco) | 9,2 |
| Origem e veracidade (sem id inventado para timeout/host errado; lista de permissão) | 9,3 |
| Desenho de acessibilidade (nomes, regiões vivas, alternativa selecionável, tamanho do alvo) | 9,0 |
| Texto trilíngue e cobertura do fallback | 9,1 |
| Testes e mutações | 9,2 |
| **Geral (revisão estática, só o escopo planejado)** | **9,1** |

Por que não mais alta: contraste do id no cartão de erro, quebra em 320 px, comportamento real da área de transferência e leitura do id por leitor de tela não foram medidos. O gate mínimo é 9,0/10 para o escopo revisado: **atendido na revisão estática**, com a validação visual/assistiva ainda pendente.

## 7. Não fazer

- Inventar ou gerar um id no cliente (timeout, falha de rede, host errado).
- Mostrar `error.message`, o texto `error` do servidor, a stack, o código `INTERNAL_ERROR` ou qualquer outro campo do corpo.
- Mover o foco para o id ao carregar, ou copiar automaticamente.
- Abrir modal ou toast para o id.
- Alterar a API, o `client.mjs` ou tokens do design system.

## 8. Revisão estática versus o que ainda exige validação real (`@qa`)

| Verificação | Tipo | Estado |
|---|---|---|
| Origem do id (client.mjs, handlers da API), tabela de erros, ligação, chaves de catálogo | Revisão estática | Feita neste documento |
| Texto trilíngue e paridade de placeholders | Revisão estática | Feita; `validate:localization` a rodar |
| Comportamento jsdom (AC-E7.1 a E7.7) | Unitário | Pendente `@dev` |
| E2E em navegador real (AC-E7.8, leitura da área de transferência) | Navegador real | **Pendente `@qa`** |
| Contraste do id no cartão de erro, quebra em 320 px, anel de foco (AC-E7.9) | Navegador real, pixel/visual | **Pendente `@qa`** |
| Leitura de "mensagem. Referência: id" e anúncios da cópia por leitor de tela | Tecnologia assistiva | Fora de escopo aqui; acompanhado como LB-05 |
| Mutações M1 a M11 | Qualidade dos testes | **Pendente `@dev`/`@qa`** |

## 9. O que o `@dev` implementa (nesta ordem)

1. Mover `safeReferenceId` para um módulo compartilhado do panel-shell; adicionar o teste do AC-E7.1.
2. Adicionar `loadErrorReference` ao `panel-provider.jsx`, passá-lo a `PanelLoadError`, criar `ReferenceLine` (code, botão de copiar, duas regiões vivas), CSS mínimo em `panel.css` com as cores existentes.
3. Adicionar as três chaves aos catálogos (en, es, pt-BR) e à lista do fallback em `panel-catalog.mjs`.
4. Escrever `overview-load-reference.test.jsx` (AC-E7.2 a E7.7) e atualizar `overview-degraded-browser-only.mjs` (seção 4.2).
5. Rodar as mutações (seção 4.3) e registrar qual teste matou cada uma.
6. Atualizar o checklist e a lista de arquivos da story; en e pt-BR juntos.
