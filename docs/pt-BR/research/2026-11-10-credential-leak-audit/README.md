# Vazamento de credenciais pela opção "don't ask again" do Claude Code: resumo do artigo e auditoria do repositório (nota de pesquisa)

[English](../../../research/2026-11-10-credential-leak-audit/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-10. Branch na auditoria: `main` (`dcfe3da`).
- Rótulos: **VERIFICADO** (lido nesta sessão ou medido no repositório), **PARCIAL** (fonte secundária ou incompleta), **NÃO VERIFICADO** (inferência).
- Escopo: pesquisa e auditoria somente leitura. Nenhum arquivo versionado foi alterado, nada foi commitado, nada foi escrito no GitHub. Nenhum valor de segredo aparece nesta nota; os achados aparecem só como arquivo, linha ou número, padrão e máscara (`****`). O `~/passwd.txt` **não** foi lido.
- Pedido do dono (2026-11-10): ler o artigo do CISO Advisor e dizer se as credenciais dele foram empurradas para o repositório.

## 1. Veredito

**NENHUMA credencial real encontrada** (confiança: alta para os formatos varridos, moderada no geral; veja a seção 6).

- Nenhum `.claude/settings.local.json` existiu em qualquer dos 225 commits do repositório (todas as refs). Ele é ignorado pela linha 36 do `.gitignore` e não está versionado.
- O único `.claude/settings.json` versionado tem 31 bytes (`{"language": "portuguese"}`) e uma só revisão. Não tem regras `permissions.allow`, então o mecanismo do artigo não pode ter gravado um comando ali.
- Nenhum segredo de GitHub, OpenAI, AWS, Slack, `live_` da Twitch, OAuth, JWT, chave privada, Bearer ou Authorization foi achado no histórico, em 55 corpos de PR, 63 corpos de issue, nas notas da release ou nos três artefatos da release.
- Todo achado com formato de credencial é placeholder, fixture de teste ou string de banco de teste descartável (seção 4).
- O Client ID/Secret da Twitch não está no repositório (fica no volume do banco de desenvolvimento) e o dono já os rotacionou, então mesmo um vazamento antigo hipotético seria inofensivo.

## 2. O artigo e a fonte primária

Artigo: CISO Advisor, "Opção do Claude Code pode vazar senhas e chaves de API no GitHub", página datada de 2026-11-08 (lido com WebFetch; VERIFICADO quanto ao conteúdo).

1. **Funcionalidade:** a opção "Yes, and don't ask again" do prompt de aprovação de comandos do Claude Code. Ela grava o comando aprovado como regra de permissão permanente em `.claude/settings.local.json`, dentro do projeto.
2. **Como vaza:** a regra guarda o texto do comando. Se o comando tinha senha, chave de API, `PGPASSWORD=`, `sshpass -p`, cabeçalho `Authorization` ou string de conexão, o segredo fica em texto puro. O arquivo vaza quando é commitado e enviado a um repositório público do GitHub. O `.claude/settings.json` compartilhado pode ter o mesmo tipo de conteúdo.
3. **Comportamento do Claude Code:** pela documentação da Anthropic (segundo o iTWire), a primeira gravação num repositório Git adiciona o arquivo ao arquivo de exclusões **global** do Git. Isso vale só para a máquina, não acompanha o projeto e não cobre arquivos já versionados nem pastas que viraram repositório depois.
4. **Escala (Apiiro):** 104.185 cópias públicas do arquivo; 1.122 (cerca de 1,1%) com segredos (1.379 valores distintos). Somando histórico, configurações compartilhadas e transcrições: 2.539 segredos em 1.994 repositórios públicos, 63 organizações. Exemplos: chave admin de nuvem, senhas de banco de produção, chaves Supabase, logins SSH.
5. **Lacuna dos scanners:** Gitleaks sinalizou 564 arquivos e TruffleHog 643; 215 passaram por ambos, porque senhas após `PGPASSWORD=`, `sshpass -p` ou em cabeçalhos escapam de padrões genéricos.
6. **Versões:** o artigo **não** cita versão afetada do Claude Code, nem CVE, nem advisory da Anthropic. Não achei resposta da Anthropic (o iTWire diz que nenhuma foi relatada; um issue de agosto de 2025 sobre o mesmo comportamento foi fechado automaticamente em janeiro de 2026).
7. **Mitigação:** girar/revogar primeiro as credenciais expostas (remover o arquivo não apaga histórico, forks nem clones); procurar os dois arquivos nos arquivos atuais e no histórico; `git rm --cached` mais entrada no `.gitignore`; preferir gerenciador de segredos ou variável de ambiente em vez de literal (`VAR=segredo cmd` inline ainda grava o segredo); manter permissões permanentes estreitas; limpar o histórico depois e de forma coordenada.
8. **Fonte primária:** pesquisa da Apiiro de Shmulik Cohen e Matan Giladi, publicada em 2026-11-05 (dados coletados de 1 a 3 de novembro), `https://apiiro.com/blog/coding-agents-leaking-secrets-github-dont-ask-again`. A Apiiro não testou se os segredos ainda funcionam e usou um revisor LLM na própria classificação.
9. **Limitações:** a página da Apiiro e a do The Hacker News responderam HTTP 403 ao WebFetch; os números vêm do artigo do CISO Advisor, de um artigo do iTWire (`https://itwire.com/business-it-news/security/claude-code-approval-files-found-exposing-company-secrets-on-github-says-apirro-researchers`, de 2026-11-07) e de um resumo do WebSearch (PARCIAL). As datas de divulgação variam um ou dois dias entre veículos. O relato de agosto de 2025 também está em `https://claudeissues.com/issue/13106-bug-sensitive-tokens-stored-in-claude-settings-local-json-and-not-ignored-by-git`. Nenhuma declaração oficial da Anthropic foi achada.

## 3. Onde o mecanismo poderia atingir este projeto

| Lugar | Por que importa | Resultado |
|---|---|---|
| `.claude/settings.local.json` | O arquivo do artigo | Nunca commitado; ignorado |
| `.claude/settings.json` | Configuração compartilhada | 31 bytes, só idioma |
| `.claude/agent-memory/**` (17 arquivos versionados), `.claude/agents`, `.claude/commands`, `.claude/hooks`, `.claude/skills` | Texto escrito por agentes; pode ter saída de terminal colada | Varredura do histórico limpa (seção 4) |
| Mensagens e autores de commit | Trailers e metadados | Sem URL de sessão; veja a observação de baixa gravidade |
| Corpos de PR/issue, notas e artefatos da release | Texto público fora do histórico git | Limpo |
| `docs/**` (handoffs, QA gates, stories) | Agentes colam linhas de comando aqui | Só placeholders |
| `.github/**` | Workflows | Só referências a `secrets.GITHUB_TOKEN` (sem valores) |
| `.env*`, `.local/`, dumps, `*.pem`, `*.key` | Arquivos típicos de segredo | Só `.env.example` e `.env.product.example` versionados; sem valores |

## 4. Método e achados

Comandos somente leitura: `git rev-list --all` (225 commits, 8.396 objetos, refs `main`, `origin/main`, `legacy`, tag `v0.3.0-0d0b595-beta`), `git log --all -p -U0` sobre todas as linhas adicionadas (lockfiles excluídos), `git grep`, `git ls-files`, `git check-ignore`, `gh pr list`, `gh issue list`, `gh release view`, `gh release download` (para o `.local/`, ignorado pelo git). Gitleaks e TruffleHog não estão instalados; nada foi instalado. Os scripts ficaram fora do repositório e imprimiram só saída mascarada.

Padrões (linhas adicionadas de todas as revisões): tokens do GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), `sk-`, `AKIA`/`ASIA`, `xox[bpas]-`, `-----BEGIN ... PRIVATE KEY-----`, `live_<dígitos>_<chave>` da Twitch, `oauth:` mais 30 caracteres, URLs com `user:pass@`, `Bearer`, `Authorization:`, formato de client secret da Twitch (30 alfanuméricos após `secret`), atribuições de `access_token`/`refresh_token`/`api_key`/`password`/`stream_key`, `sshpass -p`, `PGPASSWORD=`, `curl -u`, JWT, domínios de e-mail pessoal, caminhos pessoais, URLs de sessão e uma passada de entropia (tokens de 24+ caracteres, entropia a partir de 4,0 bits, linhas de hash e integridade ignoradas).

