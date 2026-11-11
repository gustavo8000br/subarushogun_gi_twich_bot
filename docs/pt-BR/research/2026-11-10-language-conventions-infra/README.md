# Pesquisa do Lote B: convenções, segurança e desempenho de PowerShell, Batch, Shell, GitHub Actions, Dockerfile, Compose e YAML

- Data: 2026-11-10 | Autor: `@analyst` | Arquivo par: `docs/research/2026-11-10-language-conventions-infra/README.md`
- Escopo: somente pesquisa. Nenhuma alteração de código, git ou GitHub. O Lote A (JavaScript, TypeScript, React, Next, Fastify, Prisma, PostgreSQL, CSS) está em nota separada.
- Etiquetas de evidência em cada recomendação:
  - **[DOC]** comprovada pela documentação oficial (link e data de consulta 2026-11-10).
  - **[MEDIDO]** medida neste repositório em 2026-11-10 (saídas em `.local/lote-b/`, ignorado pelo git).
  - **[MED]** depende de medição antes de adotar (sem otimização especulativa).
  - **[COM]** opinião da comunidade ou fonte secundária.

## 1. Resumo executivo

1. O projeto já está bem nos itens mais difíceis: todas as referências `uses:` estão fixadas em SHA completo com comentário de versão, os workflows declaram `permissions: contents: read` no topo, os jobs têm `timeout-minutes`, a publicação usa `concurrency` com `cancel-in-progress: false`, o Compose usa `depends_on` com `service_healthy` / `service_completed_successfully`, os containers rodam com UID 10001, o `.gitattributes` fixa o fim de linha por tipo de arquivo e o payload do `.bat` vai em base64 UTF-16LE (imune à armadilha de BOM/code page). [MEDIDO] por leitura dos arquivos.
2. Achados medidos (tudo em containers descartáveis, repositório montado somente leitura):
   - **zizmor** (linter de segurança de Actions): 27 achados, 0 alto, 12 médios, 2 baixos, 2 informativos, 11 suprimidos. Os 12 médios são `artipacked`: todo `actions/checkout` deixa o `GITHUB_TOKEN` em `.git/config` (sem `persist-credentials: false`). Nenhum achado `unpinned-uses`, o que confirma o pin por SHA. [MEDIDO]
   - **ShellCheck** no `installer.sh` com `-s sh`: só 2 avisos (SC1112, aspas tipográficas em textos de mensagem). Muito limpo. [MEDIDO]
   - **Hadolint** no `Dockerfile`: 2 avisos, ambos DL3018 (`apk add openssl` sem versão). [MEDIDO]
   - **actionlint com ShellCheck ligado** (o CI roda com `-shellcheck=`, que o desliga): 4 notas (3x SC2129 de estilo, 1x SC2034 aviso em `release.yml:288`, variável `stage` atribuída e não usada). [MEDIDO]
   - **yamllint** (preset `relaxed`): só 85 avisos `line-length`. Nenhum problema de tipo ou chave duplicada. [MEDIDO]
   - **Tamanho da imagem**: imagens locais de aceitação têm 1,32 GB; `COPY node_modules` pesa 738 MB porque o estágio de runtime copia a árvore completa do `npm ci` (com dependências de desenvolvimento). [MEDIDO] Uma árvore só de produção é candidata, mas o caminho migrate/Prisma pode precisar de pacotes de desenvolvimento: [MED].
3. Ações de maior valor e menor risco (dependem de decisão do dono/`@dev`, seção 12): `persist-credentials: false` em todo checkout; `.github/dependabot.yml` para `github-actions`, `docker`, `docker-compose` e `npm`, para os pins não envelhecerem; ShellCheck/Hadolint/zizmor no CI por containers fixados; gravar o `.env` como UTF-8 sem BOM no `installer.ps1` em vez de `-Encoding ascii` (risco de acento no nome de usuário, seção 3.5).
4. Não verificado nesta sessão: PSScriptAnalyzer (tentativas em container falharam, seção 3.7), comportamento em Windows de qualquer afirmação de PowerShell/Batch (sem host Windows), semântica de `queue: max` além da documentação.

## 2. Notas existentes não repetidas

O `docs/research-index.md` já cobre matriz de CI/empacotamento da OPS-5, GitHub Actions + `pwsh`, `queue: max`, o instalador Windows e testes com PostgreSQL Docker descartável. Esta nota só acrescenta convenções, linters e endurecimento, sem reabrir esses vereditos.

## 3. PowerShell (installer.ps1, Validar-SubaruShogun.ps1)

### 3.1 Convenções e estilo
- `about_Execution_Policies`, `about_Character_Encoding` da Microsoft e o conjunto de regras do PSScriptAnalyzer são a base oficial. As regras "são baseadas em boas práticas identificadas pela equipe do PowerShell e pela comunidade". [DOC] https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview (data da página 2026-03-20; consultada em 2026-11-10)
- Hoje: `$ErrorActionPreference = 'Stop'` no topo do `installer.ps1`; sem `Set-StrictMode`. [MEDIDO]
- Recomendação: adicionar `Set-StrictMode -Version 2.0` só depois de testes em Windows, pois variáveis não inicializadas viram erro e o comportamento pode mudar. [MED]

### 3.2 PowerShell 5.1 versus 7
- O binário é `powershell.exe` (Windows PowerShell 5.1, .NET Framework) versus `pwsh.exe` (7.x, .NET); convivem lado a lado, e o `pwsh` trocou o primeiro parâmetro posicional de `-Command` para `-File`. [DOC] https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell (2026-02-04; consultada em 2026-11-10)
- O `.bat` chama `powershell.exe`, então **o instalador deve continuar com sintaxe válida em 5.1**: sem `?.`, `??`, ternário nem operadores de cadeia de pipeline (`&&`, `||`), que existem só na 7.x. [DOC] mesma página.
- `Invoke-WebRequest` na 7.x usa `HttpClient` e tem quebras em relação à 5.1. O instalador já usa `curl.exe`. [DOC]
- A pesquisa anterior (linha do índice sobre GitHub Actions + `pwsh`) cobre o uso de `pwsh` no CI; o runner Windows também tem a 5.1. Recomendação: o CI deve rodar o teste do instalador sob `powershell.exe` (5.1), pois é o que o usuário executa. [MED] (conferir se o job `installer-smoke` já faz isso).

