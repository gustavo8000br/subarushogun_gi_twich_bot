---
name: opengrep-static-analysis
description: Run the project's local OpenGrep rules and report the actual exit status and findings.
user-invocable: true
argument-hint: "[optional scope note]"
---

# OpenGrep Static Analysis

Run `npm run review:static` from the repository root. The project script supplies
the pinned rules file, scan scope, and blocking exit behavior.

Report the exact command, exit code, and a short summary. A non-zero result blocks
the quality gate until findings are resolved or explicitly waived by the responsible
reviewer. The scanner does not edit files, make severity judgments beyond its rules,
or replace human/AIOX review.

Do not claim a scan passed if the command could not run. Do not apply generated fixes;
route code changes through the active story and its required test-first cycle.
