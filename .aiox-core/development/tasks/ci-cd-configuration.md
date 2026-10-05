---
id: ci-cd-configuration
name: Configure CI/CD Pipeline
agent: github-devops
category: devops
complexity: high
tools:
  - github-cli       # Manage workflows and repository settings
checklists:
  - github-devops-checklist.md
---

# Configure CI/CD Pipeline

## Purpose

To set up a complete, production-ready CI/CD pipeline for a repository, including linting, testing, building, configured local static analysis, and deployment automation.

## Supported CI Providers

- **GitHub Actions** (primary, recommended)
- **GitLab CI/CD**
- **CircleCI**
- **Jenkins** (basic support)

## Input

### Required Parameters

- **repository_path**: `string`
  - **Description**: Local path or GitHub URL of the repository
  - **Example**: `/path/to/project` or `https://github.com/user/repo`
  - **Validation**: Must be valid Git repository

- **ci_provider**: `string`
  - **Description**: CI/CD provider to configure
  - **Options**: `"github-actions"`, `"gitlab-ci"`, `"circleci"`, `"jenkins"`
  - **Default**: `"github-actions"`

- **project_type**: `string`
  - **Description**: Type of project (determines pipeline stages)
  - **Options**: `"nodejs"`, `"python"`, `"fullstack"`, `"monorepo"`
  - **Required**: true

### Optional Parameters

- **testing_framework**: `string`
  - **Description**: Primary testing framework
  - **Examples**: `"jest"`, `"pytest"`, `"vitest"`, `"mocha"`
  - **Auto-detect**: true (scans package.json or requirements.txt)

- **deployment_target**: `string`
  - **Description**: Where to deploy
  - **Options**: `"vercel"`, `"netlify"`, `"aws"`, `"none"`
  - **Default**: `"none"`

- **enable_static_analysis**: `boolean`
  - **Description**: Enable the repository-configured local static-analysis job
  - **Default**: `true`
  - **Note**: Runs repository-owned rules in CI; it does not provide hosted PR comments or edit files

- **branch_protection**: `boolean`
  - **Description**: Enable branch protection rules
  - **Default**: `true`
  - **Rules**: Require PR, require status checks, no force push

- **required_checks**: `array<string>`
  - **Description**: Status checks that must pass
  - **Default**: `["lint", "test", "build"]`

- **secrets**: `object`
  - **Description**: Environment secrets (will be stored securely)
  - **Example**: `{ VERCEL_TOKEN: "xxx", DATABASE_URL: "postgres://..." }`

## Output

- **workflow_files**: `array<string>`
  - **Description**: Created workflow/config files
  - **Example**: `[".github/workflows/ci.yml", ".github/workflows/deploy.yml"]`

- **branch_protection_rules**: `object`
  - **Description**: Applied branch protection settings
  - **Structure**: `{ branch, required_checks, enforce_admins, allow_force_push }`

- **opengrep_config**: `object` (if enabled)
  - **Description**: Local static-analysis configuration
  - **Structure**: `{ enabled: true, config_file: ".opengrep/rules.yml", command: "npm run review:static" }`

- **secrets_configured**: `array<string>`
  - **Description**: List of secrets successfully stored
  - **Note**: Values not included (security)

- **pipeline_url**: `string`
  - **Description**: URL to view pipeline runs
  - **Example**: `"https://github.com/user/repo/actions"`

- **README_section**: `string`
  - **Description**: Markdown section to add to README.md
  - **Content**: CI/CD badges, status, setup instructions

## Process

### Phase 1: Repository Analysis & Validation (2 min)

1. **Validate Repository**
   - Check if valid Git repository
   - Verify remote origin exists
   - Check CI provider compatibility

2. **Detect Project Structure**
   - Auto-detect project type (if not provided)
   - Scan for package.json, requirements.txt, pom.xml, etc.
   - Identify testing framework
   - Identify build commands

3. **Check Existing CI Configuration**
   - Look for existing workflows
   - Warn if overwriting: "⚠️ Found existing CI config. Backup created at: {path}"

### Phase 2: Local Static Analysis Setup

4. **Configure OpenGrep rules**
   - Ensure `.opengrep/rules.yml` is versioned with the project.
   - Reuse the checked-in AIOX rules template when starting a new project.
   - Keep project-specific paths, languages, and security patterns explicit.

5. **Configure the local command**
   - Add a project script such as `"review:static": "opengrep scan --config .opengrep/rules.yml --error ."`.
   - Run the same script locally and in GitHub Actions.
   - Treat a non-zero result as a blocking quality-gate failure.
   - The configured scanner reports repository-owned rule findings; it does not mutate code or post PR comments.

6. **Record the check in the README**
   - Document the command, required binary version, rules path, and expected exit status.

### Phase 3: GitHub Actions Workflow Creation (5 min)