### 3.3 Política de execução
- "A política de execução não é um limite de segurança, é defesa em profundidade." Em clientes Windows sem nada definido o padrão efetivo é `Restricted`; `RemoteSigned` em servidores. A aplicação ocorre só no Windows. [DOC] https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies (2026-08-31; consultada em 2026-11-10)
- `Bypass` é "projetada para configurações em que um script PowerShell é embutido em um aplicativo maior". Combina com o projeto: o `.bat` roda `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command` com o script em memória (`[ScriptBlock]::Create`). [DOC] + [MEDIDO]
- A política vale para *arquivos* de script; este instalador vai como texto de comando, então a barreira prática ao usuário é o SmartScreen/Mark-of-the-Web no `.bat` baixado, não a política. Downloads por `curl.exe`/`Invoke-WebRequest` não recebem a marca da internet. [DOC] mesma página.
- Recomendação: manter o `Bypass` restrito ao processo (como está) e nunca usar `Set-ExecutionPolicy` na máquina toda. Publicar o SHA-256 de cada instalador nas notas da release para verificação. [DOC quanto ao escopo; o checksum é prática comum, [COM]]

### 3.4 Segurança
- Evitar `Invoke-Expression`; o PSScriptAnalyzer sinaliza (`PSAvoidUsingInvokeExpression`). [DOC] (a página de visão geral cita "Use of `Invoke-Expression`"). Instalador atual: o grep não achou `Invoke-Expression`/`iex`. [MEDIDO]
- O `.env` guarda só porta, tag da imagem, idioma e um caminho; os segredos ficam em volumes Docker. Bom. [MEDIDO]
- O `Validar-SubaruShogun.ps1` mascara tokens e nunca lê o `.env`. [MEDIDO] (cabeçalho do script).

### 3.5 Armadilhas de codificação (achado de maior valor em PowerShell)
- O Windows PowerShell 5.1 lê script sem BOM como a página de código ANSI legada; "se você precisa de caracteres não ASCII nos scripts, salve como UTF-8 com BOM". O PowerShell 7 usa `utf8NoBOM` por padrão. O `Set-Content` na 5.1 usa a página de código ANSI; `Out-File` e `>` gravam UTF-16LE. [DOC] https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding (página de 2023-03-09, atualizada em 2025-09-29; consultada em 2026-11-10)
- Situação: o `Validar-SubaruShogun.ps1` tem BOM UTF-8 (correto para 5.1). O `installer.ps1` não tem BOM, mas vai dentro do `.bat` em base64 UTF-16LE, então os acentos sobrevivem. Rodar o `installer.ps1` cru na 5.1 estragaria os acentos. [MEDIDO] (saída do `file`).
- **Risco a investigar:** `Save-Config` grava o `.env` com `Set-Content -Encoding ascii` e inclui `LOCAL_COMMUNITY_CATALOG_DIRECTORY`, montado a partir de `$InstallHome` (`%LOCALAPPDATA%`). Se o perfil do usuário Windows tiver acento (por exemplo "João"), a codificação ASCII troca o caractere por `?` e o caminho do bind mount fica errado. Não reproduzido (sem host Windows). [MED] Teste: criar usuário Windows com acento, instalar e inspecionar o `.env`. Gravação compatível com 5.1: `[IO.File]::WriteAllLines($EnvFile, $lines, [Text.UTF8Encoding]::new($false))`, que dá UTF-8 sem BOM na 5.1 e na 7. O conselho de evitar BOM é [DOC] (mesma página: "evite BOM em arquivos UTF-8" por causa de ferramentas Unix); o cenário de falha é [MED].
- Também `Get-Content` sem `-Encoding` na 5.1 lê arquivo sem BOM como ANSI. Leia com a mesma codificação usada na escrita. [DOC] mesma página.

### 3.6 Desempenho
- Orientação oficial (com tabelas de benchmark da Microsoft, PowerShell 7.3/7.4 no Windows 11): evitar `+=` em arrays (3.424x mais lento com 10 mil itens no exemplo), usar `List[T]` ou expressão de array; evitar `Out-Null` em laços grandes (1,5x a 2,2x mais lento que `$null =`); `Write-Host` pode ser uma ordem de grandeza mais lento que `[Console]::WriteLine()`; usar `-join` em vez de `+=` em strings. O `+=` em array só foi otimizado na 7.5, então a 5.1 mantém o custo. [DOC] https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations (2026-01-21; consultada em 2026-11-10)
- Projeto: os laços do instalador são minúsculos (menus, teste de porta, poucas linhas de `.env`). Desempenho do script **não** é gargalo; o tempo está no pull do Docker e na subida dos containers. Não reescrever por velocidade. [MED] (nenhuma medição mostra ponto quente em PowerShell; `$imageNames += ...` com poucos itens é irrelevante).

### 3.7 Ferramentas e como rodar sem instalar no host
- PSScriptAnalyzer: `Install-Module PSScriptAnalyzer` (funciona na 5.1 e no PowerShell 7.2.11+). [DOC] página acima. Severidades típicas: Error, Warning, Information.
- Tentativa em 2026-11-10: o container `mcr.microsoft.com/powershell:latest` resolveu para o PowerShell 7.4.2; o PSScriptAnalyzer 1.25.0 recusou carregar ("versão mínima suportada") e o 1.24.0 exigiu o assembly 7.4.6. A tag `lts-ubuntu-24.04` não existe. **O PSScriptAnalyzer, portanto, não foi executado**; use um runner Windows (`windows-latest` já usado no CI) ou uma tag mais nova e fixada da lista de tags do MCR. [limitação MEDIDA]
- Formatação: o PSScriptAnalyzer também formata código (`Invoke-Formatter`). [DOC] visão geral ("pode corrigir a formatação").

