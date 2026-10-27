# OPS-24 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-24/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-10-27 — **Modo:** YOLO (autônomo; decisões marcadas `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #91 (mãe); fatias FT-30..FT-35 just-in-time.
**Fontes conferidas:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [typescript-migration-research.md](../OPS-15/typescript-migration-research.md), [backend-migration-study.md](../../process/backend-migration-study.md), `docs/pt-BR/process/backlog-inventory.md` (FT-30..FT-35, passo 16 da sequência).

## Veredito

**GO — 9,0/10.** Status: **Ready** (GO + issue #91). **Gate de UX confirmado como não aplicável** (preserva comportamento, sem texto visível; qualquer mudança visível vai para story própria, como a story já diz).

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | Backend em TypeScript + ESLint → Biome. |
| 2 | Descrição completa | 1,0 | Classe de defeito ligada a `strict: false`; três superfícies de configuração que ignoram `.ts` nomeadas. |
| 3 | CAs testáveis | 1,0 | 27 CAs; cada gate provado por violação plantada (tsc, Vitest, Biome, OpenGrep). |
| 4 | Escopo dentro/fora | 1,0 | Seis fatias; fora: outra linguagem, bundler/`dist`, TS no frontend/shared, troca do gerador do Prisma, mudança de comportamento. |
| 5 | Dependências | 0,5 | A ordem por arquivo em relação à OPS-22 é precisa. Desconto: "a OPS-23 vem depois da tipagem" não diz **quais** fatias TS; lido ao pé da letra, toda a OPS-24 (5 a 7,5 pessoa-semanas) precederia a OPS-23, que é dependência do cutover — contrariando a decisão 3 do proprietário ("não pode congelar o cutover"). |
| 6 | Complexidade | 1,0 | 19 → COMPLEX/GG; esforço por fatia marcado como NÃO VERIFICADO. |
| 7 | Valor de negócio | 1,0 | Transforma a classe de bug do D-5 em erro de compilação. |
| 8 | Riscos | 1,0 | Dez riscos da nota, cada um com mitigação. |
| 9 | Definição de pronto | 1,0 | Provas por violação plantada, ESLint removido, docs en/pt-BR, parte de CI ligada à OW-13. |
| 10 | Alinhamento com fontes/decisões do proprietário | 0,5 | Rota A, Biome, sem typescript-eslint, mudança da regra do `AGENTS.md` já decidida. Desconto: `format:check` e momento do commit de formatação ainda em aberto (abaixo). |

## Correção exigida (antes do início da OPS-23 / FT-27)

1. **Declarar quais fatias TS precedem a OPS-23.** `[AUTO-DECISION]` Recomendação → **a OPS-23 espera apenas a TS-0 (FT-30) e a TS-2 (FT-32, porque a FT-27 faz os workers da outbox emitirem notificações); a TS-3 (FT-33) e a FT-27 são ordenadas pelo `@architect` em `http/*`; a TS-1 roda após a FT-24 de forma independente; TS-4 e TS-5 nunca bloqueiam a OPS-23 nem o cutover.** (Motivo: respeita "tipagem antes do SSE" nos arquivos que o SSE toca, sem deixar 5 a 7,5 pessoa-semanas segurarem uma dependência do cutover.) O `@sm` escreve isso em "Dependências" (en e pt-BR) e no passo 16 da sequência do inventário; **o proprietário confirma (OD-24-3)**.

## Ponto 5 do `@sm` — `format:check` e o commit de formatação

1. **`format:check` nos gates.** `[AUTO-DECISION]` Recomendação → **nenhum nome de gate novo.** Na TS-0 os scripts existentes `lint`/`lint:*` rodam `biome lint` (só lint). Depois que o commit de formatação entrar, os mesmos scripts passam a `biome check` (lint + formatação + ordem de imports) com avisos como erro. A lista de gates do `AGENTS.md`/`CLAUDE.md` e o workflow de CI não mudam, e a formatação passa a ser exigida a partir daí. (Motivo: o CA 3 já exige nomes de script inalterados; um gate, sem retrabalho de documentação; a exigência não pode começar antes de a árvore estar formatada.) O `@architect` confirma na TS-0; **decisão do proprietário OD-24-1**. Se o proprietário preferir um `format:check` explícito, o `@architect` o acrescenta à lista de gates do `AGENTS.md`, do `CLAUDE.md` e da CI na mesma fatia.
2. **Quando agendar o commit de formatação.** O formatador reescreve `apps/api` (branches da OPS-22, FT-24..FT-26) **e** `apps/frontend` (FT-01, FT-28). `[AUTO-DECISION]` Recomendação → **a TS-0 entrega o Biome só como linter; o commit exclusivamente de formatação roda na primeira janela sem branch aberta em `apps/`, mirando depois da integração de FT-26 e FT-01/FT-28 e antes do congelamento do cutover, com o hash em `.git-blame-ignore-revs`. Se essa janela não existir antes do cutover, o formatador espera para depois do cutover** (fallback da nota, Q8). **Decisão do proprietário OD-24-2.** O commit continua com o `@devops` após o veredito do `@qa`.

## Prontidão das fatias

| Fatia | Pode ir ao `@dev` agora? | Gates restantes |
|---|---|---|
| FT-30 (TS-0 ferramentas) | AINDA NÃO — próxima da fila | `@architect` (layout de tsconfig/strict, mapeamento do Biome, relato das regras nursery, texto do `AGENTS.md`), plano de teste do `@qa` e método de violação plantada, issue. Pode rodar em paralelo à FT-24 só porque os write sets não se sobrepõem (configuração, docs e um arquivo canário fora do adaptador e da reconciliação de `twitch/*`). |
| FT-31 (TS-1 `twitch/*`) | NÃO | FT-30 e FT-24 integradas. |
| FT-32 (TS-2 `outbox/*`) | NÃO | FT-30, FT-25, FT-26 integradas. |
| FT-33..FT-35 | NÃO | Conforme "Dependências"; confirmação do `@data-engineer` para a FT-34. |

## Decisões do proprietário pendentes (situação conferida em 2026-10-27)

- **OD-24-1 — PENDENTE:** formatação exigida pelo `lint` (`biome check`) após o commit de formatação (recomendado) vs gate `format:check` separado.
- **OD-24-2 — PENDENTE:** janela do commit de formatação (recomendada acima) e o fallback "formatador após o cutover". Nota: o cutover antecipado parte por parte autorizado pelo proprietário (2026-10-27) torna menos provável "uma janela sem branch aberta em `apps/` antes do congelamento do cutover"; o fallback "formatador após o cutover" passa a ser o caminho provável.
- **OD-24-3 — PENDENTE:** a OPS-23 espera apenas TS-0 e TS-2 (recomendado). A correção exigida 1 já foi escrita em "Dependências" da story pelo `@sm`, mas não há confirmação explícita do proprietário registrada; as decisões do proprietário de 2026-10-27 (SSE pela OPS-23, cutover antecipado parte por parte, sequência "FT-25/FT-26, depois OPS-24, depois OPS-23" no handoff) são **coerentes** com ela e não a contradizem. Bloqueia apenas o início da FT-27.
- **OW-13 — PENDENTE:** autorização de push para a evidência de CI do CA 9.

Verificação de contagens: este arquivo não contém contagem do backlog nem do quadro; nada desatualizado a corrigir. Nota e status sem mudança (GO 9,0/10, Ready).

## Status final

Rascunho → **Ready (Pronta)** (GO 9,0/10, issue #91). Registrado no Change Log da story (en e pt-BR).