7. **Create Lint + Test + Build Workflow**
   - Generate `.github/workflows/ci.yml`:

     ```yaml
     name: CI Pipeline
     
     on:
       push:
         branches: [ main, develop ]
       pull_request:
         branches: [ main, develop ]
     
     jobs:
       lint:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           
           - name: Setup Node.js
             uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           
           - name: Install dependencies
             run: npm ci
           
           - name: Run linter
             run: npm run lint
       
       test:
         runs-on: ubuntu-latest
         needs: lint
         steps:
           - uses: actions/checkout@v4
           
           - name: Setup Node.js
             uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           
           - name: Install dependencies
             run: npm ci
           
           - name: Run tests
             run: npm test -- --coverage
           
           - name: Upload coverage
             uses: codecov/codecov-action@v3
             with:
               files: ./coverage/coverage-final.json
       
       build:
         runs-on: ubuntu-latest
         needs: test
         steps:
           - uses: actions/checkout@v4
           
           - name: Setup Node.js
             uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           
           - name: Install dependencies
             run: npm ci
           
           - name: Build project
             run: npm run build
           
           - name: Upload build artifacts
             uses: actions/upload-artifact@v3
             with:
               name: build
               path: dist/
     ```

8. **Create Deployment Workflow** (if deployment_target provided)
   - Generate `.github/workflows/deploy.yml`:

     ```yaml
     name: Deploy
     
     on:
       push:
         branches: [ main ]
       workflow_dispatch:
     
     jobs:
       deploy:
         runs-on: ubuntu-latest
         environment: production
         steps:
           - uses: actions/checkout@v4
           
           - name: Setup Node.js
             uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           
           - name: Install dependencies
             run: npm ci
           
           - name: Build
             run: npm run build
           
           - name: Deploy to {deployment_target}
             uses: {deployment_action}
             with:
               token: ${{ secrets.DEPLOY_TOKEN }}
     ```

### Phase 4: Branch Protection Rules (3 min)

9. **Configure Branch Protection** (if enabled)
   - Use GitHub API to set rules on `main`:
     - Require pull request reviews (1 approval)
     - Require status checks to pass:
       - `lint`
       - `test`
       - `build`
       - `static-analysis` (repository-configured scanner)
     - Enforce for administrators: false (for emergency fixes)
     - Require linear history: true
     - Allow force pushes: false
     - Allow deletions: false

10. **Store Secrets** (if provided)
    - Use GitHub CLI to set secrets:
      ```bash
      gh secret set VERCEL_TOKEN --body="xxx"
      gh secret set DATABASE_URL --body="postgres://..."
      ```
    - Verify secrets stored: `gh secret list`

### Phase 5: Documentation & Testing (3 min)

11. **Update README.md**
    - Add CI/CD badges:
      ```markdown
      [![CI Pipeline](https://github.com/user/repo/actions/workflows/ci.yml/badge.svg)](https://github.com/user/repo/actions/workflows/ci.yml)
      [![Static Analysis](https://img.shields.io/badge/static%20analysis-local-blue)](#quality-gates)
      ```
    - Add CI/CD section (from output)

12. **Create Test PR**
    - Create branch: `ci-cd-test-{timestamp}`
    - Make trivial change (e.g., update README)
    - Push and create PR
    - Verify:
      - CI workflow triggers
      - All checks run
      - Local static-analysis job reports rule findings
      - Branch protection enforced
    - Close PR after validation

13. **Generate Setup Report**
    - Document what was configured
    - List workflow files created
    - Show pipeline URL
    - Confirm local static-analysis job is configured
    - List next steps

## Checklist

### Pre-conditions

- [ ] Repository is valid Git repository
  - **Validation**: `.git` directory exists
  - **Error**: "Not a Git repository"

- [ ] CI provider is supported
  - **Validation**: `ci_provider in ["github-actions", "gitlab-ci", "circleci", "jenkins"]`
  - **Error**: "CI provider '{provider}' not supported"

- [ ] Project has package.json or equivalent
  - **Validation**: File exists at root
  - **Error**: "Cannot detect project type. Add package.json or specify project_type manually"

### Post-conditions

- [ ] Workflow files created and committed
  - **Validation**: Files exist and are tracked by Git
  - **Test**: `git ls-files | grep -E "\.github/workflows|\.gitlab-ci\.yml"`

- [ ] Local static-analysis configuration valid (if enabled)
  - **Validation**: `.opengrep/rules.yml` is valid YAML
  - **Test**: `yamllint .opengrep/rules.yml`

- [ ] Branch protection active (if enabled)
  - **Validation**: GitHub API returns protection rules
  - **Test**: `gh api repos/{owner}/{repo}/branches/main/protection`

- [ ] Test PR passes all checks
  - **Validation**: All required checks green
  - **Manual Check**: true

### Acceptance Criteria

- [ ] CI pipeline runs on every push
  - **Type**: acceptance
  - **Test**: Push to branch → workflow triggers

