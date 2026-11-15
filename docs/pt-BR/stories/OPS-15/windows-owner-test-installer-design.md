# Instalador de teste privado do dono no Windows: desenho (rascunho de pré-release + senha por hash) e o risco do `workflow_dispatch` fora da `main`

> Status: proposta de arquitetura para decisão do dono. Nenhum código foi escrito. Autor: `@architect` (Aria). Data: 2026-11-11. Base: `main` em `dcfe3da`, release `v0.3.0-0d0b595-beta`.
> Par em inglês: `docs/stories/OPS-15/windows-owner-test-installer-design.md`.
> Não contém segredo, senha, hash nem URL de sessão.

## 1. Contexto e fatos lidos

| Fato | Fonte |
| --- | --- |
| O instalador do Windows é `apps/infra/installer/installer.ps1`, embutido em UTF-16 base64 num `.bat` por `apps/infra/scripts/package-installer.mjs` (marcadores `__COMPOSE_B64__`, `__IMAGE_TAG__`, `__PRODUCT_VERSION__`). | leitura de arquivo |
| O empacotador valida a tag da imagem com regex estrita (`v<semver>-<sha7>-<estágio>` ou `main`, `@sha256:` opcional). | leitura de arquivo |
| O `installer.ps1` já respeita `QUEUEBOT_TEST_MODE` e `QUEUEBOT_TEST_INPUT_FILE` (entrada vinda de arquivo). A trava não pode ser pulada por eles. | leitura de arquivo |
| `Read-Answer` é o único auxiliar de entrada; `Parse-CommandLine` retorna antes de qualquer pergunta (`--help` sai com 0). | leitura de arquivo |
| O `release.yml` roda só em `push` na `main` mais `workflow_dispatch`, restrito por `github.actor`; seus jobs constroem, sobem um artefato e depois publicam. | leitura de arquivo |
| O `ci.yml` roda só em pull request para a `main`; o `main-cd.yml` só em `push` na `main`; o `quality-gates.yml` é `workflow_call`. Um push em `test/windows-owner` não dispara nenhum workflow existente. | leitura de arquivo |
| O `Validar-SubaruShogun.ps1` abre o instalador em janela interativa própria com `Start-Process -Wait`; portanto nunca vê o que se digita lá, e seu sanitizador de log já mascara padrões `password`/`senha`. | leitura de arquivo |
| O `docs/research-index.md` não tem nota sobre `workflow_dispatch` em branches fora da padrão. | busca |

## 2. Decisões

### D-T1. Onde o workflow mora e como é disparado

Comportamento conhecido (a confirmar, ver lacuna L1): a documentação do GitHub diz que, para disparar `workflow_dispatch`, o arquivo do workflow precisa existir na branch padrão; o `gh workflow run` e o botão "Run workflow" resolvem o workflow pelo que está registrado na branch padrão, e um arquivo que só existe em outra branch costuma falhar com "workflow not found on the default branch". Depois que o arquivo existe na `main`, a execução usa a versão do arquivo no ref escolhido (`-r test/windows-owner`).

| Opção | Descrição | Mexe na `main`? | Manual? | Riscos |
| --- | --- | --- | --- | --- |
| A | `workflow_dispatch` só no arquivo da `test/windows-owner`, disparado com `gh workflow run -r test/windows-owner`. | Não | Sim | Muito provavelmente não funciona (workflow não registrado). Comprovar custa uma execução trivial na branch (L1). Se falhar, A cai. |
| B | Stub guardado na `main` (arquivo `workflow_dispatch` vazio, mesmo nome: só roda em `test/*`, só com o Secret presente, `permissions: {}`), lógica real só na branch. | Sim, uma vez, arquivo mínimo | Sim (botão/CLI reais) | Altera a `main` (o dono pediu para não alterar); o stub é público e revisável; uma edição futura do stub na `main` poderia ampliá-lo, então exige CODEOWNERS ou teste de contrato. |
| C (recomendada) | Disparo por `push` em `test/windows-owner` com filtro de caminho (arquivo marcador de disparo) e guarda de ator, mais um Environment `windows-owner-test` com o dono como revisor obrigatório e regra de branch de implantação limitada a `test/windows-owner`. | Não | Sim, pelo clique de aprovação | Quem tem escrita pode dar push na branch, mas o job espera a aprovação do dono e o Secret só é liberado para essa branch; lembrar de nunca abrir PR dessa branch para a `main` (rodaria o `ci.yml`). |

