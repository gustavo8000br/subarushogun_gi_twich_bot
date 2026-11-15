# Hooks do Claude Code neste repositório (estado real, 2026-11-14)

Este arquivo descreve **só o que existe e o que está ligado** no SubaruShogun
Twitch Bot. Os hooks Python do template do framework não existem aqui e não
são documentados.
Regras normativas: `AGENTS.md` ("Git e commits", "Guarda-corpo versionado",
"Limite dos hooks", "`permissionMode: bypassPermissions` mantido").

## Arquivos nesta pasta

| Arquivo | Papel | Ligado onde |
|---|---|---|
| `git-authority-guard.cjs` | Autoridade de Git/GitHub e escrita dos arquivos de governança | `.claude/settings.json` (`PreToolUse`, matcher `Bash\|Write\|Edit\|MultiEdit\|NotebookEdit`) e no frontmatter de todos os agentes em `.claude/agents/` |
| `read-only-bash-guard.cjs` | Allowlist de `Bash` somente leitura | Frontmatter de `aiox-search` (`--role=search`), `aiox-grep` (`--role=grep`) e `aiox-audit` (`--role=audit`) |
| `lib/shell-words.cjs` | Tokenizador de comandos usado pelos dois hooks acima | Biblioteca, sem registro próprio |
| `enforce-git-push-authority.cjs` | Cópia do template do framework | **Não está ligado** aqui; o frontmatter dos agentes não o referencia (um teste de contrato garante) |
| `synapse-engine.cjs`, `synapse-wrapper.cjs`, `precompact-wrapper.cjs` | Hooks do template do framework (contexto SYNAPSE e digest de compactação) | **Não estão registrados** em `.claude/settings.json` |

`.claude/settings.json` registra um único hook: o `git-authority-guard.cjs`
em `PreToolUse`. Além disso mantém `permissions.deny` para força, `reset
--hard`, `clean -f`, `filter-branch`, `gh repo delete`, `gh release delete` e
leituras de `.env*`, `runtime-secrets/`, `backups/`, `data/`, `*.pem`, `*.key`.

## `git-authority-guard.cjs`: classes e decisões

Identidade: o tipo do subagente que o harness grava na entrada do hook
(`agent_type`); sem ele, a sessão principal, que vale como `@devops` somente se
`AIOX_ACTIVE_AGENT` estiver no ambiente do processo do Claude Code. Prefixo
digitado no comando é ignorado de propósito.

**Negar por padrão para quem não é o `@devops`:** só passa o que está na
allowlist de leitura de Git/GitHub.

| Classe | O que cobre | `aiox-devops` | Sessão principal | Outros subagentes |
|---|---|---|---|---|
| A | Publicação remota (push, escrita de PR/issue, `gh api` de escrita) | permitido | pergunta | nega |
| B | Escrita no histórico/estado local (add, commit, stash, fetch, ...) | permitido | pergunta | nega |
| C | Reservado ao dono (merge em `main`, tag, release, apagar, comentário raro, alvo de push montado em tempo de execução) | pergunta | pergunta | nega |
| D | Destruição ou contorno (force, `reset --hard`, `--no-verify` e abreviações, alias, `GIT_CONFIG_*`, `--config-env`, config que executa programa) | nega | nega | nega |
| E | Verbo montado em tempo de execução | nega | nega | nega |
| U | Fora da allowlist de leitura (verbo `git`/grupo `gh` desconhecido, `gh api graphql` de consulta) | permitido | pergunta | nega |
| G | Escrita nos arquivos de governança pelo shell (`sed -i`, `tee`, redirecionamento, interpretador) | pergunta | pergunta | nega |

Escrita com as ferramentas `Write`/`Edit` em `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/**` e `.claude/agents/**` sempre
pergunta ao dono.

## `read-only-bash-guard.cjs`