### 3.8 Checklist para este projeto (PowerShell)
| # | Ação | Etiqueta | Arquivos |
|---|------|----------|----------|
| P1 | Manter a sintaxe do instalador compatível com 5.1; adicionar verificação de parse no CI sob `powershell.exe` | [DOC]/[MED] | `apps/infra/installer/installer.ps1` |
| P2 | Trocar `Set-Content -Encoding ascii` do `.env` por UTF-8 sem BOM; teste com caminho de perfil acentuado | [MED] | installer.ps1 linhas ~335, 347, 359 |
| P3 | Rodar PSScriptAnalyzer em `windows-latest` (Warning+Error), falhando só em Error no início | [DOC]/[MED] | os dois `.ps1` |
| P4 | Nunca `Set-ExecutionPolicy` na máquina; manter `-ExecutionPolicy Bypass` por processo | [DOC] | `package-installer.mjs` |
| P5 | Publicar o SHA-256 dos instaladores nas notas da release | [COM] | `release.yml` |

## 4. Batch (wrapper .bat gerado por package-installer.mjs)

### 4.1 Convenções e fatos
- `setlocal` localiza mudanças de ambiente até `endlocal` ou o fim do arquivo; `enabledelayedexpansion` precisa ser pedido explicitamente e define `ERRORLEVEL` 0 quando a opção é aceita. [DOC] https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setlocal (consultada em 2026-11-10)
- `%~f0`, `%~dp0`, `%~nx0`: `%~f1` é o caminho completo, `%~dp1` unidade mais caminho; modificadores `%~` não funcionam com `%*`; não usar pipe nem redirecionamento com `call`. [DOC] https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/call (consultada em 2026-11-10)
- A documentação oficial de batch é só referência de comandos; não há guia de estilo nem linter oficial. Tudo além dessas páginas é [COM].

### 4.2 Wrapper atual
`@echo off`, `setlocal`, `goto :run`, payload base64 entre `:payload` e `:endpayload`, depois `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "...ReadAllText('%~f0')..."` e `exit /b %errorlevel%`. O arquivo é CRLF e ASCII puro. [MEDIDO] `package-installer.mjs` linhas 56-77.

### 4.3 Armadilhas relevantes
- **Apóstrofo no caminho:** `'%~f0'` fica dentro de literal com aspas simples do PowerShell; uma pasta como `C:\Users\Joe\O'Brien\Downloads` encerra a string antes da hora. Não reproduzido. [MED] Opção mais segura: passar o caminho por variável de ambiente (`set "QUEUEBOT_SELF=%~f0"`) e ler `$env:QUEUEBOT_SELF` no PowerShell; isso também evita estranhezas com `%`/`!`. A técnica da variável de ambiente é comum [COM]; a falha do apóstrofo é regra de aspas do PowerShell (aspas simples terminam no `'` sem escape), documentada em `about_Quoting_Rules` [DOC, não consultada nesta sessão: verificar].
- **`exit /b %errorlevel%`** está correto: é uma linha própria depois do retorno do PowerShell. A alternativa `exit /b` sem valor propaga o último errorlevel com extensões ligadas. [COM]
- **Salto de rótulo sobre dados:** `goto :run` antes do payload é o truque padrão; as linhas têm 76 caracteres (limite do cmd é 8191). Fim de linha só LF pode quebrar a busca de rótulos em algumas versões do cmd [COM]; o gerador emite `\r\n` explicitamente e o `.gitattributes` fixa `*.bat` em CRLF. [MEDIDO]
- **Sem `chcp`:** o arquivo não tem texto não ASCII, o que evita problemas OEM versus ANSI. [MEDIDO]
- **Incógnitas só testáveis em Windows:** caminhos com `^`, `&`, `%`, `!`. O `!` é seguro porque a expansão atrasada está desligada. [DOC] (página do `setlocal`: expansão atrasada é opcional).

### 4.4 Checklist (Batch)
| # | Ação | Etiqueta |
|---|------|----------|
| B1 | Passar `%~f0` ao PowerShell por variável de ambiente em vez de literal com aspas simples; teste com pastas `O'Brien` e `João` no runner Windows | [MED] |
| B2 | Manter o arquivo ASCII e CRLF; teste unitário que garanta nenhuma linha só LF e nenhum byte acima de 0x7F (o teste de contrato `windows-installer-contract.test.js` é o lugar natural) | [MED] |
| B3 | Não existe linter oficial de batch; apoiar-se no smoke test do runner Windows | [DOC: inexistente] |

## 5. Shell (installer.sh / .command, blocos `run:` dos workflows)

### 5.1 Convenções e ferramentas
- O ShellCheck é "uma ferramenta GPLv3 que dá avisos e sugestões para scripts bash/sh". Docker: `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable meuscript` (README). Níveis error/warning/info/style; `-s sh` escolhe o dialeto (o shebang também vale). [DOC] https://raw.githubusercontent.com/koalaman/shellcheck/master/README.md (consultada em 2026-11-10)
- Formatador: shfmt ("formata programas shell"; suporta POSIX, Bash, Zsh, mksh). Padrão docker do README: `docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/mnt" -w /mnt <imagem> <args>`. [DOC] https://raw.githubusercontent.com/mvdan/sh/master/README.md. O nome da imagem `mvdan/shfmt` é conhecimento comum [COM].
- Medido: `installer.sh` com `-s sh` dá 2x SC1112 (apóstrofo tipográfico em strings do `printf`, linhas 126 e 135), saída 1 porque o limiar padrão inclui avisos. Com `-S error` a saída é 0. [MEDIDO] A correção é cosmética: trocar o apóstrofo tipográfico ou usar `# shellcheck disable=SC1112` com motivo.

