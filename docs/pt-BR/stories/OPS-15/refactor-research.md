# OPS-15 — Pesquisa de refatoração: relocação de módulos (S-03) e limpeza de resíduos (S-12)

- Data: 2026-10-21 · Autor: @analyst (Atlas) · Branch: `feat/ops-15-next-panel` · Escopo: somente pesquisa (nenhum código editado)
- Entradas: `structural-review.md` (S-03, S-12, Resolution), grep no repositório em 2026-10-21, documentação oficial do Next.js.
- Rótulos de evidência: **VERIFICADO** (lido hoje no repositório ou na documentação oficial), **PARCIAL** (confirmado em parte), **NÃO VERIFICADO** (inferência; precisa ser comprovado por testes).

## 1. Resumo

1. Mover os 12 módulos para `apps/shared/panel/` com `git mv`, em um commit dedicado só ao rename. As importações são reescritas em um segundo commit.
2. **Não usar shims de reexportação.** O Fastify serve o painel vanilla a partir de `apps/web` e de um único prefixo extra, `/shared/browser/` (`apps/api/src/web-route.mjs`). Um shim em `apps/web` que reexporte `../shared/panel/x.mjs` faz o navegador pedir `/shared/panel/x.mjs`, que responde 404. O caminho que funciona tem duas partes:
   - atualizar `apps/web/app.js` e `overlay.js` para importar de `../shared/panel/`;
   - registrar um prefixo estático `/shared/panel/` em `web-route.mjs`. Ele é transitório e sai junto com a remoção do vanilla.

   Código lido: **VERIFICADO**. Comportamento em execução: **NÃO VERIFICADO**.
3. Catálogos: mover para `apps/shared/localization/catalogs/` em uma **etapa separada (C)**, depois de A. A mudança toca a API, o `validate:localization`, o fallback do Next e cerca de 40 referências em testes. Não é pré-requisito de A.
4. S-12, `/app.js` e `/styles.css`: removê-los enquanto o rewrite de `/` continua faz o `/` de produção virar um shell sem CSS e sem script. Na prática, isso já faz parte do cutover S-02. Exige autorização explícita do proprietário **junto com `/`**; caso contrário, deve ser adiado.
5. S-12, demais itens: o filtro morto `/connection/:path*` pode ser removido com segurança. O `/overlay.html` permanece.

## 2. Lista exata de módulos e importadores (VERIFICADO, grep de 2026-10-21)

| Módulo (`apps/web/…`) | Importadores Next (`apps/frontend`) | Outros importadores | Dependências internas |
|---|---|---|---|
| `queue-action-state.mjs` | `features/queues/queue-settings.mjs:1`, `queue-list.jsx:2`, `queue-lifecycle.mjs:2`, `queue-lifecycle-actions.jsx:4` | `app.js:13`, `tests/unit/queue-action-state.test.js` | nenhuma |
| `queue-confirmation-copy.mjs` | `queue-lifecycle-actions.jsx:6` | `app.js:17`, teste unitário | nenhuma |
| `queue-settings-version.mjs` | `queue-settings.mjs:2` | `app.js:18`, teste unitário | nenhuma |
| `queue-sync-status.mjs` | `queue-list.jsx:3` | `app.js:5`, teste unitário | nenhuma |
| `reward-link-dialog.mjs` | `queue-reward-resolution.mjs:1` | `app.js:15`, testes unitário e e2e | nenhuma |
| `call-deadline-presentation.mjs` | `queue-list.jsx`, via `features/queues/call-deadline.jsx:2` (**arquivo WIP não rastreado**) | `app.js:12`, `call-deadline-presentation.test.js`, `next-call-deadline.test.jsx` | nenhuma |
| `panel-navigation.mjs` | `features/panel-shell/panel-shell.jsx:8` | `app.js:6`, teste unitário | nenhuma |
| `setup-messages.mjs` | `features/connection/connection-page-content.jsx:6` | `app.js:3`, teste unitário | `../shared/browser/translate-catalog.mjs`, que passa a ser `../browser/translate-catalog.mjs` |
| `command-catalog-view.mjs` | `features/commands/command-permissions-page-content.jsx:6` | `app.js:7`, teste unitário | nenhuma |
| `overlay-widget-form.mjs` | `features/widgets/widgets-page-content.jsx:6` | `app.js:8`, teste unitário | nenhuma |
| `overlay-renderer.mjs` | `app/(overlay)/overlay/overlay-root.jsx:4` (`../../../../web/`) | `overlay.js:1`, `overlay-renderer.test.js`, `next-overlay-root.test.js` | nenhuma |
| `panel-catalog.mjs` (`PANEL_PLACEHOLDERS`) | `lib/i18n/panel-catalogs.mjs:2` | `app.js:20`, `panel-catalog-placeholders.test.js`, `next-panel-catalogs.test.js` | nenhuma |