| Padrão | Ocorrências | Classificação |
|---|---|---|
| GitHub, `sk-`, AWS, Slack, chave privada, `live_`, `oauth:`, JWT, Bearer, Authorization, formato de secret da Twitch, `sshpass`, `PGPASSWORD`, `curl -u` | 0 | nenhuma |
| URL com credenciais | 30 arquivos | Placeholders e strings de banco de teste descartável: `postgresql://queuebot:****@127.0.0.1:...` em `tests/integration/*postgres*.test.js`, `Dockerfile` (`prisma generate` só de build), `apps/frontend/scripts/dev-runtime-config.mjs`; `dev:****@` em testes unitários; repetições em docs. As senhas de 22, 10 e 8 caracteres são feitas de palavras comuns (por exemplo "...-test-password"), não de strings aleatórias. Os docs do `.aiox-core` usam `[PROJECT_REF]` e `postgres:postgres`. O PR #9 usa `test:****@localhost`. |
| Atribuições de token/senha | 6 arquivos | Todas são código lendo variável de ambiente ou fixture literal (`process.env.OBS_WS_PASSWORD`, `temporary-app-token`, `options.password`) |
| Entropia | 18 arquivos | URLs do Prisma/stories, nomes de migration, o vetor de teste de autenticação do OBS WebSocket (entradas `secret`, `salt`, `challenge`), texto de referência de skill. Nenhuma credencial |
| URL de sessão | 0 URLs reais | O `AGENTS.md` linha 146 e 24 docs citam a regra ou a palavra `Claude-Session`, nunca um link real de sessão do Claude. 0 mensagens de commit trazem o trailer ou URL. A issue #104 só nomeia o trailer em texto |
| Dados pessoais (baixa) | veja abaixo | Caminhos `/home/gustavo` ou `/media/gustavo` em 19 arquivos; `~/passwd.txt` citado só como caminho em `docs/session-handoff.md` (en e pt-BR, linhas 98 e 109) e `docs/stories/OPS-15/qa-gate-2026-10-23.md`; sem conteúdo |
| GitHub | 55 PRs, 63 issues, corpo da release, 3 artefatos | 0 segredos. Os artefatos (`.bat`, `.command`, `.sh`) não têm `client_secret`, token nem atribuição de senha |
| Arquivos sensíveis versionados | 0 | `git ls-files` não mostra `.env`, `.local/`, `settings.local.json`, `.pem`, `.key`, `.dump`, `.sqlite`, `.db`. Só os dois `.env*.example`; as chaves com nome de segredo não têm valor |
| Arquivos sensíveis apagados no histórico | 0 | `git log --diff-filter=D` não mostra nenhum |
| `.github/workflows` | 2 referências | Só `secrets.GITHUB_TOKEN` |

