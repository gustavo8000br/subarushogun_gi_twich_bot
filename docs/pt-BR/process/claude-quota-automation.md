# Automação de cota do Claude Code

> English version: [`docs/process/claude-quota-automation.md`](../../process/claude-quota-automation.md)

## Objetivo

Gravar a cota do Claude Code a partir da barra de status, verificá-la contra limites e instalar a configuração em
outro computador, com uma única ferramenta Node portátil (sem `jq`, sem caminho fixo em `/tmp`). A lógica fica em
`apps/infra/src/claude-quota.mjs`; o CLI é `apps/infra/scripts/claude-quota.mjs`.

A cota é compartilhada por todas as sessões da conta: uma segunda sessão gasta as mesmas janelas de 5 horas e semanal.

## Instalação (Linux, macOS, Windows)

```bash
node apps/infra/scripts/claude-quota.mjs install --dry-run   # mostra a mudança, não grava
node apps/infra/scripts/claude-quota.mjs install             # igual a: npm run quota:install
```

- Registra `statusLine: { type: "command", command: "node <caminho absoluto do script> statusline" }` em
  `~/.claude/settings.json` (`%USERPROFILE%\.claude\settings.json` no Windows), preserva todas as outras chaves,
  salva cópia de segurança em `settings.json.bak-<timestamp>` e grava de forma atômica.
- É idempotente. Um `statusLine` diferente já existente é mantido com um aviso (saída 1); use `--force` para trocar.
- Use `--settings <caminho>` para outro arquivo. **Reinicie a sessão do Claude Code** para carregar a nova barra.
- O arquivo de cota é `claude_quota.json` dentro de `os.tmpdir()`: `/tmp` no Linux, `$TMPDIR` (um diretório
  `/var/folders/...`) no macOS, `%TEMP%` no Windows. Defina `CLAUDE_QUOTA_FILE` para escolher outro lugar; o `check`
  lê a mesma variável ou `--file`.
- O arquivo mantém o formato `{updated_at, rate_limits, model}`. Só é gravado quando a entrada traz `rate_limits`,
  então uma entrada vazia nunca sobrescreve dados bons.
- Fato observado: logo depois do reset da janela de 5 horas, `rate_limits.five_hour` vem ausente ou nulo (janela
  inativa) enquanto `seven_day` continua presente. A ferramenta trata isso como 0% (janela não iniciada), nunca
  como erro.

## Verificação

```bash
npm run quota:check                                           # texto
node apps/infra/scripts/claude-quota.mjs check --json         # para o prompt do loop
node apps/infra/scripts/claude-quota.mjs check --file P --limit 80 --hold 70 --max-age-min 30
```

| Saída | Estado | Significado |
|---|---|---|
| 0 | OK | 5h abaixo de `hold` e semana abaixo de `limit` |
| 10 | HOLD | 5h em `hold` ou mais (padrão 70) e abaixo de `limit` |
| 20 | LIMIT | 5h ou semana em `limit` ou mais (padrão 80) |
| 30 | STALE | registro mais antigo que `max-age-min` (padrão 30) |
| 31 | MISSING | sem arquivo ou sem registro legível |
| 2 | erro de uso | opção inválida |

A saída em texto mostra o estado, os dois percentuais, os horários de reset em horário local e o motivo quando
pertinente. A saída `--json` tem `state`, `exit_code`, `five_hour_pct`, `seven_day_pct`, `five_hour_resets_at`,
`seven_day_resets_at`, `updated_at`, `age_min`, `reason` e `file`.

## Prompt do ciclo `/loop 15m`

```text
Verificação de cota: rode `node apps/infra/scripts/claude-quota.mjs check --json` e leia o estado.
- LIMIT (5h ou semana >= 80%): siga o protocolo de interrupção por cota (pare os agentes, grave o ponto exato de
  parada e os briefs no arquivo de retomada) e não inicie trabalho novo.
- HOLD (5h de 70% a 80%): segure o trabalho pesado; conclua e verifique o que está em andamento.
- OK (5h < 70% e semana < 80%): retome o próximo item da fila.
- STALE ou MISSING: a barra de status não está gravando; avise e não presuma cota livre.
```

Observações:

- O cron do `/loop` vive só enquanto a sessão está aberta. Fechar o terminal o encerra.
- Para retomar em outro computador sem tela, rode no diretório do projeto `claude -p --continue "<prompt>"`, ou
  agende esse comando no agendador do sistema operacional. Nunca rode duas sessões no mesmo diretório.
- A memória viaja pelo repositório privado de memória: rode `./sync.sh pull <projeto>` nele antes de retomar.