### 5.2 `set -e`, `pipefail`, `trap`, aspas
- O instalador usa `#!/bin/sh` com `set -eu`. Bom para POSIX sh. `pipefail` nem sempre existiu em todo `sh` POSIX; não adicione em scripts `/bin/sh` sem testar em dash e no `/bin/sh` do macOS (bash 3.2 em modo POSIX). [COM; o POSIX.1-2024 adicionou pipefail, mas o suporte nos shells em uso varia: não verificado aqui]
- `set -e` é pouco confiável: ignorado em condições de `if` e listas `&&`/`||`, em funções usadas como condição, mascarado por `local x=$(cmd)`, e pipelines usam o último status sem `pipefail`. A wiki Wooledge recomenda checagens explícitas (`|| exit 1`) nos comandos importantes e chama de duvidosa a alegação do "strict mode". [referência comunitária, autoridade em Bash] https://mywiki.wooledge.org/BashFAQ/105 (consultada em 2026-11-10) [COM]
- Runners hospedados: sem `shell:` roda `bash -e {0}`; `shell: bash` roda `bash --noprofile --norc -eo pipefail {0}`. Passos sem `shell: bash` **não têm `pipefail`**. Os workflows usam `set -euo pipefail` explícito nos blocos longos (por exemplo instalação do OpenGrep), compensação correta. [DOC] https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax (consultada em 2026-11-10)
- `trap` para limpeza: o instalador usa `mktemp` (linha ~352) e `chmod 600` + `mv` no `.env` (linha ~481), padrão de escrita atômica. Conferir se existe `trap 'rm -f "$tmp"' EXIT` para o temporário; o grep não achou `trap` no `installer.sh`. [MEDIDO] Um temporário sobrando contém cópia do `.env` (sem segredos, mas com porta e caminho). [MED] gravidade baixa.
- Aspas: o ShellCheck não achou SC2086/SC2046 no `installer.sh`. [MEDIDO]

### 5.3 Portabilidade macOS versus Linux
- Desde o macOS Catalina o zsh é o shell de login/interativo padrão; a página da Apple diz que scripts que dependem de recursos do bash podem falhar em outro shell e que o comportamento de `/bin/sh` pode ser testado contra bash, dash ou zsh. [DOC] https://support.apple.com/en-us/102360 (consultada em 2026-11-10)
- O macOS traz bash 3.2 (sem arrays associativos, `mapfile`, `${var,,}`); a página da Apple não cita a versão, então é [COM]. Usar `#!/bin/sh` e ShellCheck `-s sh` (zero SC3xxx medido) é a abordagem certa. Arquivos `.command` abrem no Terminal pelo shebang. [MEDIDO] quanto ao resultado do ShellCheck.
- BSD versus GNU: `sed -i`, `date -d`, `readlink -f`, flags de `stat` diferem. O grep do `installer.sh` mostra só `sed -n`, `mktemp`, `chmod`, `uname -s`, todos portáveis. [MEDIDO]

### 5.4 Segurança
- Nunca interpolar dado não confiável em strings de comando (`eval`, `sh -c "$var"`); o `installer.sh` não tem `eval`. [MEDIDO] `curl --insecure` aparece só no teste de saúde contra o endpoint local autoassinado `https://localhost` (linha ~374); aceitável por ser loopback e só checar prontidão. [MED] Preferível `--cacert` com a CA local que o produto já exporta (`.local/localhost-ca.crt`). [COM]
- Segredos: `.env` com modo `600`. [MEDIDO]

### 5.5 Checklist (Shell)
| # | Ação | Etiqueta |
|---|------|----------|
| S1 | Adicionar ShellCheck (`-s sh`, falhar em warning) para `apps/infra/installer/installer.sh` e `.devcontainer/post-create.sh`; corrigir ou justificar os 2 SC1112 | [MEDIDO]/[DOC] |
| S2 | Usar o ShellCheck dentro do actionlint (remover `-shellcheck=` em `quality-gates.yml:170`), corrigir SC2129/SC2034 em `main-cd.yml:44`, `release.yml:40`, `release.yml:288`; o ShellCheck do actionlint só roda se o runner o tiver (a imagem ubuntu-24.04 o inclui, segundo a doc do actionlint) | [MEDIDO]/[DOC] |
| S3 | Adicionar `trap ... EXIT` para o temporário em torno da linha ~352 do installer.sh | [MED] |
| S4 | Manter `/bin/sh` com `set -eu`; não introduzir bashismos | [DOC] |

## 6. GitHub Actions (.github/workflows/*)

### 6.1 Convenções
- Fixar em SHA completo do repositório da própria action; tags podem ser movidas. Definir o `GITHUB_TOKEN` padrão como somente leitura e elevar por job; passar expressões não confiáveis por variável `env:` intermediária e citar variáveis de shell; evitar `pull_request_target` salvo necessidade e nunca fazer checkout de código de PR não confiável nele; runners próprios quase nunca em repositório público; usar Dependabot para referências de actions; usar OIDC em vez de segredos de nuvem de longa duração. [DOC] https://docs.github.com/en/actions/reference/security/secure-use (consultada em 2026-11-10)
- `permissions`: "se você especificar o acesso a qualquer uma, todas as não especificadas ficam `none`"; `permissions: {}` desativa tudo. A chave `queue` existe em `concurrency` (`single` padrão, `max` permite até 100 pendentes); "a combinação `queue: max` com `cancel-in-progress: true` não é permitida". [DOC] página workflow-syntax acima.
- Desde 2025-08-15 uma política de organização/repositório pode exigir pin por SHA (`sha_pinning_required`). [DOC] https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/ (via resultado de busca; página não aberta) e textos da comunidade [COM]; comportamento atual exato não verificado.

