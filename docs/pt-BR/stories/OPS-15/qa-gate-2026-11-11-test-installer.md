# QA gate 2026-11-11: instalador de teste do dono (guard, workflow, conteudo da branch)

> Contraparte em ingles: `docs/stories/OPS-15/qa-gate-2026-11-11-test-installer.md`. Gate parcial: a cota o encerrou antes (ver "Nao verificado").

**Veredito: CONCERNS. Nota 8,4/10 (minimo 9,0 nao atingido).** Nenhum defeito de seguranca no guard, no empacotador ou no workflow; um defeito de teste bloqueante (F1) e verificacoes inacabadas mantem a nota abaixo de 9,0.

## Achados
- **F1 (bloqueia o CI da main, correcao do @dev):** `windows-owner-test-installer-contract.test.js` e `windows-installer-paths-contract.test.js` chamam `mkdtemp(join(root, '.local', ...))` sem criar `.local/`. Em checkout limpo (CI) os dois arquivos inteiros falham com ENOENT (reproduzido). Correcao: `mkdir(join(root,'.local'),{recursive:true})` antes (verde no worktree).
- **F2 (so da branch):** em `test/windows-owner` dois casos falham por desenho (workflow presente em `.github/workflows`; `Validar-SubaruShogun.ps1` ausente). Adaptados com `it.skip` / `skipIf` no `branch.patch`.
- **F3 (baixo):** zizmor `--pedantic`: `contents: write` sem comentario explicativo. Auditoria padrao: sem achados.
- **Limites, nao defeitos:** o guard e dissuasao (o `.bat` e editavel; o hash permite tentativa offline, mitigada por 600000 iteracoes e senha de 16+ caracteres); os testes de container sao pulados em silencio onde a imagem pwsh falta (CI), entao o CI nao prova o comportamento do guard.

## Revisado sem defeito
Guard: falha fechada (`$accepted` so vira verdadeiro apos o XOR; hash ilegivel/malformado/fora da faixa, .NET ausente e modo silencioso saem com 4), 3 tentativas com pausa de 2 s, hash so no payload codificado (uma vez), bytes da senha zerados, nunca em disco/log/argv/ambiente. Empacotador: hash so por variavel de ambiente em maiusculas, base64 canonico e limites validados, sem eco, so Windows. Workflow: push em `test/windows-owner` + caminho RUN-MARKER, guarda de ator e ref, `permissions: {}` e `contents: write` so no job, Environment `windows-owner-test`, `persist-credentials: false`, segredo vazio aborta, segredo so no env de um passo, sem `upload-artifact`, rascunho + pre-release, `--target main`, `$GITHUB_SHA` real nas notas, SHAs das actions iguais aos ja usados na main.

## Evidencia
Worktree descartavel sobre `origin/main` (ab50350) so com os arquivos da branch: 7 arquivos de teste, 89 passaram / 2 pulados; lint, validate:localization, typecheck exit 0; `review:static` 0 achados; actionlint 1.7.12 limpo; zizmor 1.32.0 offline limpo. Prova propria em container (PowerShell 7, senha-isca): senha certa exit 0; errada x3 exit 4 com 3 negativas; `--silent install` exit 4; vazia x3 exit 4; modo de teste nao burlou; isca fora da saida. Varredura dos arquivos da branch: sem URL de sessão do Claude e sem padrao de token. Worktree, branch `qa/test-branch-check` e containers removidos; `dev:start` intocado.

## Nao verificado (cota)
As 8+ mutacoes proprias com restauracao e `cmp`; a comparacao byte a byte do `.bat` sem hash contra um build da origin/main (o teste AC-T1 cobre so o payload); casos de hash malformado/placeholder alem da suite existente; propagacao do `exit 4` pelo `-Command` do launcher do `.bat`; existencia da imagem `v0.3.0-0d0b595-beta` no GHCR; tudo que exige Windows 10 (PowerShell 5.1, construtor do .NET 4.7.2, tempo) e GitHub real (aprovacao do Environment, primeira revisao, `--target main`, acesso anonimo ao rascunho).

## Conteudo da branch
Ver `.local/qa-audit/g1111t/branch-content.md` e `branch.patch` (13 caminhos; compartilhados: `installer.ps1` e `package-installer.mjs` diff inteiro = C1c + C1d; os testes levam o hunk F1 e dois skips so da branch). Montagem pelo @devops: `git switch -c test/windows-owner origin/main && git apply --index <branch.patch>`, mudar uma linha do RUN-MARKER por ciclo, push, nunca abrir PR para a main.
