# FND-7 — Spec Pipeline validation

## Pipeline status

| Stage | Result | Evidence |
|---|---|---|
| Gather | Complete | User selected all proposed fields plus fixed text, same-computer OBS, per-widget complete style, two-second update target, empty fallback, stale marker on transient failure, revocable/regenerable links, 240 Unicode code points. |
| Assess | COMPLEX, 17/25 | Scope 4, integration 3, infrastructure 4, knowledge 3, risk 3. |
| Research | Complete | Official OBS Browser Source documentation, RFC 6750 and project architecture reviewed. No runtime dependency added. |
| Critique 1 | NEEDS_REVISION | Clarified empty, transient failure and invalid/revoked link display states. |
| Critique 2 | APPROVED, 4.4/5 | Independent QA review. |
| Final role gates | PASS | PM, PO, Architecture and QA. Plan DAG and JSON/YAML parity verified. |
| Plan | Complete | `spec/plan.json` and `plan/implementation.yaml`, 21 matching tasks. |

## Decisions

- Post-MVP extension; FND-0 remains historically accurate.
- OBS and bot on the same computer; no LAN/public/cloud access.
- One atomic field or fixed text per widget, with independent style and capability URL.
- Empty source uses configured fallback. Transient failure retains last value with stale marker. First failure without a prior value shows neutral unavailable state. Invalid/revoked capability clears the source.
- URL secret is emitted once only by authenticated create/regenerate; OBS projection never returns it. Hash-only persistence, revocation and atomic delete.
- 240 Unicode code points for fixed/fallback text, with the same counting rule on both sides.

## Limitations

No product implementation, tests, OBS installation or OS compatibility has been verified. FND-5 and FND-6 are hard prerequisites to all FND-7 implementation. UX approval is required before UI coding. The two-second SLA must pass ten commit-to-DOM measurements with eight concurrent widgets. The URL fragment reduces HTTP request exposure but remains sensitive in OBS settings and copies.