### 6.2 O que o projeto já faz bem [MEDIDO]
- 100% dos `uses:` com SHA e comentário `# vX.Y.Z`; `permissions: contents: read` no topo; `packages: write` só no job de publicação; `permissions: {}` em job sem token; `timeout-minutes` em todos os jobs; `concurrency` com `cancel-in-progress: true` no CI e `false` mais `queue: max` na publicação/release; `docker login` com `--password-stdin`; `GITHUB_TOKEN` via `env:` e não inline; cosign e actionlint instalados em versões fixadas com checksum; job agregador `quality-gate` com `if: always()`.
- Nota sobre `queue: max`: o actionlint ainda não conhece a chave, por isso o projeto ignora essa única mensagem; ao atualizar o actionlint fixado, o ignore pode sair quando houver suporte. [MEDIDO] (`quality-gates.yml:170`). Não reabrir: coberto por `docs/research-index.md`.

### 6.3 Achados
| # | Achado | Evidência | Etiqueta |
|---|--------|-----------|----------|
| A1 | Nenhum dos 12 checkouts tem `persist-credentials: false` (zizmor `artipacked`, médio). O padrão deixa o token em `.git/config` para passos seguintes e artefatos que incluam `.git`. Nenhum job faz push de commits. | saída do zizmor, `grep` | [MEDIDO] (impacto apoiado em [DOC], orientação sobre exposição de token) |
| A2 | Não há `.github/dependabot.yml`; pins por SHA e imagens base envelhecem sem aviso. O Dependabot suporta `github-actions`, `docker`, `docker-compose` e `npm`; Docker/Compose só têm atualizações de versão, atualizações de segurança só para actions e npm. | `ls .github`; docs | [MEDIDO]/[DOC] https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories (consultada em 2026-11-10) |
| A3 | `-shellcheck=` desliga o ShellCheck dentro do actionlint (4 achados escondidos). | actionlint com ShellCheck | [MEDIDO] |
| A4 | `${{ steps.installer-version.outputs.version }}` e `${{ matrix.platform }}` interpolados direto em `run:` (`quality-gates.yml:86`): informativo no zizmor. Os valores vêm do próprio repositório, risco baixo; mover para `env:` é o padrão documentado. | zizmor, página secure-use | [MEDIDO]/[DOC] |
| A5 | Ajuda `self-repository` do zizmor: chamadas de workflow reutilizável com caminho local (`ci.yml:19`, `main-cd.yml:14`). Estilo, não vulnerabilidade. | zizmor | [MEDIDO] |
| A6 | Release e publicação disparam em `push` na `main`, com guarda por `github.actor` no `workflow_dispatch`. Boa prática. | leitura | [MEDIDO] |

### 6.4 Desempenho e confiabilidade
- O cache de camadas Docker no CI usa `type=gha,mode=max` por escopo de arquitetura. Bom; o tamanho conta no limite de 10 GB de cache do repositório (limite da doc do GitHub, [DOC] não reconsultado nesta sessão). [MED] medir a taxa de acerto antes de mudar.
- `actions/setup-node` com `cache: npm` guarda o cache de download do npm, não o `node_modules`; `npm ci` sempre apaga `node_modules`. [README do setup-node: não reconsultado] [COM]
- O padrão de `timeout-minutes` é 360 quando omitido (doc do GitHub, de memória, não reconsultada nesta sessão: verificar). O projeto define valores explícitos: bom.
- `strategy.fail-fast: false` na matriz de instaladores (já `false` em `release.yml`). [MEDIDO]
- Retry: não adicionar retry cego em testes; em passos de rede (`curl` da instalação do OpenGrep) usar `curl --retry 3 --retry-all-errors`. [COM] [MED]
- Nomes de `concurrency.group` não diferenciam maiúsculas de minúsculas. [DOC] página workflow-syntax.

### 6.5 Ferramentas
actionlint (sintaxe, expressões, labels de runner, integração com shellcheck/pyflakes; saída 1 em qualquer problema) e zizmor (segurança: injeção por template, persistência de credenciais, permissões excessivas, commits impostores). [DOC] https://github.com/rhysd/actionlint/blob/main/docs/usage.md, https://raw.githubusercontent.com/zizmorcore/zizmor/main/README.md. Via Docker: `rhysd/actionlint:latest` (inclui shellcheck) e `ghcr.io/zizmorcore/zizmor:latest`, ambos funcionaram aqui. [MEDIDO] No CI usar tags/digests fixados, não `latest`.

### 6.6 Checklist (Actions)
1. Adicionar `persist-credentials: false` aos 12 passos `actions/checkout` (o teste de contrato `tests/unit/ci-workflow-contract.test.js` pode assegurar). [MEDIDO]
2. Adicionar `.github/dependabot.yml` para 4 ecossistemas com atualizações semanais agrupadas. [DOC]
3. Ligar o ShellCheck no actionlint; corrigir 4 achados. [MEDIDO]
4. Adicionar o zizmor como job de CI (digest do container fixado; começar sem bloquear, depois bloquear em médio+). [MEDIDO]
5. Mover `${{ ... }}` de `run:` para `env:` em `quality-gates.yml:86` e nas duas linhas de `package-installer` em `release.yml`/`main-cd.yml`. [DOC]
6. Decidir se ativa a política "Enforce SHA pinning" do repositório/organização. Decisão do dono. [DOC, comportamento não verificado]

## 7. Dockerfile

### 7.1 Convenções [DOC]
https://docs.docker.com/build/building/best-practices/ (consultada em 2026-11-10): fixar imagens base por digest para integridade da cadeia de suprimentos (mas isso abre mão de correções de segurança automáticas, então combine com Dependabot); multi-stage e `COPY --from`; `.dockerignore` para excluir o irrelevante; `USER` com UID/GID explícitos; `CMD` em forma exec; `exec "$@"` em entrypoints; `--pull` e `--no-cache` para builds frescos; juntar `apt-get update` com install e limpar listas na mesma `RUN`. A página não cobre HEALTHCHECK, padrões do apk, secret mounts nem cache mounts.
Específico de Node (projeto Docker Node): rodar como usuário `node` sem privilégios, "Node.js não foi projetado para rodar como PID 1", então `--init`/Tini, preferir `CMD ["node", ...]` a `npm start` para os sinais chegarem ao Node, `NODE_ENV=production`. [DOC] https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md (consultada em 2026-11-10)

