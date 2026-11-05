# TS-10 — nota da onda (porte dos contratos classe B para o painel Next)

[English](../../../stories/OPS-15/ts-10-wave-note.md)

**Fatia:** TS-10 da [OPS-15](story.md), onda 4 do cutover (primeira metade). **Autor:** `@dev` (Dex), 05/11/2026. **Validação:** [po-validation-ft-42-ft-43.md](po-validation-ft-42-ft-43.md) (GO 9,0). **Nenhum arquivo vanilla foi editado ou removido** (CA-TS10-8).

## 1. Mapa dos portes, Red/Green e evidência (CA-TS10-1 a 6)

| CA | Origem (vanilla, ainda presente até a FT-42) | Novo teste Next | Primeira execução | Evidência |
|---|---|---|---|---|
| TS10-1 | `panel-confirmation-contract` "fails closed" | `tests/unit/next-confirmation-contract.test.jsx` (4 casos) | Green (caracterização) | Mutações M1-M3 abaixo |
| TS10-2 | `panel-confirmation-contract` "two separate confirmations" | mesmo arquivo (4 casos; desafio, final, cancelar em cada etapa, desafio recusado) | Green | M2 (pular a etapa final) o derrubou |
| TS10-3 | `reward-dialog-contract` "responsive space" | `tests/e2e/fixtures/dialog-layout.mjs` usado por `queue-reward-settings-recovery-browser-only.mjs` e `queue-reward-resolution-browser-only.mjs` (390x844 e 768x900) | **Red**: ações a 9 px, avisos com 13 px | Defeito D3 corrigido no CSS, depois Green; 4 mutantes mortos |
| TS10-3 (fechar) | `reward-dialog-contract` "explicit close button" | mesmo auxiliar (`type="button"` no controle de fechar) | Green | mutante `type="submit"` morto |
| TS10-4 | `health-status` linhas 26 e 42 | `tests/unit/next-health-contract.test.jsx` (3 casos, catálogo pt-BR real) | Green | 3 mutantes mortos |
| TS10-5 | `web-application-setup` (2 casos) | `tests/unit/next-connection-safe-error.test.jsx` (3 casos) | Green | 3 mutantes mortos |
| TS10-6 | `locale-picker-state` (3 casos) | `tests/unit/next-locale-fallback-contract.test.jsx` (3 casos) | **Red** (2 de 3): o fallback mostrava `en`; o idioma escolhido voltava durante o salvamento | Defeito D1 corrigido, depois Green; 3 mutantes mortos |
| TS10-7 | `panel-localization-contract` | reescrito no lugar + `tests/e2e/panel-layout-browser-only.mjs` | Caso "todas as chaves" **Red**: faltava `panel.command.reload` | Defeito D2 corrigido, depois Green; 6 mutantes mortos |
| extra | casos só de catálogo de `panel-confirmation-contract` | `tests/unit/panel-confirmation-copy.test.js` (4 casos, inclui "sem `confirm(` em `apps/frontend`") | Green | 3 mutantes mortos |

Casos de `panel-confirmation-contract` não portados, com motivo (R5): "ocultar/arquivar removido dos controles" e "contagem de `await confirmPanelAction` = 12" leem só o `app.js` (marcação vanilla); os três casos de `requestPanelConfirmation` (resolver true/false, armadilha de foco) testam um auxiliar vanilla, e o painel Next usa o modal nativo `<dialog>`, cujo foco é do navegador (o diálogo Next mantém Voltar/Cancelar focáveis, coberto por `next-queue-lifecycle-actions.test.jsx`); "diálogo acessível no app" lia o `index.html` (o diálogo Next tem `aria-labelledby`/`aria-describedby`, coberto pelo mesmo arquivo).

## 2. Defeitos do Next achados pelos portes (CA-TS10-9)

| ID | Defeito | Menor correção | Precisa de nota de UX? |
|---|---|---|---|
| D1 | Um idioma persistido sem catálogo deixava o seletor na primeira opção (`en`) em vez de pt-BR; o idioma escolhido voltava ao antigo durante o salvamento | `apps/frontend/components/ui/language-picker.jsx`: o valor cai para pt-BR (depois a primeira opção); a escolha da pessoa aparece enquanto salva | Sim, só comportamento (sem mudar a marcação) |
| D2 | `panel.command.reload` é renderizada pela página de comandos, mas faltava nos três catálogos (a chave crua apareceria num conflito) | chave adicionada em `en.tsv`, `es.tsv`, `pt-BR.tsv` | Só texto: "Reload permissions" / "Recarregar permissões" / "Recargar permisos" |
| D3 | Diálogos de configurar/resolver recompensa: ações a 9 px, texto de aviso com 13 px (o contrato vanilla exigia 12 px e 14 px) | `apps/frontend/styles/panel.css`: `gap: 12px` nas ações e `font-size: 14px` em `.connection-notice`/`.hint`, restritos a `.reward-resolution-dialog` | Sim, CSS visível (espaço +3 px, texto +1 px, só nos dois diálogos) |

