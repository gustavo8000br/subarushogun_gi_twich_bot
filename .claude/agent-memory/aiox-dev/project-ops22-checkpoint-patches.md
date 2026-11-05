---
name: project-ops22-checkpoint-patches
description: OPS-22 single cycle uses cumulative checkpoint patches in .local/ops22/cp-N.patch; the working tree may already hold other agents' uncommitted docs that end up in git diff HEAD
metadata:
  type: project
---

OPS-22 (FT-25 -> FT-26 -> FT-36 -> FT-23) is delivered as one `@qa` gate with four atomic `@devops` commits built from
cumulative patches `.local/ops22/cp-N.patch` (`git diff HEAD`), because `queue-repository.mjs` and some test files are
shared across slices. `@dev` never runs `git add` (not even `-N`); new files are listed in `cp-N.files` and also shipped as
`git diff --no-index /dev/null <file>` diffs.

**Why:** at CP-1 (2026-11-04) the tree already had uncommitted docs from `@po`/`@sm`/Orion (process docs, handoffs,
OPS-17, OPS-22 po-validation and story hunks), so `git diff HEAD` mixed them into the slice patch.

**How to apply:** at each checkpoint, also save a slice-only patch by pathspec and a README naming the pre-existing
changes, so `@devops` can commit those first. The slice-only delta (CP-2 onward) is computed by rebuilding the previous
checkpoint in a TEMPORARY index (`GIT_INDEX_FILE=.local/ops22/tmp-*.index`, `git read-tree HEAD` + `git apply --cached`
of the previous patches), then `git diff` against the working tree; the slice's new files are appended to the slice-only
patch so "HEAD + all slice-only patches" reproduces the tree. The shell is zsh: run such scripts with `bash`.
Scripts: `.local/ops22/build-cp2.sh`, `build-cp3.sh` (CP-3 also fails on any stray changed code/test path).

Also learned in CP-3: an orchestrator decision may contradict an existing test elsewhere (FT-36: Orion authorized changing
one fixture, but `queue-repository.test.js` ~:1912 had the same contradicted case). Change it only to a STRICTER assertion,
mark it `[AUTO-DECISION]` as outside the explicit authorization, and list before/after in the report for Orion and `@qa`.
Mutation runs: back up with sha256 (`mutations/ft36-green.sha256`) and log "ANCHOR NOT FOUND" so an invalid mutation
cannot pass silently.

CP-4 (FT-23, 2026-11-04) learnings: the FT-23 story, `qa-test-plan` and `ux-plan` docs are UNTRACKED (never committed), so
their `@dev` edits are not in any patch; say so in the README. Script: `.local/ops22/build-cp4.sh` (stray-path check covers
`package.json`). Chromium `*-browser-only` scripts need a Next dev server started by hand
(`node node_modules/next/dist/bin/next dev apps/frontend --hostname 127.0.0.1 --port 3000 --experimental-https --experimental-https-key
.local/dev-tls/localhost.key --experimental-https-cert .local/dev-tls/localhost.crt --experimental-https-ca .local/dev-tls/localhost-ca.crt`)
and `APP_ORIGIN=https://localhost:3000`; do not `pkill -f "next dev"` from the same shell (it kills the shell, exit 144).
Plural catalog keys are chosen by the caller (`${base}.${Intl.PluralRules.select(n)}`, 0 -> other); the validator requires the exact
Intl categories per locale (en one/other, es and pt-BR one/many/other) and forbids a plain key AND a one-form-only group.
`compose-runtime.test.js` is a real-stack Chromium test and must be adapted whenever the create/delete UI changes.
