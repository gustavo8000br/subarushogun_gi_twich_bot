# Levantamento de melhorias e endurecimentos — 2026-11-04

[English](../../process/improvement-ideas-2026-11-04.md)

Origem: pedido do dono em 2026-11-04 ("traga 10 coisas que podem receber uma melhoria ou um endurecimento, de 0 a 10, quero que alcance 9,5"). As notas "hoje" são **estimativas do Orion** baseadas em achados concretos (gates do `@qa`, CI, pareceres); não são medição. Este arquivo é a ENTRADA do `@sm`, que o transforma em stories e ações; o `@devops` registra cards e issues (com as seções `## Decisões do dono` e `## Gates` do modelo `docs/process/issue-body-template.md`).

| # | Ideia | Evidência | Nota hoje | Para chegar a 9,5 | Esforço | Situação |
|---|---|---|---|---|---|---|
| 1 | E2E de navegador no CI | Nenhum workflow roda os 12 scripts `*-browser-only`; o `queue-lifecycle` ficou quebrado 4 de 4 sem alerta | 4,0 | Job de CI com os 12 scripts (Next HTTPS e Chrome, ~10 s cada); script instável é investigado, nunca repetido até passar | M | Planejado: TS-17 |
| 2 | Timeout nas leituras do painel | `lib/api/client.mjs:27` faz `fetch` sem timeout; API que aceita a conexão e não responde prende o painel em "Carregando idiomas…" | 5,0 | `AbortSignal.timeout` só nas leituras; mutações mantêm o caminho de resultado incerto; estado de erro com recuperação; teste com API travada | P | Planejado: FT-44 (OPS-23) |
| 3 | Tipagem do painel e do backend | 59 erros de tipo no JSX fora do gate; backend em JavaScript com JSDoc | 5,0 | JSX tipado e de volta ao `typecheck:web`; conversão estrita por área; `strict: true` global | G | Planejado: TS-16 e OPS-24 |
| 4 | Varredura estática | O OpenGrep tem só duas regras (HTML inseguro e credencial em log) | 4,0 | Regras para SQL cru, `eval`/`Function`, SSRF, segredo em código, `dangerouslySetInnerHTML`, cabeçalhos e cookies, cada uma com teste da regra | M | NOVO |
| 5 | Guarda contra vazamento de dados sensíveis | A URL da sessão chegou a 45 commits em repositório público; a proteção é só texto no `AGENTS.md` | 5,0 | Verificação automática em hook local e no CI que reprova `claude.ai/`, tokens e `Claude-Session:` em commits, arquivos e corpos de PR, com teste da própria verificação | P | NOVO |
| 6 | Contrato da API do painel | OPS-21: idempotência, recuperação de sessão e códigos de erro em 7 fatias | 5,5 | Máquina de estados de idempotência no servidor; chaves por intenção no cliente; `error` legado removido; rotas promovidas a `reexecutable` | G | Planejado: OPS-21 |
| 7 | Atualização ao vivo | Polling de 1 s no overlay; o painel só atualiza ao recarregar | 5,5 | SSE autenticado com heartbeat de 15 s, invalidação por evento, polling como fallback (p95 <= 2 s) | G | Planejado: OPS-23 |
| 8 | Validação fora do Ubuntu | Windows, macOS, OBS nativo e Twitch ao vivo sem nenhum resultado | 3,0 | Matriz nativa do overlay no OBS, instalador no Windows, um Mac, bateria real na Twitch com o canal de teste | G | Parcial: A-02, D-05, OW-16 (depende do dono) |
| 9 | Acessibilidade provada | Nota de UX 9,1 por revisão estática; acessibilidade 8,8; nenhum leitor de tela usado | 6,0 | Leitor de tela (NVDA ou VoiceOver), contraste e 320 px medidos, foco após navegar, teste automatizado com axe nos fluxos principais | M | Parcial: A-05 (depende do dono) |
| 10 | Instalação limpa | O bug de `create_host_path` só apareceu num runner novo, porque tudo rodava com a pasta já criada | 6,0 | Job de CI com clone limpo e primeiro uso (instalar, subir, abrir, atualizar) em Linux, macOS e Windows, sem nenhuma pasta preexistente | M | NOVO |

## Leitura
- **Mais barato e de maior retorno:** #5 (P) e #2 (P). **Teto realista só com agentes:** #8 e #9 chegam a ~7,0, o resto depende de validação humana e de máquina do dono; nenhum resultado nativo é afirmado sem evidência.
- **Novos (sem card nem story):** #4, #5 e #10. Planejados (já têm card): #1, #2, #3, #6, #7.
- **Decisão do Orion:** registrar #4, #5 e #10 em Backlog; começar por #5 depois do pacote OPS-22.

## Registro (2026-11-04, `@sm`)
- As ideias nº 4, nº 5 e nº 10 viraram as stories em Draft [OPS-28](../stories/OPS-28/story.md) (ST-21), [OPS-27](../stories/OPS-27/story.md) (ST-20) e [OPS-29](../stories/OPS-29/story.md) (ST-22); a ideia nº 1 (TS-17) virou a [OPS-30](../stories/OPS-30/story.md) (ST-23). Fatias FT-45..FT-52. As ideias nº 2, nº 3, nº 6 e nº 7 mantêm o escopo e só ganharam uma seção "Meta 9,5" na OPS-23, na OPS-24 e na OPS-21. As ideias nº 8 e nº 9 ficam com as ações do proprietário.
- A régua objetiva de 9,5, os critérios de saída, as ações numeradas (AÇ-00..AÇ-47) e a ordem (nº 5, nº 2, nº 1, nº 10, nº 4, nº 6, nº 7, nº 3) estão em [improvement-actions-2026-11-04.md](improvement-actions-2026-11-04.md). Os corpos de issue prontos estão em [improvement-issue-bodies-2026-11-04.md](improvement-issue-bodies-2026-11-04.md).
- Correção achada no registro: o levantamento diz 12 scripts de navegador; existem 13 arquivos `*-browser-only` em `tests/e2e/` em 2026-11-04.
