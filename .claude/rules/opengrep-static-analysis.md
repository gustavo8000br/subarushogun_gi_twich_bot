---
paths:
  - "apps/**"
  - "tests/**"
  - ".opengrep/**"
---

# Local static analysis

Run `npm run review:static` for the repository's configured OpenGrep rules.
The command is local and rule-based. It reports findings and does not edit files,
provide contextual AI review, or post comments to a remote pull request.

Treat a non-zero result as blocking. Inspect the exact finding, write or update a
regression test when changing behavior, fix the issue, and rerun the affected tests
and scan. Record the command and actual result in the active story.

The configured rule set checks unsafe HTML sinks and credential logging in the
JavaScript application. Do not infer coverage for languages or paths excluded by
the rule configuration. Specialist architecture, persistence, and QA reviews remain
separate gates.