Falha fechada: o que não está na allowlist é negado. Além dos comandos de
leitura, nega caminhos fora do repositório (absolutos existentes, `~`, `..`,
links simbólicos), nomes de credencial (`.npmrc`, `.netrc`, `.ssh`, `.config/gh`,
`.git/config`, ...), variáveis (`$VAR`), redirecionamento de entrada e saída, e
opções que executam ou escrevem (`rg --pre`, `sort --compress-program`,
`ugrep --filter`, `file -C`, `git diff --textconv`, ...). O `aiox-audit` pode
rodar somente `npm run <script fixo>`; não há `npx` nem vitest.

## Hook local antigo do dono (`.claude/settings.local.json`)

O arquivo `.claude/settings.local.json` é ignorado pelo Git e pertence ao dono.
Hoje ele liga a cópia de template
`.aiox-core/infrastructure/templates/grok-hooks/enforce-git-push-authority.cjs`
em `PreToolUse` (matcher `Bash|run_terminal_command`) e o
`synapse-wrapper.cjs` do mesmo diretório em `UserPromptSubmit`.

O que o hook antigo aceita e recusa:

- Casa expressões regulares com o **texto** do comando: recusa qualquer comando
  cujo texto contenha `git push`, `gh pr create`, `gh pr merge`, escrita de PR
  pela API ou mutação GraphQL de PR, mesmo dentro de `echo`, heredoc ou `python3`
  que só edita um arquivo.
- Libera quando o agente ativo resolve para `devops` por variável de ambiente,
  por prefixo `AIOX_ACTIVE_AGENT=devops` no próprio comando ou por arquivos-ponte
  (`.aiox/active-agent*`). A identidade é cooperativa: qualquer processo do
  espaço de trabalho a define.
- Roda **junto** com o `git-authority-guard.cjs`; vale o mais restritivo.

Retirar ou trocar esse hook é decisão e passo do dono; nenhum agente edita o
`settings.local.json`. Enquanto ele existir, escreva textos que contenham esses
verbos com `Write`/`Edit`, nunca por heredoc.

## Limite dos hooks

Os hooks leem o texto do comando. Processos filhos (`npm run`, `npx`, `node`,
interpretadores, `vitest`, `eslint`) executam código que o hook não enxerga.
Credenciais, proteção de branch e o gate do `@qa` são a barreira real.
Resíduos aceitos (auditoria 2026-11-14): o corpo de um heredoc é lido linha a
linha como se fosse comando; `Read`, `Grep` e `Glob` dos agentes de leitura não
passam pela allowlist de `Bash`; e `gh api graphql` somente leitura cai na
classe U.

## `bypassPermissions` e a pendência V-HOOK

Os dez agentes AIOX de escrita usam `permissionMode: bypassPermissions`; os
três agentes de leitura usam `plan`. Presume-se que hooks `PreToolUse` também
rodam sob `bypassPermissions`, mas isso **não foi comprovado nesta instalação**:
é a verificação V-HOOK, do `@qa`, em sessão real. Estado: mantido, não
comprovado.

## Divergência de configuração

`.aiox-core/core-config.yaml` tem `boundary.frameworkProtection: false` neste
projeto. As regras de negação L1/L2 do framework descritas em `.claude/CLAUDE.md`
**não estão ativas**; a proteção vem dos hooks acima, de `permissions.deny` e
do `@qa`.

## Entrada e saída dos hooks

Entrada em JSON pelo stdin (`tool_name`, `tool_input`, `cwd`, `agent_type` quando
a chamada vem de subagente). Saída: `hookSpecificOutput.permissionDecision` com
`allow`, `ask` ou `deny`. Código de saída 0 libera ou segue a decisão; 2
bloqueia e mostra o stderr. Mensagens nunca trazem caminhos, usuário ou host.

## Testes

- `tests/unit/git-authority-guard.test.js`: classificação, decisão por papel,
  processo do hook e o guarda de leitura.
- `tests/unit/claude-governance-contract.test.js`: agentes, fiação, privacidade
  e este contrato.

Para experimentar um comando sem executá-lo, use um script de teste ou o
Vitest; não rode o hook por heredoc com texto de publicação (ver acima).