- [ ] Local static-analysis job runs on pull requests (if enabled)
  - **Type**: acceptance
  - **Test**: Create a PR → CI executes the configured scanner and reports its exit status

- [ ] Branch protection prevents direct pushes to main
  - **Type**: acceptance
  - **Test**: Try `git push origin main` → rejected

## Templates

### README CI/CD Section

```markdown
## CI/CD Pipeline

This repository uses automated CI/CD with {ci_provider}.

### Status

[![CI Pipeline](https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/ci.yml)
{deployment_badge if applicable}

### Pipeline Stages

1. **Lint**: ESLint + Prettier
2. **Test**: {testing_framework} with coverage
3. **Build**: Production build
{4. **Deploy**: Automatic deployment to {deployment_target} (main branch only) if applicable}

### Local Static Analysis

CI runs the repository-configured OpenGrep CLI command against repository-owned rules. Findings are reported in the job log and a non-zero scanner result fails the job. The scanner does not post comments, provide contextual AI review, or edit files. Human review remains required.

### Branch Protection

- `main` branch requires:
  - ✅ 1 PR approval
  - ✅ All CI checks passing
  - ✅ Required CI static-analysis status check passes
  - ❌ No direct pushes
  - ❌ No force pushes

### Setup Instructions

1. Clone repository
2. Install dependencies: `npm install`
3. Run tests locally: `npm test`
4. Create feature branch: `git checkout -b feature/my-feature`
5. Make changes and commit
6. Push and create PR
7. Wait for CI quality checks and human review
8. Merge after approval
```

## Tools

- **github-cli**:
  - **Version**: 2.0.0
  - **Used For**: Manage workflows, secrets, branch protection
  - **Required**: true (for GitHub Actions)

- **OpenGrep CLI**: Optional local static-analysis tool, configured per repository; no account or hosted service is required.

## Performance

- **Duration Expected**: 15 minutes (including local CI quality-check setup)
- **Cost Estimated**: $0 (GitHub Actions usage depends on repository plan)
- **Cacheable**: false (configuration is per-repository)
- **Parallelizable**: false (sequential setup required)

## Error Handling

- **Strategy**: retry + fallback
- **Fallback**: If the optional static scanner is not configured, document that choice and keep required CI checks explicit
- **Retry**:
  - **Max Attempts**: 3
  - **Backoff**: exponential
  - **Backoff MS**: 2000
- **Abort Workflow**: false (continue even if optional features fail)
- **Notification**: log + setup report

## Metadata

- **Story**: Epic 10 (Critical Dependency Resolution)
- **Version**: 1.0.0
- **Dependencies**: `github-cli` tool
- **Author**: Brad Frost Clone
- **Created**: 2025-11-13
- **Updated**: 2025-11-13
- **Breaking Changes**: None (new task)

---

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
task: ciCdConfiguration()
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

## Pre-Conditions

**Purpose:** Validate prerequisites BEFORE task execution (blocking)

**Checklist:**

```yaml
pre-conditions:
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

## Scripts

**Agent-specific code for this task:**

- **Script:** execute-task.js
  - **Purpose:** Generic task execution wrapper
  - **Language:** JavaScript
  - **Location:** .aiox-core/scripts/execute-task.js

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


## Usage Examples

### Example 1: Node.js Project with Local Static Analysis

```bash
aiox activate Otto  # github-devops agent
aiox ci-cd setup \
  --repo="." \
  --provider="github-actions" \
  --type="nodejs" \
  --enable-static-analysis=true \
  --deploy="vercel"
```

**Output**: Complete CI/CD with local static analysis, Vercel deployment

### Example 2: Python Project (GitLab CI)

```bash
aiox ci-cd setup \
  --repo="/path/to/python-project" \
  --provider="gitlab-ci" \
  --type="python" \
  --testing="pytest"
```

**Output**: GitLab CI pipeline with pytest

### Example 3: Monorepo with Turborepo

```bash
aiox ci-cd setup \
  --repo="." \
  --provider="github-actions" \
  --type="monorepo" \
  --enable-static-analysis=true \
  --branch-protection=true
```

**Output**: Optimized monorepo pipeline with caching

---

## Local Static Analysis: Operating Notes

1. Keep the scanner version and rules under repository control.
2. Run the same configured command locally and in CI.
3. Treat a non-zero result as a blocking check.
4. Review findings and correct behavior through test-first changes.
5. Keep human review separate from static-analysis output.

The CLI reports rule matches; it does not provide hosted reviews or interactive PR comments.
- Competitor (Copilot, CodeGuru) costs $10-19/month/user
- Local static analysis runs through the project-configured scanner and CI runner
- Better security coverage than most paid tools
- Integrated with GitHub (no external tools needed)

---

**Related Tasks:**
- `release-management` - Automate releases after CI passes
- `pr-automation` - Help users create PRs with proper format
- `setup-repository` - Initialize repository with best practices

