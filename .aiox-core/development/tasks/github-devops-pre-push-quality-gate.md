# pre-push-quality-gate.md

**Task**: Pre-Push Quality Gate Validation (Repository-Agnostic)

**Purpose**: Execute comprehensive quality checks before pushing code to remote repository, ensuring code quality, tests, and security standards are met.

**When to use**: Before pushing code to GitHub, always via `@github-devops *pre-push` command.

## Execution Modes

**Choose your execution mode:**

### 1. YOLO Mode - Fast, Autonomous (0-1 prompts)
- Autonomous decision making with logging
- Minimal user interaction
- **Best for:** Simple, deterministic tasks

### 2. Interactive Mode - Balanced, Educational (5-10 prompts) **[DEFAULT]**
- Explicit decision checkpoints
- Educational explanations
- **Best for:** Learning, complex decisions

### 3. Pre-Flight Planning - Comprehensive Upfront Planning
- Task analysis phase (identify all ambiguities)
- Zero ambiguity execution
- **Best for:** Ambiguous requirements, critical work

**Parameter:** `mode` (optional, default: `interactive`)

---

## Task Definition (AIOX Task Format V1.0)

```yaml
task: githubDevopsPrePushQualityGate()
responsável: Gage (Automator)
responsavel_type: Agente
atomic_layer: Organism

**Entrada:**
- campo: task
  tipo: string
  origem: User Input
  obrigatório: true
  validação: Must be registered task

- campo: parameters
  tipo: object
  origem: User Input
  obrigatório: false
  validação: Valid task parameters

- campo: mode
  tipo: string
  origem: User Input
  obrigatório: false
  validação: yolo|interactive|pre-flight

**Saída:**
- campo: execution_result
  tipo: object
  destino: Memory
  persistido: false

- campo: logs
  tipo: array
  destino: File (.ai/logs/*)
  persistido: true

- campo: state
  tipo: object
  destino: State management
  persistido: true
```

---

## Constitutional Gate: Quality First

> **Reference:** Constitution Article V - Quality First (MUST)
> **Severity:** BLOCK
> **Enforcement:** Mandatory checks before any push

```yaml
constitutional_gate:
  article: V
  name: Quality First
  severity: BLOCK

  validation:
    required_checks:
      - name: lint
        command: npm run lint
        must_pass: true

      - name: typecheck
        command: npm run typecheck
        must_pass: true

      - name: test
        command: npm test
        must_pass: true

      - name: build
        command: npm run build
        must_pass: true

      - name: port_denylist
        command: npm run validate:port-denylist
        must_pass: true

      - name: opengrep
        check: No CRITICAL issues
        must_pass: true

      - name: story_status
        check: Story status is "Done" or "Ready for Review"
        must_pass: true

  on_violation:
    action: BLOCK
    message: |
      CONSTITUTIONAL VIOLATION: Article V - Quality First
      Push blocked due to failed quality checks.

      Failed checks:
      {list_failed_checks}

      Resolution: Fix all failing checks before pushing.
      Run: npm run validate:port-denylist && npm run lint && npm run typecheck && npm test && npm run build

  bypass:
    allowed: false
    reason: "Quality First is NON-NEGOTIABLE per Constitution"
```

---

## Pre-Conditions

**Purpose:** Validate prerequisites BEFORE task execution (blocking)

**Checklist:**

```yaml
pre-conditions:
  - [ ] Constitutional gate passed (Article V: Quality First)
    tipo: constitutional-gate
    blocker: true
    validação: |
      All quality checks must pass: port denylist, lint, typecheck, test, build
    error_message: "Constitutional violation - Quality First checks failed"

  - [ ] Task is registered; required parameters provided; dependencies met
    tipo: pre-condition
    blocker: true
    validação: |
      Check task is registered; required parameters provided; dependencies met
    error_message: "Pre-condition failed: Task is registered; required parameters provided; dependencies met"
```

---

## Post-Conditions

**Purpose:** Validate execution success AFTER task completes

**Checklist:**

```yaml
post-conditions:
  - [ ] Task completed; exit code 0; expected outputs created
    tipo: post-condition
    blocker: true
    validação: |
      Verify task completed; exit code 0; expected outputs created
    error_message: "Post-condition failed: Task completed; exit code 0; expected outputs created"
```

---

## Acceptance Criteria

**Purpose:** Definitive pass/fail criteria for task completion

**Checklist:**

