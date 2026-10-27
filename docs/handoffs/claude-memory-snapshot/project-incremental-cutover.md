---
name: project-incremental-cutover
description: Owner EXPRESSLY authorized (2026-10-27) the early, incremental cutover of already-validated panel parts and of the rest as each part gets validated; legacy/vanilla is to be abandoned
metadata:
  type: project
---

On 2026-10-27 the owner said: "Eu autorizo EXPRESSAMENTE o cutover antecipado do que já foi validado. E conforme for validando o restante, já está autorizado ir fazendo o cutover do restante." Earlier the same day: the legacy code must be abandoned, and code/decisions may grow if better for the product.

**Why:** the vanilla panel is legacy and several Next.js parts were already validated; waiting for the whole migration keeps two panels alive and delays real use.

**How to apply:** cutover is done **part by part**, and each part needs (1) evidence classes recorded for it (unit/integration/browser/real stack, per the parity matrix), (2) an independent `@qa` verdict, (3) `@architect`/`@po` plan listing exactly which vanilla routes/files/tests go away (route/action inventory, `legacy-test-audit.md`, class 1 tests ported first), (4) execution by `@dev` test-first and commit by `@devops`. `legacy` is not a fallback or rollback target; rollback = revert the commit. Do NOT treat this as authorization for push, PR, tag, version bump or release: those still need separate express OK each time. A part that is not validated yet is not cut over. Related: [[project-backend-direction]], [[feedback-qa-runs-final-tests]], [[feedback-git-via-devops]].