São 15 linhas de importação no Next.

O que **permanece** em `apps/web` e só sai com a remoção do vanilla:

- os 9 módulos usados apenas pelo vanilla: `application-setup`, `call-notification-actions`, `dom-localization`, `health-status`, `locale-picker-state`, `panel-confirmation`, `panel-error-presentation`, `priority-labels`, `queue-onboarding-flow`;
- os arquivos de entrada e de apresentação: `app.js`, `overlay.js`, `*.html`, `*.css`.

## 3. Referências aos caminhos antigos (VERIFICADO)

- **Dockerfile:9-20**: 12 linhas `COPY apps/web/<módulo>`. A linha 21 copia `apps/web/localization/catalogs` e a 22 copia `apps/shared`. Depois de A, as 12 linhas saem, porque `COPY apps/shared` já cobre os módulos. A linha 21 (catálogos) fica até C.
- **`tests/unit/dockerfile-frontend-imports.test.js:30,73`**: aceita tanto `apps/web/` quanto `apps/shared/`, então continua passando. Depois da mudança, deve ser endurecido para falhar com qualquer importação de `apps/web/` vinda de `apps/frontend`.
- **Testes unitários que importam os 12 módulos**: cerca de 20 arquivos. São os da tabela acima, mais `next-queue-entry-actions.test.js` (5 referências), `reward-dialog-contract.test.js`, `next-panel-class1-parity.test.js`, `next-queue-settings-form.test.jsx` e `vanilla-fulfillment-feedback.test.js`. Todos precisam ter o caminho atualizado. Os testes de módulos exclusivos do vanilla não mudam.
- **`eslint.config.js:32`**: define globals de navegador apenas para `apps/web/**/*.js`. Os `.mjs` em `apps/shared/panel` não usam globals do DOM, exceto talvez o `overlay-renderer`. **PARCIAL**: falta confirmar se ele usa `document` e se `npm run lint` cobre `apps/shared`.
- **`tsconfig.web.json:7-8`** (`typecheck:web`): inclui `apps/web/**/*.mjs`. Depois da mudança, os módulos perdem a checagem de tipos, a menos que `apps/shared/panel/**/*.mjs` seja incluído. **Obrigatório.**
- **`package.json:47`** (`lint:web` = `eslint apps/web`): mesma perda de cobertura.
- **Catálogos (etapa C)**:
  - código e build: `apps/api/src/server.mjs:43`, `apps/infra/scripts/validate-localization.mjs:9`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4` e `Dockerfile:21`. O fallback do Next monta o caminho com `process.cwd()` + `apps/web/localization/catalogs` e lê os arquivos por `fs` em tempo de execução; eles não entram no bundle.
  - testes: `tests/integration/panel-localization-contract.test.js` (36 referências; parte delas aponta para `index.html`, `app.js` e `styles.css`, que permanecem), `localization-catalog-discovery.test.js` e `panel-catalog-placeholders.test.js:36`.
  - documentação: `USER_GUIDE-en_US.md` e a nota S-15 citam `apps/web/localization/catalogs/panel/en.tsv`.
  - sem mudança: `discover-catalog-module.mjs` recebe a raiz por parâmetro. O vanilla recebe os catálogos pelo estado da API (`state.localizationCatalogs`, `app.js:60,69`), então não depende do caminho. **VERIFICADO.**
- **Documentos da OPS-15**: `story.md` (21 referências), `structural-review.md` (16), `legacy-test-audit.md`, `queue-route-action-inventory.md`, `page-ux-review.md` e `flow-and-chat-review.md`. Atualizar só as seções vivas (File List, Change Log); os achados históricos ficam como estão.

## 4. Pesquisa externa

| Tema | Achado | Status |
|---|---|---|
| Raiz do Turbopack | A documentação diz que arquivos fora da raiz do projeto não são resolvidos ("Files outside of the project root are not resolved"). A raiz é detectada pelo `package-lock.json`, por isso `next build apps/frontend` usa a raiz do repositório e `../../../web/` funciona hoje. `apps/shared` está sob a mesma raiz, então não é preciso mudar `turbopack.root`. Definir `turbopack.root` explicitamente (raiz do repositório) é um reforço opcional. [Documentação do turbopack](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack), lastUpdated 2026-09-24 | VERIFICADO (docs); build **NÃO VERIFICADO** |
| `experimental.turbopackAdditionalRoots` (16.4.0) | Serve apenas para symlinks. A documentação diz que importações relativas que escapam de uma raiz não são suportadas ("Direct relative imports that escape a root are unsupported"). Não se aplica aqui. | VERIFICADO |
| `outputFileTracingRoot` | Só importa com `output: 'standalone'`. O projeto não usa standalone: a imagem de runtime copia `apps` inteiro (`COPY apps ./apps`). Não é necessário. [Documentação de output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), 2026-09-18 | VERIFICADO |
| `transpilePackages` | Vale para pacotes em `node_modules` ou workspaces. Como não haverá novo workspace (decisão do proprietário), não é necessário. [transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages) | PARCIAL (não consultado hoje) |
| Docker multi-stage | A camada `COPY apps/shared` precisa vir antes de `RUN npm run build:frontend`; isso já acontece (linha 21→22). Usar menos COPYs, e mais amplos, elimina o desvio de lista que causou o S-01. [Docker multi-stage](https://docs.docker.com/build/building/multi-stage/) | PARCIAL |
| `git mv` e histórico | O Git não armazena renames; ele os detecta por similaridade (padrão de 50%). Por isso, o commit da mudança deve ficar **sem edição de conteúdo**. Para seguir o histórico, use `git log --follow` e `git blame -C`. [git-log --follow / -M](https://git-scm.com/docs/git-log) | PARCIAL (comportamento conhecido; não consultado hoje) |
| Fronteira de importação | Regra nativa do ESLint `no-restricted-imports` com `patterns` (`group: ['**/web/*']`), aplicada em `apps/frontend/**` e `apps/shared/**`. Não exige nova dependência; o plugin `import` é dispensável. [no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | PARCIAL |

## 5. Ordem segura

**Pré-condição:** commitar ou fazer stash do WIP não rastreado (`call-deadline.jsx`), para que ele não fique preso no caminho antigo. Rodar todos os gates em uma base limpa antes de começar.

### A — S-03 (módulos)

1. **Commit A1 (somente rename):** `git mv apps/web/<12 módulos> apps/shared/panel/`, sem nenhuma edição de conteúdo.
2. **Commit A2 (caminhos):**
   - reescrever as 15 importações do Next (`../../../web/x.mjs` → `../../../shared/panel/x.mjs`; no overlay, `../../../../shared/panel/`);
   - em `setup-messages.mjs`, trocar para `../browser/translate-catalog.mjs`;
   - em `apps/web/app.js:3-20` e `overlay.js:1`, trocar para `../shared/panel/x.mjs`;
   - adicionar o prefixo estático `/shared/panel/` em `web-route.mjs` e `server.mjs:131`, com teste em `web-route.test.js`;
   - atualizar as importações dos cerca de 20 testes;
   - incluir `apps/shared/panel` em `tsconfig.web.json` e no `lint:web`;
   - remover as 12 linhas `COPY` do Dockerfile.
3. **Commit A3 (proteção):**
   - adicionar `no-restricted-imports` bloqueando `**/web/**` em `apps/frontend/**` e `apps/shared/**`;
   - endurecer `dockerfile-frontend-imports.test.js` para exigir zero importações de `apps/web` a partir de `apps/frontend`.
4. **Grep de verificação:** `grep -rnE "(\.\./)+web/|apps/web/" apps/frontend apps/shared` deve devolver apenas o fallback de catálogos (até a etapa C).

### B — S-12 (resíduos)

1. Remover o filtro `/connection/:path*` (`next-runtime-config.mjs:9`) e ajustar `next-dev-proxy.test.js:49`.
2. `/app.js` e `/styles.css` (`dev-proxy-config.mjs:48`): **bloqueado**.
   - Motivo: removê-los com o `/` mantido piora o `/` de produção, e há testes que fixam esse comportamento (`compose-runtime.test.js:391` exige `href="/styles.css"` em `/`; `next-dev-proxy.test.js:39,50`).
   - Recomendação: fazer junto com o `/`, no cutover S-02, quando autorizado.
   - [AUTO-DECISION] Remover agora só o filtro morto? → Sim. Motivo: não muda comportamento; o restante é cutover.
3. Opcional: trocar o redirect de `/callback` para `/connection?oauth=` (`queue-routes.mjs:315`), com teste.
4. Manter `/overlay.html`. Referências: `dev-proxy-config.mjs:29,51`, `dev-overlay-alias.mjs`, `next-runtime-config.test.js:37` e `compose-runtime.test.js:374`.
5. `tests/integration/next-static-export.test.js`: nome e conteúdo são resíduo de static export. Renomear ou fundir em `next-runtime-config.test.js`. Na mesma passada, revisar os itens que a Resolution do S-07 lista: `eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json` e `next-frontend-config.test.js`.

### C — catálogos (story ou commit separado)

1. `git mv apps/web/localization/catalogs apps/shared/localization/catalogs`, apenas como rename.
2. Atualizar:
   - `server.mjs:43`;
   - `validate-localization.mjs:9`;
   - `load-first-party-panel-fallback.mjs:4`;
   - `Dockerfile:21` (a linha fica redundante);
   - os 3 testes;
   - a documentação em en/pt-BR.
3. Rodar `npm run validate:localization`.

## 6. Riscos e rollback

| Risco | Mitigação |
|---|---|
| Vanilla servido pelo Fastify recebe 404 em `/shared/panel/*` | Prefixo estático + teste. Shims não resolvem (ver §1). |
| Perda de lint e typecheck dos módulos movidos | Incluir `apps/shared/panel` em `tsconfig.web.json` e no `lint:web` no commit A2 |
| WIP não rastreado ainda importando `../../../web/` | Pré-condição + proteção do commit A3 |
| Rename não detectado pelo Git por edições misturadas | A1 contém apenas `git mv` |
| Build passa localmente e falha no Docker | `docker build --target frontend-build` é obrigatório |
| Passo B2 do S-12 quebra o `/` de produção | Não executar sem autorização do S-02 |

**Rollback:** `git revert` de A3 → A2 → A1 (commits atômicos). Não há dados nem migrations envolvidos. A recuperação é feita com o digest de uma imagem anterior, não com `legacy` (decisão do proprietário).

## 7. Checklist de verificação

- [ ] `npm run lint`, `npm run typecheck` (incluindo `typecheck:web`) e `npm test`
- [ ] `npm run validate:localization`, `validate:version`, `validate:port-denylist` e `review:static`
- [ ] `npm run build:frontend` (o Turbopack resolve `apps/shared/panel`)
- [ ] `docker build --target frontend-build .` e build completo (estágio de runtime)
- [ ] Testes de contrato:
  - [ ] `tests/unit/dockerfile-frontend-imports.test.js`
  - [ ] `next-dev-proxy.test.js`
  - [ ] `next-runtime-config.test.js`
  - [ ] `web-route.test.js` (novo prefixo `/shared/panel/`)
  - [ ] `windows-native-contract.test.js` (não tem referências hoje; rodar como regressão)
- [ ] `tests/integration/compose-runtime.test.js` (rotas `/overlay.html` e `/`) em um projeto Compose isolado
- [ ] Navegador:
  - [ ] Next: `/overlay`, `/queues` e `/connection` funcionando
  - [ ] vanilla: `/` no Fastify (dev) sem 404 na aba Network
- [ ] Grep final por `apps/web/` e `../web/` em `apps/frontend`, `apps/shared` e no `Dockerfile`
- [ ] File List e Change Log da story atualizados (en/pt-BR)

## 8. Limitações

- Nenhum comando de build, teste ou Docker foi executado.
- Os links de `transpilePackages`, Docker, git e ESLint não foram consultados hoje. O comportamento deles é bem documentado, mas precisa ser confirmado pelos gates acima.
