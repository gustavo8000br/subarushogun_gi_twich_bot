# Pesquisa OPS-15: diálogo do link único do widget (`<dialog>` nativo, Clipboard, mascaramento, testes)

- Data: 2026-10-22. Autor: @analyst (Atlas). Apenas pesquisa; nenhum código foi alterado.
- Entrada para: `docs/pt-BR/stories/OPS-15/ux-plan-widget-link-and-spec.md` (Item 1).
- Rótulos: **VERIFICADO** = confirmado em fonte oficial ou neste repositório; **PARCIAL** = a fonte oficial confirma parte e o resto vem de fonte secundária ou da minha leitura; **NÃO VERIFICADO** = só comunidade ou memória, precisa ser provado pelo E2E em navegador.
- Limitação: nenhum navegador real foi executado nesta pesquisa. Toda afirmação sobre navegador ainda depende do E2E com Playwright da seção 5.

## 1. `<dialog>` nativo

### 1.1 Escape, `cancel` e o "Escape duplo"

- **VERIFICADO** (WHATWG HTML, "Close requests and close watchers", lido em 2026-10-22, https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers): no algoritmo de request-close, `canPreventClose` só é verdadeiro quando a janela **tem history-action activation**; o evento `cancel` é disparado "with the cancelable attribute initialized to canPreventClose".
- **Correção ao plano de UX:** o plano diz que o Chromium "pode pular" o `cancel`. Pela spec atual, o `cancel` **continua disparando, mas com `cancelable === false`**; então `preventDefault()` não tem efeito e o diálogo fecha. Versões antigas do Chromium descritas no Intent to Ship pulavam o evento. Nos dois casos o resultado é o mesmo: **um handler de `cancel` sozinho não mantém o diálogo aberto**.
- **PARCIAL** (Intent to Ship do Blink, https://groups.google.com/a/chromium.org/g/blink-dev/c/jM5au7yYzHM/m/5SWuXPMdAgAJ; espelho do explainer https://p.codekk.com/detail/60ecf1db982bbb7260281a26; Manuel Matuzović, 2025, https://www.matuzo.at/blog/2025/close-requests-dialog): é intencional (evita prender o botão voltar) e vale também no desktop. Consequências: (a) um diálogo aberto por código sem clique/tecla posterior pode fechar no **primeiro** Escape, porque `showModal()` depois de um `fetch` não concede ativação; (b) depois de um `cancel` impedido, um segundo Escape sem nova ativação passa.
- **PARCIAL** (README do WPT, https://searchfox.org/mozilla-central/source/testing/web-platform/tests/close-watcher/user-activation/README.md): `<dialog>` enfileira uma task para `close`, mas dispara `cancel` de forma síncrona.
- **NÃO VERIFICADO:** chamar `preventDefault()` no `keydown` de Escape interrompe o close request no Chromium/Firefox. Não confie só nisso.

### 1.2 `closedby`

- **VERIFICADO** (MDN `closedBy`, modificado em 2026-08-24, https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/closedBy): valores `any` (light dismiss + Escape + código), `closerequest` (Escape + código), `none` (só código). Sem atributo ou inválido = Auto: `showModal()` age como `closerequest`. Status: **disponibilidade limitada, não Baseline**.
- **PARCIAL** (BCD do MDN lido por fontes secundárias, por exemplo https://www.stefanjudis.com/blog/risky-mobile-close-requests/): Chrome/Edge/Android **134+**, Firefox **141+**, Safari estável **sem suporte** (só Technology Preview). As versões não foram confirmadas na tabela do caniuse.
- **VERIFICADO** (MDN `<dialog>`, modificado em 2026-10-02, https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog): clique no backdrop **não** fecha um diálogo modal, a menos que `closedby="any"`. Logo, o defeito D1 vem do nosso próprio `onMouseDown`, não do navegador.
- Padrão de fallback: navegadores sem suporte ignoram o atributo (Auto). Não adicione handler de clique no backdrop (no-op é o padrão). Mantenha as proteções de `cancel` + `close` da seção 1.4.

### 1.3 Foco com `showModal()`

- **VERIFICADO** (MDN `<dialog>`): o foco vai para o primeiro descendente focável ou para o elemento com `autofocus`. `showModal()` deixa o resto da página inerte e expõe `aria-modal="true"`. Sempre ofereça um botão explícito de fechar.
- **VERIFICADO** (W3C WAI-ARIA APG Modal Dialog, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): em etapa irreversível, foque a **ação menos destrutiva**; se o elemento que abriu o diálogo não existir mais, mova o foco para um elemento coerente com o fluxo.
- **PARCIAL:** a spec HTML devolve o foco ao elemento focado antes do `showModal()`. No fluxo de criação esse elemento (o editor) já foi desmontado, então o retorno de foco precisa ser **explícito**, como planejado (D6). No React, faça isso depois que a lista renderizar de novo (`useEffect`/`requestAnimationFrame` com seletor `data-widget-id`), não de forma síncrona no handler de `close`.
- Observação: no React 19, `autoFocus` em elemento dentro de `<dialog>` é aplicado na montagem, não quando `showModal()` roda (**NÃO VERIFICADO**). É mais seguro chamar `copyButtonRef.current.focus()` logo após `showModal()`.

### 1.4 Conjunto de proteções recomendado (defesa em profundidade)

1. `<dialog closedby="none">` (ignorado onde não houver suporte).
2. `keydown` no diálogo: se `Escape`, `preventDefault()` e encaminhar para a regra 1 (mostrar `confirm-close` ou fechar se `copied`). Com `closedby="none"`, esse é o único caminho do Escape no Chrome 134+/Firefox 141+.
3. `cancel`: `preventDefault()` + encaminhar para a regra 1 (cobre Safari e casos canceláveis).
4. `close`: se a ref `closingByCode` for falsa e o link ainda estiver no estado, chamar `showModal()` de novo na view `confirm-close` e focar `Voltar ao link`. Defina `closingByCode = true` antes de todo `dialog.close()` feito pelo nosso código.
5. Nunca coloque handler de click/mousedown no backdrop.

## 2. Clipboard API

- **VERIFICADO** (MDN Secure Contexts, https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): `localhost`, `*.localhost`, `127.0.0.0/8` e `::1` são potencialmente confiáveis; `https://localhost` é seguro por dois motivos. O Clipboard está disponível no painel.
- **VERIFICADO** (MDN `writeText`, https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText): só em contexto seguro; retorna Promise; rejeita com `NotAllowedError`. Baseline amplamente disponível (desde 2020). web.dev (https://web.dev/articles/async-clipboard): Chrome 66, Firefox 63, Safari 13.1; o Safari trata ativação do usuário de outro jeito (bug WebKit 222262).
- **PARCIAL/NÃO VERIFICADO** (memória do comportamento de Chromium/Firefox, não reconfirmada hoje): o Chromium concede `clipboard-write` automaticamente à aba ativa, sem prompt; rejeita quando o **documento não está focado** (por exemplo, DevTools com foco). Firefox e Safari exigem **ativação transitória do usuário**. Regra: chame `writeText` **diretamente no handler de clique**, antes de qualquer `await`.
- Modos de falha a tratar: `navigator.clipboard` indefinido (contexto inseguro, navegador embutido antigo como docks personalizados do OBS/CEF), `NotAllowedError` (sem ativação, permissions policy em iframe, documento sem foco), outras rejeições. Todos vão para o alerta de fallback, nunca para log com a URL.
- **VERIFICADO** (MDN `execCommand`, modificado em 2026-08-21, https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand): obsoleto e não padronizado; o comportamento de `copy` varia entre navegadores. **Recomendação:** não use `execCommand('copy')`; o fallback é a cópia manual (revelar o campo, selecionar o texto e orientar a pessoa a copiar).

## 3. Mascarar o segredo (leitores de tela e transmissão)

- **VERIFICADO** (MDN Turning off autocompletion, https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion): navegadores ignoram `autocomplete="off"` em campos de senha e ainda oferecem salvar o login.
- Portanto, **não use `<input type="password">`**: pode acionar a interface de salvar/gerar senha do gerenciador (e guardar o segredo num perfil sincronizado), leitores de tela anunciam "senha, protegido" e o comportamento de selecionar/copiar muda. **PARCIAL** (efeitos inferidos da nota do MDN; não testados aqui).
- Mascaramento por CSS (`-webkit-text-security`, `color: transparent`) **não é recomendado**: o segredo continua no DOM e na árvore de acessibilidade; leitores de tela o leem; DevTools e extensões o veem.
- Recomendado: enquanto mascarada, a URL real **não fica no DOM**. Renderize um placeholder fixo com `aria-hidden="true"` + texto visualmente oculto "Link oculto". `Copiar link` lê do estado React. Ao revelar, renderize um `<input type="text">` somente leitura (`autocomplete="off"`, `spellcheck={false}`, `dir="ltr"`, sem `name`, sem `<form>` em volta) ou um bloco `<code>`. `aria-hidden` sozinho não protege: o texto continua em `textContent` e visível na transmissão.
- Live regions: só texto fixo do catálogo ("Link copiado.", mensagem de falha). Nunca a URL, nem em `aria-label`, `aria-describedby`, `title`, título do documento ou toasts. Mantenha os nós `status` e `alert` persistentes e vazios na montagem (mudança de role não é anunciada de forma confiável).

## 4. Testes com React 19 + jsdom e Playwright

- **VERIFICADO (local):** `node_modules/jsdom` 30.1.2 — `HTMLDialogElement-impl.js` é uma classe vazia: sem `showModal`, `close`, `requestClose`, `closedBy`, tratamento de `cancel`, top layer ou inert. O jsdom não tem `navigator.clipboard`.
- **VERIFICADO (local):** `tests/unit/next-queue-reward-settings-dialog.test.jsx` já faz stub de `showModal` (define `open`) e `close` (remove `open` e dispara `close`). Reutilize esse stub num helper de teste compartilhado. A comunidade confirma a abordagem de stub/polyfill (Porsche Design System, https://designsystem.porsche.com/v4/developing/vue/testing/; issue 3294 do jsdom).
- Testes unitários: o stub de `close` dispara `close` de forma **síncrona**, mas nos navegadores o evento é enfileirado; dispare `new Event('cancel', { cancelable: true })` e `{ cancelable: false }` para cobrir os dois ramos da spec; dispare `KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })`. Faça mock do clipboard com `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, configurable: true })`, nos casos de resolver e rejeitar. `getByRole('dialog')` precisa de `open` definido (o stub cuida disso). Isso não é evidência de navegador.
- Playwright (o projeto usa `playwright-core` ^1.64.1, scripts `tests/e2e/*-browser-only.mjs`): `context.grantPermissions(['clipboard-read','clipboard-write'], { origin })` e leitura via `page.evaluate(() => navigator.clipboard.readText())` — confiável no Chromium; Firefox/WebKit diferem (**PARCIAL**, https://qaskills.sh/blog/playwright-clipboard-read-write-permissions, https://lightrun.com/answers/microsoft-playwright-bug-copy-to-clipboard). Para negar, use um contexto sem a permissão ou sobrescreva `navigator.clipboard.writeText` para rejeitar via `addInitScript`.
- Casos de Escape no E2E: (a) abrir o diálogo e pressionar Escape **sem** nenhum clique (sem ativação) → continua aberto; (b) Escape, Escape rápido → continua aberto; (c) clicar dentro e pressionar Escape → `confirm-close`. Backdrop: `page.mouse.click(5, 5)` → continua aberto. `beforeunload`: `page.on('dialog')` com `type() === 'beforeunload'` (no Chromium exige um gesto prévio na página — **NÃO VERIFICADO**).
- Rode o E2E no Chromium (principal navegador de OBS/streamers) e, se disponível, no Firefox; WebKit é opcional (sem `closedby`).

## 5. Implementação recomendada (para o @dev)

1. `<dialog ref closedby="none" aria-labelledby aria-describedby>` + `showModal()` num effect; focar `Copiar link` imediatamente.
2. Proteções da seção 1.4 (keydown Escape, `cancel` com preventDefault, reabrir no `close` com a ref `closingByCode`). Sem handler no backdrop.
3. `copy()`: chamada síncrona a `navigator.clipboard?.writeText(url)` no handler de clique; se a API faltar ou rejeitar, mostrar o alerta de falha; sem `execCommand`.
4. Mascarado: URL fora do DOM; revelar renderiza um input de texto somente leitura; sem `type=password`, sem form.
5. Nós `role="status"` e `role="alert"` persistentes e vazios, com texto fixo.
6. Retorno de foco explícito após a lista atualizar; fechar o `alertdialog` de regenerar antes de abrir.
7. `beforeunload` só enquanto `copied === false`.

## 6. Estratégia de testes

- Unitário (jsdom, stub compartilhado): todas as regras do plano de UX + os dois ramos de `cancel` cancelável + keydown Escape + `close` sem código → reaberto + segredo ausente do DOM/atributos enquanto mascarado + nenhum vazamento em console/storage.
- E2E em navegador (Playwright, API/PostgreSQL descartáveis): casos da seção 4 no Chromium, mais Firefox se disponível; registrar as versões dos navegadores na story.
- TA manual: como no plano de UX. Se o conjunto de proteções falhar no E2E, use o fallback do plano (backdrop customizado + `inert`).