```yaml
acceptance-criteria:
  - [ ] Task completed as expected; side effects documented
    tipo: acceptance-criterion
    blocker: true
    validação: |
      Assert task completed as expected; side effects documented
    error_message: "Acceptance criterion not met: Task completed as expected; side effects documented"
```

---

## Tools

**External/shared resources used by this task:**

- **Tool:** git
  - **Purpose:** Version control operations
  - **Source:** System CLI

- **Tool:** npm
  - **Purpose:** Run quality scripts (lint, test, typecheck, build)
  - **Source:** System CLI

- **Tool:** gh (GitHub CLI)
  - **Purpose:** GitHub PR operations
  - **Source:** System CLI

---

## Error Handling

**Strategy:** retry

**Common Errors:**

1. **Error:** Task Not Found
   - **Cause:** Specified task not registered in system
   - **Resolution:** Verify task name and registration
   - **Recovery:** List available tasks, suggest similar

2. **Error:** Invalid Parameters
   - **Cause:** Task parameters do not match expected schema
   - **Resolution:** Validate parameters against task definition
   - **Recovery:** Provide parameter template, reject execution

3. **Error:** Execution Timeout
   - **Cause:** Task exceeds maximum execution time
   - **Resolution:** Optimize task or increase timeout
   - **Recovery:** Kill task, cleanup resources, log state

---

## Performance

**Expected Metrics:**

```yaml
duration_expected: 5-15 min (estimated)
cost_estimated: $0.003-0.010
token_usage: ~3,000-10,000 tokens
```

**Optimization Notes:**
- Break into smaller workflows; implement checkpointing; use async processing where possible

---

## Metadata

```yaml
story: N/A
version: 1.0.0
dependencies:
  - N/A
tags:
  - automation
  - workflow
updated_at: 2025-11-17
```

---


## Prerequisites
- Git repository with changes to push
- package.json with npm scripts (gracefully handles missing scripts)
- Repository context detected (run `aiox init` if needed)

## Quality Gate Checks

### 1. Repository Context Detection

```javascript
const { detectRepositoryContext } = require('./../scripts/repository-detector');

const context = detectRepositoryContext();
if (!context) {
  console.error('❌ Unable to detect repository context');
  console.error('Run "aiox init" to configure installation mode');
  process.exit(1);
}

console.log(`\n🚀 Pre-Push Quality Gate`);
console.log(`Repository: ${context.repositoryUrl}`);
console.log(`Mode: ${context.mode}`);
console.log(`Package: ${context.packageName} v${context.packageVersion}\n`);
```

### 2. Check for Uncommitted Changes

```bash
git status --porcelain
```

If output is not empty, fail with message:
```
❌ Uncommitted changes detected!

Please commit or stash changes before pushing:
  git add .
  git commit -m "your message"
```

### 3. Check for Merge Conflicts

```bash
git diff --check
```

If conflicts detected, fail with message:
```
❌ Merge conflicts detected!

Resolve conflicts before pushing.
```

### 4. Run npm run lint (if script exists)

```javascript
function runNpmScript(scriptName, projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    console.log(`⚠️  Script "${scriptName}" not found - skipping`);
    return { skipped: true };
  }

  try {
    execSync(`npm run ${scriptName}`, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    console.log(`✓ ${scriptName} PASSED`);
    return { passed: true };
  } catch (error) {
    console.error(`❌ ${scriptName} FAILED`);
    return { passed: false, error };
  }
}
```

### 5. Run npm test (if script exists)

Same logic as lint, but for `npm test`.

### 6. Run npm run typecheck (if script exists)

Same logic as lint, but for `npm run typecheck`.

### 7. Run npm run build (if script exists)

Same logic as lint, but for `npm run build`.

### 8. Run Port Denylist Validation (blocking)

```bash
npm run validate:port-denylist
```

This gate is mandatory and cannot be skipped. Any non-zero exit blocks the push. The validator reports the forbidden file or content match; remove every reported framework-port leak and rerun the command.

Failure message:

```text
❌ Framework port denylist validation FAILED - push blocked.
Remove the reported forbidden paths/content, then run:
  npm run validate:port-denylist
```

### 9. Run the Configured Local Static-Analysis Gate

Run the repository's configured command from the project root (for this repository:
`npm run review:static`). Preserve the exact command and exit result in the story or
PR quality report. Exit code 0 passes the scanner gate; non-zero blocks the push
until findings are reviewed and resolved. The scanner is local and report-only: it
does not authenticate, post PR comments, classify unsupported severities, create
issues, or edit source files. If it is unavailable, report the blocker and do not
claim this check passed.