Observações de baixa gravidade (não são vazamento de credencial):

1. Dois endereços de autor aparecem nos metadados dos commits: um domínio de e-mail pessoal (público por natureza no git) e um endereço com o nome da máquina em 2 commits (`@OptiPlex-790.local`). Trate como público; não é segredo.
2. O `.gitignore` cobre `.env`, `.env.local`, `.env.*.local`, `runtime-secrets/`, `data/`, `backups/`, `*.dump`, `*.sql`, `*.key`, `*.pem`, `.claude/settings.local.json`, `.local/`, mas **não** `.env.production`, `.env.dev`, `.env.staging`, `secrets.json`, `credentials.json`. Nada assim existe hoje; é uma lacuna de prevenção (veja as recomendações).
3. O caminho `~/passwd.txt` é citado nos docs. Revela só que existe um arquivo de senha na home do dono, fora do repositório. Considere reescrever como "um arquivo local de credenciais".

## 5. Recomendações

1. **Esta auditoria não exige girar credenciais nem reescrever o histórico.** Não reescreva histórico por causa de placeholders. Mantenha o secret rotacionado do app da Twitch como está.
2. Adicionar `.env.*` (com `!.env.example`, `!.env.product.example`), `secrets.json` e `credentials.json` ao `.gitignore` (mudança do `@dev` dentro da story de guarda OPS-27).
3. Fazer a guarda da OPS-27 verificar também `.claude/settings.local.json` e `.claude/settings.json` com regras `permissions.allow` contendo `PASSWORD`, `TOKEN`, `SECRET`, `Authorization`, `sshpass`, `PGPASSWORD` ou `://user:pass@` (os padrões que a Apiiro diz que os scanners perdem). Encaixa no escopo existente da OPS-27; nenhum requisito novo é inventado aqui.
4. Hábito operacional: nunca escolher "don't ask again" para comando com segredo literal; use variável de ambiente ou peça o segredo em prompt (`VAR=segredo cmd` inline ainda grava o segredo).
5. Pedir ao dono que confirme na máquina (os agentes não enxergam): que o `.claude/settings.local.json` de cada worktree (incluindo `backup-wt`, `backup-wt2`, `board-sync` em `.local/`) não tem segredo colado, e que o arquivo de exclusões global do Git do Claude Code está no lugar. Isso fica fora do repositório e não foi inspecionado.
6. Repetir esta auditoria com um scanner ciente de histórico (gitleaks ou TruffleHog) depois que o dono aprovar um, para cobrir entropia além desta amostra.

## 6. Limitações e confiança

- Varreduras por regex e entropia são amostras, não prova de ausência. Segredos codificados (base64, URL-encoded, divididos em linhas), comprimidos ou em blobs binários não são cobertos. Lockfiles foram ignorados.
- Só refs alcançáveis foram varridas (`--all` inclui `legacy`, `origin/main` e a tag). Objetos soltos, forks e refs de PR em cache do GitHub não foram inspecionados.
- Comentários e revisões de PR e issue entraram no download (existem 0 comentários); logs do GitHub Actions, Discussions, wiki e texto do board de Projects não foram varridos.
- A auditoria não viu arquivos locais não versionados (worktrees em `.local/`) nem a máquina do desenvolvedor.
- O artigo é de terceiros; a página primária da Apiiro não pôde ser lida aqui (HTTP 403).
- Auditoria anterior reaproveitada: `docs/research/2026-11-06-git-history-rewrite/README.md` (207 commits do `origin/main`, formatos comuns de token). Esta nota estende para os 225 commits, padrões extras, entropia, corpos de PR/issue, notas e artefatos da release e a árvore `.claude`.

## 7. Próximos passos (agentes)

- `@sm`/`@po`: incorporar as recomendações 2 e 3 ao escopo da OPS-27. `@dev`: implementar após o gate da story. `@qa`: validar. `@devops`: nenhuma mudança no GitHub decorre desta auditoria. Coordenador: pedir ao dono a recomendação 5.