Os três são pequenos e ficaram dentro da fatia. Precisam da nota curta do `@ux-design-expert` antes do gate (CA-TS10-9).

## 3. Triagem de `panel-localization-contract.test.js` (22 casos, CA-TS10-7)

| # | Caso vanilla | Decisão | Onde fica |
|---|---|---|---|
| 1 | valores de runtime fora dos alvos estáticos | removido: marcação do `index.html` | O React renderiza os valores; não existe `data-i18n` |
| 2 | um só editor de idioma em Configurações | removido: marcação do `index.html` | `next-locale-picker.test.jsx`, `next-locale-fallback-contract.test.jsx` |
| 3 | credenciais antes de conectar | removido: marcação do `index.html` | `next-connection-page.test.jsx` "blocks authorization until credentials are saved" |
| 4 | orientação de estado vazio | portado | arquivo reescrito, caso 1 (catálogos + fontes Next) |
| 5 | política de comandos empilhada no celular | portado para o navegador | `panel-layout-browser-only.mjs` (390 e 320 px) |
| 6 | comandos agrupados por acesso | portado | arquivo reescrito, caso 2 |
| 7 | anel de foco do teclado | portado para o navegador | `panel-layout-browser-only.mjs` (2 px, contraste 3:1) |
| 8 | seleção nativa de plural | portado | arquivo reescrito, caso 3 |
| 9 | toda frase estática marcada | removido: varre o `index.html` | caso 12 e `npm run validate:localization` |
| 10, 11, 12 | textos de fila, widget, formulário e conexão com `data-i18n` | removidos: atributos `data-i18n` | o caso 12 confere toda chave `t()` usada em `apps/frontend`; chaves escolhidas ficam nos casos 4 e 7 |
| 13 | texto de fila/entrada vindo do catálogo | portado (parte do catálogo) | arquivo reescrito, caso 4 |
| 14 | recompensa sem candidatas | mantido | caso 5 |
| 15 | rótulos dos widgets OBS | mantido (só a linha `data-page-target` saiu) | caso 6 |
| 16 | `data-i18n` do seletor de widget | removido | caso 12 |
| 17 | demais textos do painel | portado (parte do catálogo); as checagens de id do `index.html` saíram | caso 7 |
| 18 | IDs de comando para descrições | portado | caso 8 |
| 19 | operações nunca expõem `lastError` | portado para os arquivos Next de operações | caso 9 |
| 20 | confirmações do fluxo | mantido (a linha `aria-live` do `index.html` saiu) | caso 10 |
| 21 | formulário capturado antes do `await` | portado para `new-queue-form.jsx` | caso 11 |
| 22 | cobertura de chaves first-party | reapontado para todas as fontes de `apps/frontend` | caso 12 (achou D2) |

(As linhas 10-12 agrupam três casos.) Cópia do arquivo vanilla: `.local/ts10/panel-localization-contract.vanilla.js` (não versionada).

## 4. Mutações (CA-TS10-10)

Cada mutação foi aplicada a um arquivo com cópia de segurança, o teste rodou, o arquivo foi restaurado e o `cmp` confirmou. Registro completo: `.local/ts10/mutations.txt`.

- Confirmação: `ask` executa a ação na hora (8 mortos); pular a etapa final (2); `onClose` aceita (1).
- Saúde: ping `null` mostrado como `0 ms` (2); `retrying` fora da lista permitida (1); `retrying` marcado como não funcional (1).
- Erro seguro: mensagem crua como chave (2); segredo não limpo (1); ramo de rejeição de credencial removido (1).
- Idioma: fallback para a primeira opção (1); escolha da pessoa ignorada (1); idioma persistido ignorado (1).
- Contrato de localização: `event.currentTarget.reset()` (1); `lastError` no modelo de operações (1); chave removida do catálogo (11).
- Layout dos diálogos (navegador): espaço de 11 px; aviso com 13 px; diálogo com 900 px; controle de fechar `type="submit"`.
- Layout (navegador): regra de empilhamento removida (`2,2,2,2` a 390 px); anel de foco com 1 px; cor do anel igual à superfície (contraste 1,01).
- Texto de confirmação: `confirm(` no diálogo; palavra "Archive" num catálogo; lista só-título alterada (1 cada).

## 5. Limites para o `@qa` e o `@ux-design-expert`

- O `axe-core` não é dependência do projeto e o CA-TS10-8 proíbe novas: nenhuma varredura axe automatizada rodou. As checagens de navegador usam estilos calculados, geometria e contraste; tecnologia assistiva continua na OW-06.
- As checagens de navegador rodaram no Chromium (canal `chrome`) com fixtures da API de mesma origem no servidor de desenvolvimento do Next. Não são execução em pilha real.
- Novo script `npm run test:e2e:panel-layout:browser-only` (16º script browser-only).
