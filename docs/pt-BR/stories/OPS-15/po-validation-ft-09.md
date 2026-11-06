# FT-09 — decisão do `@po`: as FT-01..FT-08 bloqueiam a revisão final?

[English](../../../stories/OPS-15/po-validation-ft-09.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-06 — **Modo:** YOLO. **Critério (orquestrador):** a FT-09 pontua a migração completa e lista as verificações não executadas; fatias de polimento ou testes opcionais não bloqueiam (viram lacunas conhecidas do escopo da revisão); fatias de paridade necessária bloqueiam.
**Evidência lida:** linhas FT-01..FT-10 do inventário; [plano de cutover](cutover-plan.md) (seção 3 e ondas). O plano não tem seção "pré-condições da revisão final"; o único gate que ele enuncia para a revisão final é o da linha da FT-09.

## Decisão

**Só a FT-06 (rastreabilidade rota/ação e reconciliação da matriz de paridade) bloqueia a FT-09. FT-01..FT-05, FT-07, FT-08 e TS-10 deixam de bloquear.** A coluna "Blocked by" da FT-09 foi atualizada (inventário e desenho do quadro, en e pt-BR). Não restou dúvida real, então não há pop-up ao proprietário.

| Item | Natureza | Decisão | Motivo |
|---|---|---|---|
| FT-01 | Polimento de páginas rumo a 10/10 (notas de UX 6,0 a 8,0) | Não bloqueia | Polimento. A revisão pontua a migração como está; páginas abaixo de 10/10 e planos de UX pendentes entram como lacunas conhecidas. |
| FT-02 | Validação de placeholders (CH-2) na criação da fila | Não bloqueia | Defeito que já existia na API do painel legado, não regressão da migração; pequeno e test-first. A revisão o registra como achado se ainda aberto. |
| FT-03 | Oito cenários E2E | Não bloqueia | Testes opcionais; unida à FT-06; a revisão lista os cenários não executados. |
| FT-04 | Resíduo do export estático | Atendida | Coberta pelas ondas FT-37 e FT-39 (feitas). |
| FT-05 | Mover catálogos | Atendida | Executada pela FT-40 (onda 2, mergeada no PR #101). |
| FT-06 | Inventário de endpoints para rastreabilidade rota/ação, reconciliação da matriz | **Bloqueia (parte de rastreabilidade)** | Paridade necessária: a revisão não pontua "a migração completa" sem a matriz contra a qual cada rota e ação é conferida. A dependência da FT-01 vale só para os cenários E2E vindos da FT-03, não para a rastreabilidade (linha da FT-06 ajustada). |
| FT-07 | Prova em runtime do catálogo da comunidade | Não bloqueia | Unida à FT-40; a revisão confirma a execução de compose de 2026-10-20 e lista o que restar. |
| FT-08 | Achados QRA-13 / QRA-02 | Não bloqueia | Subsumida: a FT-09 repete a auditoria de testes legados, que os reverifica; unida à FT-02. |
| TS-10 | Portar contratos de classe B | Atendida | Unida à FT-42 e feita pela onda 4 (mergeada). |

## Consequências

- A FT-09 continua Pronta; pode ser agendada quando a rastreabilidade da FT-06 estiver fechada.
- O relatório da revisão deve listar como "lacunas conhecidas do escopo" os itens abertos de FT-01, FT-02, FT-03 e FT-07 (e qualquer verificação não executada: builds do AC 10, axe, renderização es/pt-BR).
- Risco aceito: páginas ainda abaixo de 10/10 são pontuadas como estão; uma mudança de UX posterior reabre só a página afetada.