Recomendação: C. Respeita "não mexer na `main`", mantém trava humana (aprovação do Environment) e ainda limita o Secret à branch. Manter `workflow_dispatch: {}` no arquivo da branch mesmo assim (inofensivo; passa a servir se o dono aceitar B depois). Se o dono quiser um botão "Run workflow" de verdade, escolher B conscientemente.

Guardas comuns a qualquer opção: `if: github.ref == 'refs/heads/test/windows-owner' && github.actor == 'gustavo8000br'`; abortar cedo se o Secret estiver vazio (`[[ -n "$HASH" ]]`, sem imprimi-lo); `permissions: {}` no nível do workflow.

### D-T2. Trava de senha no instalador

- O marcador `__TEST_PASSWORD_HASH__` aparece exatamente uma vez, em `$TestPasswordHash = '__TEST_PASSWORD_HASH__'`. O empacotador sempre o substitui: pelo hash no build de teste, por string vazia nos builds oficiais (comportamento oficial inalterado, sem trava). A checagem é `if ($TestPasswordHash.Length -gt 0)` e nunca compara com o texto do marcador (um `replaceAll` global reescreveria a comparação também). Marcador não substituído é tratado como hash malformado e nega (falha fechada).
- O empacotador lê o hash de uma variável de ambiente (`--password-hash-env TEST_INSTALLER_PASSWORD_HASH`), não do argv, e valida o formato antes de usar.
- Onde: logo após `Parse-CommandLine` (para `--help` continuar funcionando) e antes de `Prompt-Language`, de qualquer chamada ao Docker e de qualquer criação de arquivo.
- Pergunta: `Read-Host -AsSecureString` (sem eco). Converter para bytes UTF-8, derivar e zerar os arrays de bytes; a string em texto claro nunca vai para `Write-Host`, `$env`, arquivo nem transcrição. No modo de teste só muda a origem da entrada (arquivo de entrada de teste); a trava continua ativa.
- KDF: PBKDF2-HMAC-SHA256, 600000 iterações, sal aleatório de 16 bytes, saída de 32 bytes (orientação OWASP para PBKDF2-SHA256). No Windows PowerShell 5.1 usar `Rfc2898DeriveBytes(senha, sal, iterações, HashAlgorithmName)` (exige .NET Framework 4.7.2+; Windows 10 1803 em diante). Se o construtor não existir, recuar para um laço HMAC-SHA256 em C# via `Add-Type` (um laço em PowerShell puro seria lento demais com 600000 iterações). Se nenhum funcionar, negar com mensagem genérica.
- Formato do Secret `TEST_INSTALLER_PASSWORD_HASH`: `pbkdf2-sha256$600000$<sal-base64>$<hash-base64>` (uma linha, sem espaços). O empacotador aceita só esse formato exato (iterações de 100000 a 2000000, sal de 16 bytes, hash de 32 bytes).
- Comparação em tempo constante: `FixedTimeEquals` não existe no 5.1; acumular XOR sobre os 32 bytes e testar o acumulador uma só vez no fim (os tamanhos são fixos e públicos).
- Tentativas: 3 tentativas, pausa de 2 segundos entre falhas; depois, código de saída 4. O limite é só atrito (ver D-T4): quem tem o arquivo pode editá-lo.
- Mensagem: sempre `Senha inválida.` (pt-BR/en/es pela tabela `$Copy` existente); sem dica, sem diferenciar senha errada de hash malformado, exceto uma mensagem genérica separada `Instalador de teste inválido.` para hash malformado (não revela nada secreto).
- Modos silenciosos/não interativos (`--silent`, argumento `install`): com a trava ativa são negados com código 4. A senha nunca é aceita por argv nem por variável de ambiente (processos filhos como `docker compose` herdam o ambiente e a lista de processos expõe argv).
- `Validar-SubaruShogun.ps1`: nenhuma mudança na forma de abrir o instalador. Ele abre a janela do instalador; o dono digita a senha lá; o script não pede, não recebe e não registra a senha. Acrescentar às instruções na tela: "o instalador pede a senha de teste na janela dele; não a digite nesta janela nem a envie no relatório". Contrato: o script não tem parâmetro `-Senha`/`-Password` nem `-AsSecureString`.

