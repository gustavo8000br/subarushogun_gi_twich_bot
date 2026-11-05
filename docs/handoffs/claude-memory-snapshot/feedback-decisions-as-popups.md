---
name: feedback-decisions-as-popups
description: Bring every recommended decision to the user as an AskUserQuestion pop-up, in pt-BR
metadata:
  type: feedback
---

Owner said "Sempre me traga as decisões recomendadas em popup." Present decisions with a recommended first option via AskUserQuestion; answer in pt-BR with correct accents.

**Why:** the owner wants to approve choices explicitly (cutover, UX additions, scope) instead of finding them embedded in prose.

**How to apply:** use AskUserQuestion for any real choice (put the recommendation first, marked Recommended); do not ask per-slice confirmation for ordinary work. See [[feedback-implementation-by-dev]].
