# Reescrever o histórico do Git com segurança e auditar o conteúdo dos commits (nota de pesquisa)

[English](../../../research/2026-11-06-git-history-rewrite/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-05 (pasta datada 2026-11-06 a pedido do coordenador). Branch: `docs/post-cutover-docs`.
- Rótulos: **VERIFICADO** (página oficial lida nesta sessão ou medido no repositório), **PARCIAL** (fonte incompleta ou secundária), **NÃO VERIFICADO** (inferência, sem confirmação).
- Escopo: só pesquisa e recomendação. Nenhum histórico foi reescrito, nenhum remoto foi tocado, nenhuma chamada `gh` foi feita. Só comandos de leitura (`git log`, `git rev-list`, `git for-each-ref`, `which`).
- Pedido do dono (2026-11-05): usar o capítulo "Rewriting History" do Pro Git para reescrever o histórico; os hashes podem mudar; **o conteúdo dos arquivos não**. O objetivo é permitir que o coordenador audite o que já existe.

## 1. Resumo executivo

1. **Auditar não exige reescrever.** Todas as técnicas abaixo são de leitura (`git log -S/-G`, `git grep` em revisões, scanners). Audite primeiro; reescreva só o que a auditoria achar.
2. **Uma primeira auditoria já rodou (só leitura, nesta sessão).** Em `origin/main` (`cb0c604`, 207 commits, 22 merges): 0 commits com trailer `Claude-Session` ou URL de sessão na mensagem, 0 ids de sessão no conteúdo de qualquer arquivo, 0 acertos para formatos comuns de token, e nenhum `.env`/chave já adicionado, exceto os dois `.env*.example`. O domínio literal `claude.ai/code` aparece em 5 commits, em `AGENTS.md`, `CLAUDE.md` e documentos de handoff/QA gate que descrevem a proibição (sem id). Os 52 commits com trailer existem **somente** em dois branches locais de backup (`backup/pre-scrub-2026-10-29` e `backup/remote-before-history-fix-local`; 63 e 13 commits que não estão no `origin`). Limites na seção 5.
3. **O próprio Pro Git manda não reescrever histórico já publicado e diz que o `filter-branch` "não é mais a forma recomendada"**; ele aponta o `git-filter-repo`. Em repositório público com PRs mergeados, use `git filter-repo`, nunca `filter-branch` e nunca `rebase -i` na `main`.
4. **Reescrever no GitHub nunca é total.** Depois do push forçado, os SHAs antigos continuam acessíveis por `refs/pull/*`, forks e visualizações em cache até o Support do GitHub limpar. Reescrever **não** é controle de segurança; para um segredo, gire a credencial primeiro.
5. **Ordem com a release pendente:** se houver reescrita, faça-a **antes** de criar a tag, porque o nome `v0.3.0-<hash>-beta` deriva do hash da `main`.
6. **Caminho recomendado:** (a) auditar agora, (b) reescrever só diante de um achado concreto, com `git filter-repo` em clone novo, (c) nenhum squash ou reorganização geral.

## 2. Capítulo do Pro Git, comandos exatos (VERIFICADO, https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History, lido em 2026-11-05)

| Objetivo | Comando |
|---|---|
| Corrigir o último commit (mensagem ou conteúdo) | `git commit --amend` (`--no-edit` mantém a mensagem) |
| Editar um intervalo | `git rebase -i HEAD~3` (argumento = pai do commit mais antigo a editar) |
| Verbos do script do rebase | `pick`, `reword`, `edit`, `squash`, `fixup`, `drop`, `exec`, `break`, `label`, `reset`, `merge` |
| Parar em um commit | trocar `pick` por `edit`, depois `git commit --amend` e `git rebase --continue` |
| Reordenar / apagar | reordenar as linhas; apagar a linha ou usar `drop` |
| Juntar | `squash` (une mensagens) ou `fixup` (descarta a mensagem) |
| Dividir um commit | marcar `edit`, depois `git reset HEAD^`, `git add`/`git commit` em partes, `git rebase --continue` |
| Abortar / recuperar | `git rebase --abort`; `git reflog` |
| Remover um arquivo de todos os commits | `git filter-branch --tree-filter 'rm -f passwords.txt' HEAD` (`--all` para todos os branches) |
| Trocar e-mail em tudo | `git filter-branch --commit-filter '...git commit-tree "$@"...' HEAD` |

Avisos citados pelo capítulo:

- "since so much work is local within your clone, you have a great deal of freedom to rewrite your history locally. However, once you push your work, it is a different story entirely, and you should consider pushed work as final unless you have good reason to change it."
- `amend` e `rebase` mudam os SHA-1; não inclua commits já enviados a um servidor central.
- "deleting or altering a commit will cause the rewriting of all the commits that follow it."
- O `filter-branch` "has many pitfalls, and is no longer the recommended way to rewrite history. Instead, consider using `git-filter-repo`." O capítulo também diz para não usá-lo "unless your project isn't yet public and other people haven't based work off the commits you're about to rewrite." Nosso repositório é público: é exatamente o caso do aviso.
- Dois detalhes que importam aqui: o `rebase -i` achata merges por padrão (esta `main` tem 22 merges de PR do GitHub) e toda reescrita remove assinaturas de commits e tags.

## 3. `git filter-repo` (VERIFICADO, manual em https://github.com/newren/git-filter-repo, `Documentation/git-filter-repo.txt`, lido em 2026-11-05)

Quando usar: qualquer reescrita programática do repositório inteiro (remover caminho de todos os commits, limpar texto em todos os blobs, reescrever e-mails ou mensagens). É a ferramenta que o Pro Git e o GitHub recomendam.

| Necessidade | Comando |
|---|---|
| Medir antes (sem alterar) | `git filter-repo --analyze` (relatórios em `.git/filter-repo/analysis/`) |
| Pré-visualizar | `git filter-repo ... --dry-run` (salva os fluxos original e filtrado para comparar) |
| Remover caminhos de todo o histórico | `git filter-repo --path <p> --invert-paths` (também `--path-glob`, `--path-regex`) |
| Manter só alguns caminhos | `git filter-repo --path <p>` (sem `--invert-paths`) |
| Limpar texto em todas as versões de arquivo | `git filter-repo --replace-text expressions.txt` |
| Limpar texto em mensagens de commit/tag | `git filter-repo --replace-message expressions.txt` |
| Corrigir autor/committer | `git filter-repo --mailmap <arquivo>` (ou `--use-mailmap` para o `.mailmap`) |
| Edições programáticas | `--commit-callback '<corpo Python>'`, `--blob-callback`, `--tag-callback` (bytestrings, `b"..."`) |
| Só algumas refs | `--refs <refs>` (implica `--partial`; desliga expiração do reflog e o gc: evitar) |
| Modo de remoção de segredo | `--sensitive-data-removal` (alias `--sdr`; exige git-filter-repo 2.47+; busca todas as refs; `--no-fetch` pula essa etapa) |

Sintaxe do `--replace-text` (uma regra por linha): `literal:` (padrão), `glob:`, `regex:`; `==>` define a substituição (padrão `***REMOVED***`); regex e glob valem para o arquivo inteiro sem flags (`(?m)` para âncoras de linha). Exemplo: `regex:session_[A-Za-z0-9]{20,}==>REMOVED`.

Comportamentos que importam para nós (VERIFICADO):

- **Exige clone novo.** Aborta se o repositório não parecer recém-clonado; para origem local use `git clone --no-local`. O `--force` ignora a checagem, e o manual diz: "It is a really bad idea to get in the habit of always specifying `--force`."
- **Remove o remoto `origin`** para evitar push acidental; só recoloque com `git remote add origin <url>` quando estiver pronto.
- **Reescreve hashes (abreviados) dentro das mensagens de commit** para os novos (mesmo comprimento); `--preserve-commit-hashes` desliga isso. Hashes escritos **dentro de arquivos** (docs, handoffs) não são alterados.
- **Assinaturas são removidas** de commits e tags.
- **Mapas de rastreabilidade:** `.git/filter-repo/commit-map` (`old new`, zeros = removido), `ref-map`, `changed-refs`, `first-changed-commits`. Substituem o trabalho manual dos `.local/hash-map-*.tsv`.
- Commits que **ficam** vazios são podados (`--prune-empty auto`), então a contagem pode cair.
- Verificação depois da reescrita: `git log -S"<texto>" --all -p --` não deve imprimir nada; com o servidor limpo, `git cat-file -t <primeiro commit alterado>` deve falhar.
- Instalação (VERIFICADO, INSTALL.md): um único arquivo Python 3, `python3 git-filter-repo`, ou `git filter-repo` se estiver no `$PATH`; também `pipx install git-filter-repo`. Última release lida: v2.47.0 (a página mostra "04 Dec" sem ano; PARCIAL). **Não está instalado aqui** (`which git-filter-repo`: nada). O Git local é 2.43.0.

## 4. Lado do GitHub (VERIFICADO, https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository, lido em 2026-11-05)

- Ordem do GitHub: **revogar/girar** (pode dispensar a reescrita) -> reescrever local -> verificar -> `git push --force --mirror origin` -> avisar colaboradores -> acionar o Support se preciso.
- **Continua acessível após o push forçado:** forks (o commit permanece lá), visualizações em cache por SHA e pull requests que referenciam os commits, incluindo `refs/pull/*`. Essas refs são somente leitura, então o push nelas falha; outras falhas costumam indicar proteção de branch a levantar temporariamente.
- O **Support** pode apagar ou desreferenciar PRs, rodar coleta de lixo no servidor, remover visualizações em cache e limpar objetos LFS. Envie: dono/repositório, número de PRs afetados e os "First Changed Commit(s)" do filter-repo. Só ajuda quando girar a credencial não basta, e **não** limpa texto sensível citado em corpo ou comentário de PR.
- A reescrita muda hashes e remove assinaturas. Faça merge ou feche os PRs abertos antes.
- **Ruleset `main-pr-and-ci`** (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets): a regra "Block force pushes" vem ligada por padrão e bloqueia todos fora da lista de bypass; "Require status checks" e a exigência de PR também rejeitariam um push direto. O bypass pode ser dado a um papel (ex.: administrador do repositório), equipe ou app, no modo "Always allow" ou "For pull requests only" (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository); a aplicação pode alternar entre Active/Disabled sem apagar o ruleset (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets). Duas formas de empurrar: (1) adicionar o dono como ator de bypass com "Always allow" durante a janela e remover depois; (2) pôr a aplicação em Disabled na janela e voltar a Active. **Prefira (1)** (a janela fica restrita a um ator e a proteção segue ligada para os demais). A lista de regras do repositório não foi lida (acesso ao GitHub proibido); se o ruleset tem regra non-fast-forward é NÃO VERIFICADO. Só o dono (admin) altera rulesets; o `@devops` não pode se autorizar.
- Tags: ainda não existe tag, então não há o que apagar ou reapontar. A reescrita de 2026-10-29 já deixou SHAs antigos acessíveis no GitHub; uma segunda reescrita acrescenta um segundo conjunto.
- Não encontrado nas páginas oficiais lidas: como a página de um PR mergeado aparece quando seus commits somem (NÃO VERIFICADO; esperar o PR continuar "merged" com os SHAs antigos servidos por `refs/pull/N/*`).

## 5. Auditar o conteúdo de todos os commits (só leitura)

### Árvore atual vs histórico

Varrer a árvore de trabalho (`npm run review:static`, OpenGrep) só enxerga a última versão de cada arquivo. Um segredo adicionado e depois apagado fica invisível ali, mas permanece no histórico e em todo clone. Use ferramentas que olham o histórico.

### Técnicas só com Git (sem instalar, nada sai da máquina; VERIFICADO em https://git-scm.com/docs/git-diff e `git-log`)

- `git log --all -S'<texto>' --oneline` acha commits que mudam o **número de ocorrências** de um literal (adição/remoção). `--pickaxe-regex` trata o texto como regex.
- `git log --all -G'<regex>' --oneline` acha commits cujas linhas do patch (adicionadas ou removidas) casam com a regex. Uma ocorrência movida aparece no `-G`, não no `-S`. Acrescente `-p`, `--name-only` ou `--pickaxe-all` para ver o que mudou.
- Mensagens: `git log --all -i --grep='<regex>' --format='%h %s'` (`-S/-G` não cobrem mensagens).
- Nomes: `git log --all --diff-filter=A --name-only --format=` lista todo caminho já adicionado (achar `.env`, chaves, dumps).
- Autores: `git log --all --format='%an <%ae>' | sort | uniq -c`.
- Todas as revisões: `git rev-list --all | xargs -n 50 git grep -I -n -E '<regex>'` (lento em repositório grande; o `-G` costuma bastar).
- Tamanho/atípicos: `git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort -k3 -n -r | head` ou `git filter-repo --analyze`.

### Medido aqui (nesta sessão, VERIFICADO por comando)

| Checagem | `origin/main` (207 commits) | `--all` (276 commits) |
|---|---|---|
| Trailer `Claude-Session` ou `claude.ai/code` em mensagens | 0 | 52 (só nos 2 branches locais de backup) |
| `session_[0-9A-Za-z]{20}` em qualquer diff | 0 | 0 |
| `claude.ai/code` em qualquer diff | 5 commits (texto da proibição em `AGENTS.md`, `CLAUDE.md`, QA gates, handoffs; sem id) | 6 |
| Formatos `ghp_`, `github_pat_`, `sk-`, `AKIA`, `xox*-`, `BEGIN ... PRIVATE KEY`, `oauth:` | 0 | 0 |
| Caminhos já adicionados com `.env`, `.pem`, `.key`, `id_rsa` | só `.env.example`, `.env.product.example` | igual |
| Identidades de autor | 3 (duas grafias da pessoa e `GitHub <noreply@github.com>` em 60 commits de merge/squash) | igual |

Limites: a lista de regex é uma amostra, não um scanner de segredos (sem entropia, sem formato de client secret da Twitch nem de URL de banco, sem conteúdo codificado em base64, binários ignorados pelo `-G`). O clone local tem 8283 objetos alcançáveis, 8,9 MiB empacotados. Pendências: formatos de client secret/EventSub secret da Twitch, `postgresql://usuario:senha@` e capturas de tela/binários (acrescentar regras no passo 2 da seção 6).

### Scanners (rodam na máquina)

| Ferramenta | Só local? | Instalada aqui | Observações |
|---|---|---|---|
| pickaxe do `git` (acima) | sim | sim (2.43.0) | base, cobre padrões próprios |
| OpenGrep (`opengrep`, `npm run review:static`) | sim | sim (`~/.local/bin/opengrep`) | só árvore, não histórico; revisões antigas só dando checkout (não recomendado) |
| `gitleaks git <repo> --report-format json --report-path <arquivo>` (VERIFICADO, https://github.com/gitleaks/gitleaks) | sim (regex/entropia; a página não descreve uso de rede nem afirma modo offline: PARCIAL) | **não** | `--redact` oculta valores na saída; `.gitleaks.toml` adiciona regras (`[extend] useDefault = true`); código de saída 1 com achados; varre o histórico via `git log -p` |
| `trufflehog git file://<repo> --no-verification --json` (VERIFICADO, https://github.com/trufflesecurity/trufflehog) | **só com `--no-verification`**: a verificação padrão chama a API do provedor para testar cada credencial | **não** | não rodar com verificação ligada; relatório em JSON |
| `git filter-repo --analyze` | sim | **não** | tamanhos e caminhos, não segredos |

Instalar scanner é decisão de dependência. gitleaks e trufflehog têm binário único nas releases do GitHub (PARCIAL: as páginas listam Homebrew, Docker, binários de release e compilação). Mantenha o binário dentro do projeto (por exemplo `.local/tools/`, já ignorado pelo Git) e confira o checksum da release. **A aprovação da dependência é do dono.**

Relatórios: gravar a saída dos scanners em pasta ignorada pelo Git (`.local/history-audit/`), com valores ocultos; comitar só o resumo (contagens, hashes curtos, caminhos), nunca os valores do segredo.

## 6. Recomendação

### Comparação de estratégias

| Opção | O quê | Risco | Veredito |
|---|---|---|---|
| (a) Só auditar | Seção 5, sem reescrever | nenhum para o histórico | **Fazer agora.** Atende à necessidade real do dono. |
| (b) Reescrita pontual | `git filter-repo --replace-text/--replace-message/--invert-paths` só para achados confirmados | médio: todos os hashes a partir do primeiro commit alterado mudam; SHAs antigos seguem acessíveis no GitHub | **Só se o (a) achar algo.** |
| (c) Squash/reorganização | `rebase -i`, squash, reordenar, dividir | alto: perde a trilha commit a commit e a estrutura dos 22 merges de PR, reescreve todo hash, sem ganho de segurança, `rebase -i` achata merges, conflitos se acumulam | **Não recomendado.** Se o dono quiser histórico "limpo" por legibilidade, é decisão separada com story própria. |

### Passos (numerados, com pré-condições)

1. **Decidir o objetivo (dono).** Só auditar, ou auditar e limpar os achados. Pré-condição: o dono leu as seções 1 e 4 (reescrever não faz os SHAs antigos sumirem do GitHub).
2. **Rodar a auditoria de leitura** (técnicas da seção 5) a partir de um checkout limpo; guardar a saída bruta em `.local/history-audit/` (ignorada). Pré-condição: nenhuma. Acrescentar padrões do projeto: client secret/EventSub secret da Twitch, `DATABASE_URL`/`postgresql://` com senha, cabeçalhos `Authorization:`, valores de UID, a forma da URL de sessão. Opcional, com aprovação do dono: binários do gitleaks (e do trufflehog com `--no-verification`) em `.local/tools/`.
3. **Triar os achados.** Para cada um: é segredo real? Se sim, **girar/revogar primeiro**; o que não for segredo (como o texto da proibição) fica como está. Registrar contagens e hashes curtos no resumo da auditoria. Pré-condição: relatório do passo 2.
4. **Se nenhum achado exigir reescrita, parar.** Criar a tag da release a partir da `main` atual. Fim.
5. **Se a reescrita se justificar, preparar (o dono escolhe a janela).** Pré-condições: nenhum PR aberto (mergear ou fechar), a correção de release do `@qa` mergeada ou salva como patch, o dono disponível para ajustar o ruleset e nenhuma tag criada ainda.
6. **Backup (duas cópias, ambas dentro do projeto e ignoradas pelo Git).** `git clone --mirror <url do origin> .local/history-rewrite/backup-AAAAMMDD.git` (todas as refs, incluindo `refs/pull/*`), além de manter o clone local atual intacto. Não apague os branches locais `backup/*` sem OK do dono; eles ainda carregam os trailers com a URL antiga (ver abaixo).
7. **Reescrever em clone novo, não neste worktree.** `git clone --no-local <este repositório ou origin> .local/history-rewrite/work` (um clone do `origin` não traz os branches `backup/*`, o que é desejado). Instalar o `git-filter-repo` em `.local/tools/` (arquivo único, versão >= 2.47, com aprovação do dono). Preparar o `expressions.txt`. Rodar `python3 .local/tools/git-filter-repo --analyze` e depois o comando real com `--dry-run` antes. Comandos típicos: `--replace-text expressions.txt`, `--replace-message expressions.txt` ou `--path <arquivo> --invert-paths`.
8. **Verificar o conteúdo, não só os hashes.** Pré-condição: passo 7 concluído. Checar: (i) `git log -S"<texto>" --all -p --` não imprime nada; (ii) comparar as árvores finais: `git diff <main antiga> <main nova> --stat` deve mostrar só os arquivos pretendidos (regra do dono: o conteúdo é o que importa); (iii) `git rev-list --count` antigo vs novo, usando `.git/filter-repo/commit-map` para o mapa antigo->novo; (iv) rodar os gates do projeto (`npm ci`, lint, typecheck, `npm test`, `review:static`) na nova ponta pelo `@qa`, como em qualquer release. Sem isso, sem push forçado.
9. **Atualizar referências a hash.** `docs/**` que citam hashes (achar com `git grep -nE '\b[0-9a-f]{7,40}\b'`), corpos de issues e mapas em `.local`. O filter-repo só corrige hashes em mensagens de commit; o conteúdo de arquivos exige um commit de ajuste feito a partir do `commit-map`. O `@devops` atualiza o corpo das issues (nunca comentários). Pré-condição: passo 8.
10. **Push forçado (dono + `@devops`).** O dono adiciona um ator de bypass temporário em `main-pr-and-ci` (modo "Always allow"), o `@devops` recoloca o `origin` e roda `git push --force --mirror origin` (falhas em `refs/pull/*` são esperadas e inofensivas), o dono remove o ator de bypass. Pré-condição: passo 8 PASS do `@qa`; backups existem. Prefira `--force-with-lease` por branch se o push espelho não for necessário.
11. **Limpar o lado do servidor (opcional, o dono decide).** Se houve dado sensível, abrir pedido ao Support do GitHub com os "First Changed Commit(s)" e os números dos dois PRs mergeados (#101, #110). Se foi só estético, aceitar que os SHAs antigos seguem acessíveis (como após 2026-10-29).
12. **Tag depois da reescrita.** Rodar a release só agora, para que `v0.3.0-<hash novo>-beta` corresponda à `main` final. Pré-condição: ruleset restaurado; o check `CI quality gates / Required quality gate` verde na nova `main` (um push forçado de árvore igual ainda exige o CI para PRs futuros).
13. **Refazer todos os outros clones** (clonar de novo; não faça rebase dos branches antigos sobre a nova `main`, ou os commits antigos voltam). Recriar os branches de trabalho a partir da nova `main` e usar cherry-pick via `commit-map` se preciso.

### Interações com este projeto

- **PR #101 e #110 (mergeados):** o GitHub mantém as páginas dos PRs e `refs/pull/N/*` apontando para os commits antigos; os PRs seguem legíveis, mas seus SHAs deixam de coincidir com a `main`. NÃO VERIFICADO como a interface os rotula; o Support pode desreferenciar se desejado.
- **Issues e docs que citam hashes:** apontarão para SHAs antigos que ainda resolvem no GitHub via refs de PR (PARCIAL), mas não na nova `main`; planejar uma rodada de atualização (passo 9).
- **Tag da release:** o `release.yml` nomeia a tag pelo hash da `main`; reescrever antes da tag (passo 12). Não tocar nos arquivos do `@qa` (`release.yml`, teste de contrato do shell, QA gate) neste trabalho.
- **Branches locais `backup/*`:** guardam os 52 commits com trailer e ficam de fora de um clone novo do `origin`. Mantê-los como o dono já decidiu (nota D-15: dois backups locais com a URL ficam até o OK do dono), fora de qualquer push. Nunca enviá-los.
- **Assinaturas:** 60 commits foram gerados pelo GitHub; assinaturas web-flow (se houver) se perdem na reescrita. NÃO VERIFICADO se algum commit é assinado.

### O que depende do dono

1. O objetivo (só auditar vs reescrever achados); se uma reescrita que muda hashes é aceitável com a release pendente.
2. Aprovar a instalação do `git-filter-repo` e, opcionalmente, dos binários gitleaks/trufflehog (decisão de dependência) e a versão fixada.
3. Ajustar o ruleset `main-pr-and-ci` na janela do push forçado (só admins) e restaurá-lo.
4. Contatar o Support do GitHub após o push (conta do dono).
5. Manter ou remover os branches locais `backup/*` que ainda contêm a URL antiga.

## 7. Autoavaliação (rubrica, alvo >= 9,0)

| Critério | Nota | Base |
|---|---|---|
| Fontes oficiais | 9,5 | Capítulo do Pro Git, manual e INSTALL do `git-filter-repo`, docs do GitHub (remoção, rulesets), docs do pickaxe do git-diff, READMEs do gitleaks/trufflehog, todos lidos |
| Evidência | 9,0 | Contagens medidas em `origin/main` e `--all`; lacunas rotuladas (regras do ruleset não lidas, interface do PR mergeado, trufflehog offline) |
| Aderência ao caso | 9,5 | Repositório público, ruleset, tag pendente, PRs mergeados, backups locais, tag com hash da release |
| Segurança do procedimento | 9,0 | Backups, clone novo, dry-run, diff de conteúdo, gate do QA, janela de bypass, girar primeiro; a ordem do push forçado não foi testada neste repositório |
| Mensurabilidade | 9,0 | Cada passo tem verificação (`git log -S` vazio, diff de árvore, commit-map, CI verde, `git cat-file -t` falha) |
| **Geral** | **9,2** | |

## 8. Limitações

- Sem acesso à API do GitHub (por instrução): conteúdo do ruleset, número de forks, comportamento dos PRs após a reescrita e prazo do Support não foram checados.
- A data da release do filter-repo não tem ano; use a versão do arquivo instalado.
- Os scanners não estão instalados aqui; o comportamento offline deles está documentado só em parte (a verificação do trufflehog é a chamada de rede, VERIFICADO; o uso de rede do gitleaks não é declarado, PARCIAL).
- A auditoria medida por regex é amostra, não uma varredura completa de segredos.

## 9. Próximos passos

- `@aiox-master`: decidir o passo 1 com o dono; se for (a), delegar o passo 2 ao `@qa` (comandos de leitura) com os padrões acima.
- `@devops`: só após o OK do dono, passos 6, 10, 11 e a atualização do corpo das issues.
- `@dev`: nenhuma mudança de código para a auditoria; só a atualização de referências a hash do passo 9 se houver reescrita.