Como o dono gera o hash (sem senha no histórico nem na lista de processos):

- Linux/macOS/Windows com Node: um auxiliar novo `apps/infra/scripts/gen-test-password-hash.mjs` (a ser feito pelo `@dev`) pergunta no terminal com eco desligado, usa `pbkdf2Sync` do `node:crypto` e imprime só a linha do hash. Rodar `node apps/infra/scripts/gen-test-password-hash.mjs`.
- Windows PowerShell: um auxiliar `apps/infra/scripts/windows/Gerar-HashSenhaTeste.ps1` com a mesma lógica (`Read-Host -AsSecureString`, `RandomNumberGenerator`, o construtor acima); os dois auxiliares devem gerar hashes intercambiáveis (teste de contrato).
- Cadastro: `gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test` (a CLI pergunta o valor; ou canalizar a saída do auxiliar para `gh secret set ... --env windows-owner-test` sem `--body`).

### D-T3. Workflow

Arquivo `.github/workflows/test-windows-owner.yml`, só na `test/windows-owner`. Nome da execução e do rascunho: `test-windows-<run_id>`.

1. Gatilhos: `push` (branch `test/windows-owner`, `paths: ['.github/test-windows-owner.trigger']`) e `workflow_dispatch: {}`.
2. `permissions: {}` no nível do workflow; `concurrency: { group: test-windows-owner, cancel-in-progress: false }`; `timeout-minutes: 15`.
3. Um único job `build-and-draft` com `environment: windows-owner-test` e `permissions: { contents: write }`. Um job só, sem separar construir/publicar: artefato de Actions de repositório público pode ser baixado por qualquer conta logada do GitHub e o `.bat` embute o hash. Portanto: nada de `upload-artifact` do instalador.
4. Passos: checkout com `persist-credentials: false` (SHA fixado, igual ao `release.yml`); `setup-node` `24.20.0`; `npm ci --ignore-scripts`; resolver e fixar o digest da imagem como o `release.yml` faz (`imagetools inspect --raw`), imagem `v0.3.0-0d0b595-beta`; empacotar com `node apps/infra/scripts/package-installer.mjs --platform windows --image-tag "$IMAGE_REF" --password-hash-env TEST_INSTALLER_PASSWORD_HASH --output "$RUNNER_TEMP/owner-test"`, com `TEST_INSTALLER_PASSWORD_HASH` vindo de `${{ secrets.TEST_INSTALLER_PASSWORD_HASH }}` somente no `env:` desse passo; `sha256sum` do `.bat`; o passo final roda `gh release create "test-windows-$GITHUB_RUN_ID" <bat> <sha256> --draft --prerelease --target "$GITHUB_SHA" --title "TESTE (privado, não compartilhar) $GITHUB_RUN_ID" --notes "..."` com `GH_TOKEN` somente no `env:` desse passo.
5. Higiene de segredo: nenhum `echo`/`cat`/`set -x` do Secret nem do `.bat`; o Secret já é mascarado automaticamente pelo GitHub, então não o imprima só para chamar `::add-mask::`; mascarar apenas fragmentos derivados (campos de sal e hash) com `printf '::add-mask::%s\n'` com o rastreio do shell desligado; entradas do usuário (nenhuma prevista) nunca interpoladas em `run:` por `${{ }}`.
6. Nome do rascunho: a tag `test-windows-<run_id>` não casa com nenhum workflow disparado por tag (não existem) e não é criada enquanto a release é rascunho. O corpo da release não pode conter o hash.
7. Limpeza: o dono apaga o rascunho com `gh release delete test-windows-<run_id> --cleanup-tag --yes` (ou pela web) e a branch ao fim do ciclo de teste. O Secret do Environment se apaga com `gh secret delete TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test`. Para rotacionar, repetir a geração com outra senha.

