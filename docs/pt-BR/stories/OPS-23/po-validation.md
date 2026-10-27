# OPS-23 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-23/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-10-27 — **Modo:** YOLO (autônomo; decisões marcadas `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #81 (mãe); fatias FT-27..FT-29 just-in-time.
**Fontes conferidas:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [sse-research.md](../OPS-15/sse-research.md), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) seções 1, 3, 6-7, [story da OPS-15](../OPS-15/story.md) linhas 44 e 105, `docs/pt-BR/process/backlog-inventory.md`.

## Veredito

**GO — 9,0/10.** Status: **Ready** (GO + issue #81). Nenhuma fatia vai ao `@dev` ainda: o desenho do `@architect` e o plano do `@ux-design-expert` (≥ 9,0) estão em aberto, e a ordem do proprietário põe tipagem e OPS-22 primeiro.

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | SSE + estado compartilhado. |
| 2 | Descrição completa | 1,0 | D-7 com causas VERIFICADAS (paridade de 5 s perdida, provider por página, sem canal push). |
| 3 | CAs testáveis | 0,5 | 19 CAs Dado/Quando/Então com classes de evidência. Desconto: metas de latência e a janela de fallback de 2 s ("cerca de 60 s") ainda serão fixadas por `@architect`/`@qa`; o CA 19 depende de um plano de UX ainda não escrito. Aceitável no nível da story; precisa fechar antes da FT-29. |
| 4 | Escopo dentro/fora | 1,0 | Três fatias; fora: mensagens da FT-23, WebSocket, SWR/TanStack, polling do overlay. |
| 5 | Dependências | 1,0 | Nota de SSE (feita), desenho do arquiteto, UX ≥ 9,0, conflito de write set com FT-01 e fatia 3 da OPS-21. |
| 6 | Complexidade | 1,0 | 18 → COMPLEX/GG com tamanhos por fatia. |
| 7 | Valor de negócio | 1,0 | Remove a regressão de paridade mais visível; dependência do cutover. |
| 8 | Riscos | 1,0 | Buffer do proxy, limite de 6 conexões, eventos entre processos, perda de rascunho, laços de reconexão, texto da OPS-15. |
| 9 | Definição de pronto | 1,0 | Evidência real de navegador e Compose exigida; texto da OPS-15 reconciliado. |
| 10 | Alinhamento com fontes/decisões do proprietário | 0,5 | Bate com "SSE agora, polling de 5 s / 2 s só como fallback" (o proprietário prevalece sobre os 15-30 s da nota). Desconto: o CA 7 da OPS-15 ainda diz "sem WebSocket no painel" e "cadência de polling existente" — reconciliação pendente de aprovação do proprietário (abaixo). |

## Ponto 1 do `@sm` — reconciliar o CA 7 da OPS-15 com a OPS-23

A OPS-15 **não** é editada por esta validação. Texto exato proposto, a ser aplicado pelo `@po` na OPS-15 (en e pt-BR, com linha no Change Log) **depois que o proprietário aprovar**:

- **OPS-15 linha 44 (en), substituir por:** "The existing bounded polling behavior and its focus/context handling remain in effect until OPS-23 delivers the panel event stream. Real-time panel updates use Server-Sent Events (SSE), delivered by OPS-23 (owner decision 2026-10-27), with the 5 s / 2 s polling kept only as the fallback when the stream is unavailable. This story does not introduce a panel WebSocket."
- **OPS-15 linha 44 (pt-BR), substituir por:** "O polling limitado existente e o comportamento de preservação de foco/contexto continuam até a OPS-23 entregar o fluxo de eventos do painel. As atualizações em tempo real do painel usam Server-Sent Events (SSE), entregues pela OPS-23 (decisão do proprietário de 2026-10-27), e o polling de 5 s / 2 s fica apenas como fallback quando o fluxo estiver indisponível. Esta story não introduz WebSocket para o painel."
- **CA 7 da OPS-15, linha 105 (en), trocar o início "Existing polling cadence/semantics," por:** "Existing refresh semantics (the 5 s / 2 s polling cadence remains as the fallback of the OPS-23 SSE channel, which a cutover dependency delivers),"
- **CA 7 da OPS-15, linha 105 (pt-BR), trocar "Polling e semântica atuais," por:** "Semântica atual de atualização (a cadência de polling de 5 s / 2 s permanece como fallback do canal SSE da OPS-23, entregue como dependência do cutover),"

Situação: **decisão do proprietário pendente (OD-23-1)**. Até lá, OPS-15 e OPS-23 só são coerentes lendo SSE como "não é WebSocket"; a DoD da OPS-23 mantém a reconciliação como condição de fechamento.

## Outras decisões

1. `[AUTO-DECISION]` CA 2 "notificações são sinais de invalidação (tópico + versão, sem corpo)" → **aceito como entrada de desenho** (motivo: uma única fonte sanitizada para DTOs e regras de privacidade; o `@architect` confirma no desenho).
2. `[AUTO-DECISION]` Ordem em relação à OPS-24 → a OPS-23 começa depois das fatias de TypeScript que compartilham seu write set, não depois de toda a OPS-24 (ver a validação da OPS-24, correção exigida 1); do contrário o cutover esperaria 5 a 7,5 pessoa-semanas de tipagem, contrariando a decisão 3 da OPS-24.
3. A FT-28 (provider compartilhado) compartilha arquivos com a FT-01: o `@architect` define a ordem; nunca dois `@dev` nos mesmos arquivos.

## Prontidão das fatias

| Fatia | Pode ir ao `@dev` agora? | Gates restantes |
|---|---|---|
| FT-27 (backend SSE, CAs 1-7) | NÃO | Desenho do `@architect` (modelo de eventos, caminho entre processos, limite, heartbeat), ordem vs TS-2/TS-3; `@data-engineer` só se houver mecanismo no banco; issue. |
| FT-28 (estado compartilhado, CAs 8-11) | NÃO | Ordem do `@architect` vs FT-01; plano de UX ≥ 9,0; issue. |
| FT-29 (atualização ao vivo no cliente, CAs 12-19) | NÃO | FT-27, FT-28; metas de latência e janela de fallback fixadas; plano de UX ≥ 9,0; issue. |

## Correções exigidas

1. (Antes da FT-29) `@architect`/`@qa` fixam a meta de latência e a janela de fallback de 2 s do CA 14 (texto da story pelo `@sm`/`@po`).
2. (Antes de fechar) Texto da OPS-15 reconciliado após a OD-23-1.
3. (Registro) O `@sm` marca as caixas de GO do `@po` e de issue; inventário/quadro mostram #81.

## Decisões do proprietário pendentes

- **OD-23-1:** aprovar o texto da OPS-15 acima (recomendado).

## Status final

Rascunho → **Ready (Pronta)** (GO 9,0/10, issue #81). Registrado no Change Log da story (en e pt-BR).