### 7.2 Dockerfile atual frente à orientação [MEDIDO]
| Aspecto | Estado | Veredito |
|---------|--------|----------|
| Multi-stage, `COPY --from` | 3 estágios | bom |
| Base | tag `node:24.20.0-alpine3.24`, sem digest | fixar por digest + Dependabot [DOC]; o Node já está fixado no patch |
| Ordem de cache | `package*.json`, `npm ci`, depois fontes | bom |
| `.dockerignore` | `.git`, `.env*`, segredos, `node_modules`, `.next`, `tests`, `docs`, `.aiox`, dumps | bom |
| Usuário | `USER 10001:10001` | bom (UID explícito) |
| CMD | forma exec `node apps/infra/scripts/start-product.mjs` | bom |
| PID 1 | `init: true` no Compose para `bot` | bom (equivale a `--init`) |
| `apk add --no-cache openssl` | sem versão | Hadolint DL3018 x2, pouco valor fixar no Alpine; ignorar com justificativa em `.hadolint.yaml` [COM] |
| `HEALTHCHECK` | não está na imagem; definido no Compose | ok se só roda via Compose; pôr na imagem apenas se for executada fora do Compose [MED] |
| Dependências de dev no runtime | `COPY --from=dependencies /app/node_modules` (árvore completa) | camada de 738 MB em imagem de 1,32 GB [MEDIDO]; candidata a enxugar [MED] |
| `ARG PRODUCT_VERSION` | não é segredo | ok; não passar tokens como build arg [adjacente a DOC] |

### 7.3 Desempenho
- Cache mounts (`RUN --mount=type=cache,target=/root/.npm`) aceleram `npm ci` repetido no CI e em rebuilds locais; a página de boas práticas não cobre, então a fonte é a doc do BuildKit: não verificada aqui. [MED] Medir build frio e quente antes de mudar; o CI já usa cache de camadas GHA.
- Enxugar `node_modules`: segundo estágio `npm ci --omit=dev` e copiar essa árvore, mas só se o runtime (migrate, cliente Prisma, servidor de produção do Next) não precisar de pacotes de dev; o `prisma generate` roda no estágio runtime e precisa do CLI `prisma`. Testar com os testes de integração de runtime do Compose. [MED]
- `npm ci` aceita `--omit=dev`. [COM/adjacente a DOC: doc do npm não consultada]

### 7.4 Segurança
- Escanear a imagem com Trivy ou Docker Scout (não consultados aqui; ambos bem documentados). [MED]/[COM]
- O build usa `DATABASE_URL=postgresql://queuebot:build-only@db:5432/queuebot` como variável de prefixo de comando no `prisma generate`; não é segredo e não fica em camada ENV. Aceitável. [MEDIDO]
- O serviço `bootstrap` roda como `0:0`: grava segredos/certificados em volume; escopo mínimo e documentado. [MEDIDO]

### 7.5 Checklist (Dockerfile)
1. Adicionar Hadolint no CI com `.hadolint.yaml` ignorando DL3018 (motivo documentado), `failure-threshold: warning`. [MEDIDO]
2. Fixar os `FROM` por digest e usar atualizações `docker` do Dependabot. [DOC]
3. Medir um estágio de `node_modules` só de produção; adotar somente se os testes passarem e a imagem encolher de forma relevante. [MED]
4. Manter o `.dockerignore` em paridade com o `.gitignore` para segredos (já está). [MEDIDO]

## 8. Docker Compose (compose.yaml, compose.build.yaml, compose.dev.yaml)

### 8.1 Convenções [DOC]
- Condições de `depends_on`: `service_started`, `service_healthy`, `service_completed_successfully`; o Compose sozinho só espera "em execução", não prontidão; opções de `healthcheck`: `interval`, `timeout`, `retries`, `start_period` (e `start_interval`, Compose 2.20.2+); `depends_on.restart: true` (2.17.0+) reinicia dependentes após reinício explícito pelo Compose. https://docs.docker.com/compose/how-tos/startup-order/ e https://docs.docker.com/reference/compose-file/services/ (consultadas em 2026-11-10)
- `profiles`: serviços sem perfil sempre sobem; nomes `[a-zA-Z0-9][a-zA-Z0-9_.-]+`. `restart`: `no` (padrão), `always`, `on-failure[:max]`, `unless-stopped`. `init: true` repassa sinais e colhe processos zumbis. `stop_grace_period` padrão 10 s. `pull_policy` padrão `missing`, `latest` sempre baixa. `cap_drop`, `read_only`, `security_opt: no-new-privileges` disponíveis. [DOC] referência de services.
- Precedência do nome do projeto: `-p` > `COMPOSE_PROJECT_NAME` > `name:` de topo > diretório do projeto; caracteres permitidos: minúsculas, dígitos, hífen, sublinhado. [DOC] https://docs.docker.com/compose/how-tos/project-name/ (consultada em 2026-11-10)

### 8.2 Arquivos atuais [MEDIDO]
- `compose.yaml`: `name: subarushogun-gi-twitch-queue-bot` de topo (volumes e redes ganham prefixo estável; o arquivo de dev usa outro `name`, então nunca compartilham volumes: bom); cadeia `bootstrap` → `db` (healthcheck `pg_isready`, `start_period: 10s`) → `migrate` → `bot` (healthcheck próprio, `init: true`, `stop_grace_period: 30s`); porta presa em `127.0.0.1`; segredos em volume nomeado montado somente leitura nos dependentes; bind mount com `create_host_path: true`; `user: "10001:10001"` mais `group_add` para o grupo do volume de segredos; volume de dados do Postgres 18 em `/var/lib/postgresql` (layout esperado pelas imagens do PostgreSQL 18 segundo as notas da imagem oficial; não reconsultado nesta sessão).
- `compose.dev.yaml`: `secrets:` do Compose com arquivo, porta em loopback, `restart: unless-stopped`.