### D-T4. Limites honestos

- Quem tem escrita vê o rascunho; a senha é só a segunda trava para o caso de o arquivo sair desse círculo.
- O hash fica embutido no `.bat`; quem tem o arquivo pode atacá-lo offline. O PBKDF2 (600000 iterações) encarece o ataque; a defesa real é senha longa e aleatória (pelo menos 16 caracteres ou frase de 5 palavras). O limite de tentativas é atrito, não segurança: o arquivo pode ser editado.
- Quem lê o `.bat` pode remover a trava editando-o. A trava protege contra uso acidental ou casual, não contra quem insiste.
- O instalador de teste baixa a mesma imagem pública `ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:v0.3.0-0d0b595-beta`; a trava protege a instalação, não a imagem.
- A branch e o arquivo do workflow são públicos (o repositório é público); só o Secret e o rascunho são privados. O código do workflow de teste não pode conter segredo nem caminho privado.
- Se o amigo streamer precisar do arquivo, o dono baixa o ativo e repassa; a senha vai por outro canal.

### D-T5. Plano de testes

Ordem Red depois Green: testes primeiro, cada um falhando pelo motivo esperado antes da implementação.

1. Contrato (`node:test`, no estilo de `tests/unit/windows-installer-contract.test.js`):
   - O marcador aparece exatamente uma vez no `installer.ps1`; o `package-installer.mjs` o substitui em todo build; build oficial resulta em valor vazio e nenhuma mudança de comportamento.
   - A trava fica depois de `Parse-CommandLine` e antes de `Prompt-Language`; usa `-AsSecureString`; nenhum `Write-Host`/`Out-File`/`Set-Content` da variável da senha; a comparação é por acúmulo de XOR, nunca `-eq`/`-ceq` nos hashes; nenhum uso de `QUEUEBOT_TEST_MODE` para pulá-la.
   - Empacotador: rejeita hash malformado, aceita só origem por ambiente; nenhuma opção `--password`.
   - Workflow: só `test/windows-owner`; `persist-credentials: false`; `permissions: {}` no topo e `contents: write` só no único job; sem `upload-artifact`; sem `echo`/`set -x` do Secret; `timeout-minutes` e `concurrency` presentes; ações fixadas por SHA; `gh release create` com `--draft --prerelease`; segredos só em `env:` de passo.
   - `Validar-SubaruShogun.ps1`: sem parâmetro de senha, sem `-AsSecureString`.
2. Mutação (no estilo de mutação do repositório): remover a chamada da trava; trocar a comparação por `-eq`; iterações igual a 1; pular a trava em `TestMode`; segunda ocorrência do marcador; tirar `--draft`; `persist-credentials: true`; acrescentar `upload-artifact`; mover `contents: write` para o nível do workflow. Cada mutante deve quebrar ao menos um teste.
3. Container `pwsh` descartável (como em `windows-installer-paths-contract.test.js`): senha correta avança; senha errada três vezes sai com 4 e só a mensagem genérica; hash malformado ou não substituído nega; `--silent` negado; senha-isca nunca aparece em stdout, stderr, na pasta de instalação nem em qualquer arquivo do diretório de trabalho; hash gerado pelo auxiliar Node é aceito pela trava PowerShell (interoperabilidade).
4. Não testável aqui (dono/Windows): particularidades do Windows PowerShell 5.1 (disponibilidade do construtor, `Add-Type` de recuo abaixo de 5 s), a pergunta na janela do `.bat` na máquina Windows 10 real.

## 3. Critérios de aceite (para o `@dev`)

- AC-T1: o `installer.ps1` tem a trava conforme D-T2; builds oficiais ficam idênticos exceto pelo padrão vazio e continuam passando nos testes existentes do instalador.
- AC-T2: o `package-installer.mjs` aceita `--password-hash-env <NOME>`, valida o formato, falha fechado e nunca imprime o hash.
- AC-T3: a senha nunca é gravada em disco, log, relatório, argv nem ambiente; o `Validar-SubaruShogun.ps1` não a pede nem a registra.
- AC-T4: os auxiliares (`.mjs` e `.ps1`) geram hashes intercambiáveis sem ecoar a senha.
- AC-T5: o workflow cumpre D-T3 e roda somente pela opção escolhida (C por padrão).
- AC-T6: existem os testes dos itens 1 a 3 de D-T5, falham primeiro (Red) e depois passam (Green); o conjunto de mutação mata todos os mutantes.
- AC-T7: documentação en e pt-BR (como gerar o hash, cadastrar o Secret, executar, baixar, apagar o rascunho), incluindo os limites de D-T4.

## 4. O que o `@qa` valida e o que depende do dono

`@qa`: baterias completas de contrato, mutação e container; lint, typecheck e quality gates; varredura de vazamento (árvore do repositório, payload decodificado do `.bat` gerado, log da execução do Actions, corpo e nomes de ativos do rascunho: sem senha, sem hash, sem URL de sessão, sem token); confirmar que o build oficial não mudou; conferir que nenhum `upload-artifact` carrega o `.bat` de teste.

Dono: criar o Environment `windows-owner-test` (revisor obrigatório = dono; branch de implantação `test/windows-owner`); escolher a senha (longa e aleatória); gerar o hash localmente e cadastrar `TEST_INSTALLER_PASSWORD_HASH` como Secret do Environment; aprovar a execução; testar no Windows 10 e devolver o log; apagar o rascunho e o Secret depois. O `@devops` cria a branch e o arquivo do workflow só depois da escolha do dono em D-T1.

## 5. Resumo de riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Opção A falha (workflow não registrado fora da `main`) | execução perdida | comprovar com execução trivial antes; padrão é C |
| Hash extraído do `.bat` e quebrado offline | trava contornada | PBKDF2 600000, senha longa e aleatória, rotacionar após o teste |
| Vazamento por `upload-artifact` | download público do `.bat` | job único, sem artefato (contrato + QA) |
| Segredo em log | divulgação | só em `env`, mascarado, sem echo, varredura do log pelo QA |
| Push de outro colaborador dispara o job | minutos gastos ou rascunhos inúteis | guarda de ator, aprovação do Environment, Secret restrito à branch |
| PR da branch de teste para a `main` | dispara o `ci.yml`, confunde o histórico | regra do dono: nunca abrir; contrato de que a branch serve só a este fim |
| `Add-Type` ou construtor ausente em Windows PowerShell antigo | dono não passa pela trava | laço C# de recuo; checagem manual no Windows |

## 6. Lacunas para o `@analyst` (o arquiteto não tem internet)

- L1: documentação oficial do GitHub sobre `workflow_dispatch` exigir o workflow na branch padrão, o erro exato do `gh workflow run`, e se um arquivo presente só em branch não padrão pode ser disparado (citar página e data; confirmar com um teste trivial na branch).
- L2: regras de proteção de Environment em repositórios públicos: revisores obrigatórios, restrição de branch de implantação, Secrets de Environment, autorrevisão e limites por plano.
- L3: se artefatos e ativos de rascunho de release de repositório público são visíveis a quem não é colaborador (confirmar que rascunho é só para escrita e artefato é público a contas logadas).
- L4: orientação atual da OWASP sobre iterações de PBKDF2-HMAC-SHA256, e builds do Windows 10 com .NET Framework anterior à 4.7.2 (`Rfc2898DeriveBytes` com `HashAlgorithmName`).
- L5: comportamento de `gh release create --draft` com `--target` (momento da criação da tag) e do `gh secret set --env` quanto à entrada (stdin versus pergunta).

Registrar estas como LACUNA no `docs/research-index.md` quando o analista entregar.