### 8.3 Oportunidades
| # | Item | Etiqueta |
|---|------|----------|
| C1 | `bot` e `db` não têm política `restart:` (padrão `no`). Para um produto local sempre ligado após reiniciar o PC, `unless-stopped` pode ser desejável; afeta também o desinstalador e os testes. Decisão do dono/produto. | [DOC]/dono |
| C2 | Endurecer o `bot`: `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `read_only: true` com `tmpfs` para caminhos graváveis. Precisa de teste, pois Next.js e o app gravam em `/app/.local`. | [DOC]/[MED] |
| C3 | Fixar `postgres:18.6-bookworm` por digest e cobrir com o `docker-compose` do Dependabot. | [DOC] |
| C4 | `docker compose config --quiet` já roda no CI (`container-build`). Só acrescentar `docker compose --profile "*" config` se surgirem profiles. | [DOC] |
| C5 | Não há limites de recurso (`mem_limit`); medir memória na VM real do Docker Desktop (Windows/macOS) antes de limitar. | [MED] |

### 8.4 Armadilhas
- Healthcheck é sinal de prontidão, não mecanismo de reinício: o Docker marca `unhealthy` mas não reinicia; o Compose só o usa para ordenar. [DOC] página startup-order.
- Volumes e redes levam o prefixo do nome do projeto; mudar o `name:` deixa dados órfãos. Trate o `name:` como contrato estável. [DOC] página project-name (regras de nome); a consequência de orfandade é inferida das mesmas regras [MED].
- Bind mount de `${LOCAL_CERT_DIRECTORY:-./.local}`: em Windows, caminhos com espaço, letra de unidade e acento são a falha típica; o instalador grava caminhos absolutos no `.env` (ver P2). [MED]

## 9. YAML

- Onde importa aqui: workflows, Compose, `docs/qa/gates/*.yml`, tasks/templates do framework.
- O YAML 1.1 trata `yes/no/on/off/y/n` sem aspas (sem distinguir caixa) como booleanos e números com zero à esquerda como octais; o YAML 1.2 reduziu os booleanos a `true`/`false`. Os parsers diferem na especificação que seguem (as fontes divergem sobre alguns parsers Go e JS). [COM] resumido de resultados de busca em 2026-11-10 (por exemplo https://allan.reyes.sh/posts/yaml-norway-law/); verificar por parser. Nos workflows do GitHub, a chave `on:` é armadilha clássica para ferramentas 1.1 (a regra `truthy` do yamllint existe por isso).
- Regras do yamllint para armadilhas de tipo: `truthy`, `octal-values`, `quoted-strings`, `key-duplicates`, `key-ordering`, `line-length` (padrão 80), `document-start`, `indentation`. [DOC] https://yamllint.readthedocs.io/en/stable/rules.html (consultada em 2026-11-10)
- Medido com o preset `relaxed`: 85 avisos `line-length`, nada em truthy, chaves duplicadas ou octal. [MEDIDO] O preset `default` não foi rodado (marcaria `on:`); se adotar, definir um `.yamllint` com `line-length: disable` e `truthy: {check-keys: false}`.
- Âncoras e merge keys: o Compose aceita âncoras e campos de extensão `x-`; os blocos repetidos `image:` e `build.args` do `compose.build.yaml` poderiam usar âncora `x-`, mas com três serviços pequenos o ganho é cosmético. [COM] [MED] baixa prioridade. A merge key `<<` é recurso 1.1; confirmar suporte do Compose antes de depender. [COM], não verificado.
- Colocar entre aspas strings que parecem número/booleano (versões como `"24.20"`, portas `"3000:3000"`). O projeto já cita as portas. [MEDIDO]
- CRLF em YAML: o `.gitattributes` força LF em `*.yml`/`*.yaml`, então checkouts Windows não quebram o Compose. [MEDIDO]

## 10. Tabela de linters

| Ferramenta | Linguagem | Como rodar sem instalar no host | Severidade típica | Medido aqui |
|------------|-----------|----------------------------------|-------------------|-------------|
| actionlint | YAML de GitHub Actions (+ ShellCheck e pyflakes embutidos) | `docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:latest` ou binário da release fixado com checksum (como no CI) | erro (saída 1 em qualquer achado) | 4 notas com ShellCheck ligado; 0 desligado |
| zizmor | Segurança de GitHub Actions | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt ghcr.io/zizmorcore/zizmor:latest .github/workflows` | alto / médio / baixo / informativo | 27 achados, 12 médios (artipacked) |
| ShellCheck | sh/bash | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt koalaman/shellcheck:stable -s sh arquivo` | error / warning / info / style | 2 avisos no `installer.sh` |
| shfmt | formatação sh/bash | `docker run --rm -v "$PWD:/mnt" -w /mnt mvdan/shfmt -d arquivo` ([COM] nome da imagem) | diff de formatação, sem severidade | não rodado |
| Hadolint | Dockerfile (+ ShellCheck nas `RUN`) | `docker run --rm -i hadolint/hadolint < Dockerfile` (README) | error / warning / info / style; `--failure-threshold` | 2 avisos (DL3018) |
| yamllint | YAML | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt cytopia/yamllint -d relaxed .` (imagem da comunidade; o caminho oficial é `pip install yamllint`) | error / warning por regra | 85 avisos line-length |
| PSScriptAnalyzer | PowerShell | `Install-Module PSScriptAnalyzer`; em container exige imagem PowerShell nova o bastante para o módulo | Error / Warning / Information | NÃO EXECUTADO (ver 3.7) |
| `docker compose config --quiet` | Compose | embutido no Docker | erro | já no CI |
| Batch | nenhum oficial | smoke test no runner Windows | n/a | n/a |

Nota: no CI, usar versões ou digests fixados, como o projeto já faz com cosign, OpenGrep e actionlint.

## 11. Riscos e limitações

- Sem host Windows ou macOS: toda afirmação de PowerShell, Batch e macOS vem de documentação ou raciocínio; o comportamento da 5.1 não foi executado. Falhas com acento/apóstrofo no caminho (P2, B1) são hipóteses com teste claro, não bugs confirmados.
- Várias páginas foram lidas por uma ferramenta que resume; as citações vêm dessa extração. Alguns itens saíram de conhecimento prévio e estão marcados "não reconsultado" (padrão de 360 min de timeout, limite de cache, caminho de dados do Postgres 18, `about_Quoting_Rules`).
- O zizmor rodou offline, em container e sem token do GitHub; auditorias online podem ter sido puladas. 11 achados foram "suprimidos" pelos padrões da ferramenta; não inspecionados.
- O PSScriptAnalyzer não pôde ser executado em container Linux (incompatibilidade de versão); faltam resultados de análise estática de PowerShell.
- Fontes da comunidade (comportamento de parsers YAML 1.1/1.2, truques de Batch, portabilidade de pipefail) são secundárias; pese de acordo.
- O Docker baixou localmente cinco imagens de ferramentas (shellcheck, hadolint, yamllint, zizmor, actionlint, além da imagem PowerShell do MCR). São descartáveis; nenhum recurso do projeto foi alterado ou removido. As saídas estão em `.local/lote-b/` (ignorado pelo git).

## 12. O que depende do dono

1. Adotar o Dependabot (PRs semanais) e a política de agrupamento.
2. Pôr linters no CI e definir a severidade que bloqueia (sugestão: ShellCheck, Hadolint e zizmor sem bloquear no início).
3. Ativar a política "Enforce SHA pinning" no repositório/organização.
4. Política `restart:` do Compose para produto local sempre ligado e endurecimento (`cap_drop`, `read_only`).
5. Pin por digest das imagens base (custo: atualização manual ou via Dependabot).
6. Se exigirá PowerShell 7 no futuro (hoje o `.bat` mira a 5.1, presente em todo Windows 10/11).
7. Enxugar a imagem (dependências só de produção) se os 1,32 GB importarem para o download do usuário.

## 13. Próximos passos (para @pm / @dev / @devops / @qa, sem implementação aqui)

- `@dev`: P2, B1, S1/S3, A1, A5 com testes; experimento de enxugar o Dockerfile com tamanho antes/depois e resultado dos testes.
- `@qa`: testes no runner Windows com caminhos acentuados e com apóstrofo; rodar PSScriptAnalyzer em `windows-latest`.
- `@devops`: arquivo do Dependabot, jobs de linter no CI e política de pin por SHA, após OK do dono; indexar esta nota em `docs/research-index.md` (sugestão de veredito: SUFICIENTE para convenções; REVISAR SE o projeto adotar PowerShell 7 ou mudar o modelo de restart/endurecimento do Compose).

## 14. Autoavaliação (rubrica, 0-10)

| Critério | Nota | Justificativa |
|----------|------|---------------|
| Fontes oficiais | 9,0 | Microsoft Learn, GitHub Docs, Docker Docs, READMEs de ShellCheck/Hadolint/shfmt/actionlint/zizmor; alguns itens de memória sinalizados; YAML e Batch apoiados em parte na comunidade |
| Evidência | 9,3 | Seis ferramentas executadas no repositório real; histórico da imagem inspecionado; limitações declaradas (PSScriptAnalyzer não executado) |
| Aderência ao projeto | 9,5 | Cada seção liga a arquivos e linhas reais |
| Segurança | 9,2 | Persistência de token, injeção, pins, automação de atualização, política de execução e cadeia de suprimentos cobertas |
| Mensurabilidade | 9,0 | Cada recomendação tem etiqueta e teste ou medição; casos de acento/apóstrofo têm passos de reprodução |
| **Média** | **9,2** | Acima da meta de 9,0 |

## Fontes (consultadas em 2026-11-10)

- GitHub Docs, Secure use reference: https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Docs, Workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Docs, ecossistemas do Dependabot: https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories
- GitHub changelog, política de SHA pinning (2025-08-15): https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/
- Docker, Build best practices: https://docs.docker.com/build/building/best-practices/
- Docker, ordem de inicialização do Compose: https://docs.docker.com/compose/how-tos/startup-order/
- Docker, referência de services do Compose: https://docs.docker.com/reference/compose-file/services/
- Docker, nome do projeto Compose: https://docs.docker.com/compose/how-tos/project-name/
- Docker Node best practices: https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md
- Microsoft Learn, about_Execution_Policies: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies
- Microsoft Learn, about_Character_Encoding: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding
- Microsoft Learn, diferenças entre Windows PowerShell 5.1 e 7.x: https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell
- Microsoft Learn, considerações de desempenho do PowerShell: https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations
- Microsoft Learn, PSScriptAnalyzer: https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview
- Microsoft Learn, setlocal e call: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setlocal , https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/call
- README do ShellCheck: https://raw.githubusercontent.com/koalaman/shellcheck/master/README.md
- README do shfmt (mvdan/sh): https://raw.githubusercontent.com/mvdan/sh/master/README.md
- README do Hadolint: https://raw.githubusercontent.com/hadolint/hadolint/master/README.md
- Uso do actionlint: https://github.com/rhysd/actionlint/blob/main/docs/usage.md
- README do zizmor: https://raw.githubusercontent.com/zizmorcore/zizmor/main/README.md
- Regras do yamllint: https://yamllint.readthedocs.io/en/stable/rules.html
- Bash FAQ 105 (set -e): https://mywiki.wooledge.org/BashFAQ/105
- Apple Support, zsh como shell padrão: https://support.apple.com/en-us/102360
- Comunidade (YAML 1.1 vs 1.2): https://allan.reyes.sh/posts/yaml-norway-law/
