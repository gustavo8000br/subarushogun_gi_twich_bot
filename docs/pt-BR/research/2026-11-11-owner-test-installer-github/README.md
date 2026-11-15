# Instalador de teste só do dono no GitHub: lacunas L1 a L5 (nota de pesquisa)

[English](../../../research/2026-11-11-owner-test-installer-github/README.md)

- Autoria: `@analyst` (Atlas). Data: 2026-11-11 (todas as páginas foram consultadas nesta data). Pesquisa de mesa, com a documentação oficial do GitHub e da Microsoft primeiro. Nenhum código, configuração ou estado de git/GitHub foi alterado; só esta nota, a cópia en e as linhas do índice foram escritas.
- Entrada: `docs/pt-BR/stories/OPS-15/windows-owner-test-installer-design.md` (`@architect`, seção 6, lacunas L1 a L5). Esta nota responde às lacunas e diz o que muda no desenho.
- Rótulos em cada resposta:
  - **DOC**: afirmado por página oficial (com link; as citações são as devolvidas pela ferramenta de leitura de páginas, não por um navegador).
  - **TESTE**: a documentação não afirma, ou só há posts da comunidade; exige execução real (o dono no GitHub ou no Windows, ou o `@qa`).
  - **COMUNIDADE**: fórum, issue ou blog; opinião ou relato isolado.
  - **MEDIDO**: medido hoje nesta máquina.
- Limites: as páginas do GitHub Docs e do Microsoft Learn foram lidas por uma ferramenta que resume, então algumas frases não vieram. "Não afirmado" abaixo significa "não estava no que a ferramenta devolveu". Não havia outra conta do GitHub além da do dono, então nada sobre o que um não colaborador enxerga foi testado.

## 0. Resumo executivo

1. **A opção C do `@architect` se confirma.** Uma execução por `push` usa o arquivo de workflow do commit enviado, mesmo em uma branch não mesclada à padrão (DOC). O `workflow_dispatch` é documentado como exigindo o arquivo na branch padrão, então a opção A não é garantida (DOC). Nada obriga a mudar a `main`.
2. **Um detalhe do desenho precisa mudar: "prevent self-review" deve ficar DESLIGADO.** O dono dispara (push) e aprova. Com a opção ligada, o dono não pode aprovar a própria execução (DOC), e o job ficaria esperando até estourar o tempo.
3. **Environments funcionam no plano gratuito em repositório público** (revisores obrigatórios até 6, regras de branch/tag, Secrets por Environment; DOC). O Secret só é liberado após a aprovação e só para a branch permitida (DOC).
4. **Risco novo (L5): `--target "$GITHUB_SHA"`.** A página REST de criação de release diz que o token precisa do escopo `workflow` quando o commit-alvo resolvido adiciona ou altera arquivos em `.github/workflows/` em relação à branch padrão. O `GITHUB_TOKEN` não tem a permissão `workflows` (DOC). A branch de teste sempre difere da `main` nessa pasta. Se um **rascunho** é afetado não está documentado (TESTE). Mitigação: usar `--target main` (ou o SHA da branch padrão) e escrever o SHA da branch nas notas.
5. **Rascunhos:** só quem tem acesso de push recebe a listagem de rascunhos (DOC, API); o download direto de um asset de rascunho por um estranho não está documentado (TESTE; a comunidade diz 404 ou login). **Artefatos:** quem tem acesso de leitura lista e baixa, e em repositório público isso é toda conta logada (DOC mais COMUNIDADE). A decisão "um job, sem `upload-artifact`" se confirma.
6. **PBKDF2 (L4):** os construtores com `HashAlgorithmName` existem a partir do .NET Framework 4.7.2 (DOC). O Windows 10 traz o 4.7.2 desde a versão 1803 e o 4.8 desde a 1903; builds mais antigas podem instalá-lo (DOC). 600.000 iterações de PBKDF2-HMAC-SHA256 é o valor atual da OWASP (DOC). A velocidade no Windows PowerShell 5.1 não é documentada; o Node nesta máquina leva 0,40 s (MEDIDO) e o .NET Framework é relatado como 2 a 4 vezes mais lento que o .NET moderno (COMUNIDADE), então espere cerca de 1 a 2 s (TESTE no Windows).
7. Sete itens continuam em aberto e são testes, não pesquisa (seção 7).

## 1. L1: `workflow_dispatch` e `push` em branch que não é a padrão

| Pergunta | Resposta | Rótulo | Fonte |
|---|---|---|---|
| O arquivo precisa existir na branch padrão para o `workflow_dispatch`? | Sim: "This event will only trigger a workflow run if the workflow file exists on the default branch." A página de execução manual repete: "To trigger the `workflow_dispatch` event, your workflow must be in the default branch." | DOC | [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) |
| Dá para disparar contra outra branch? | A página de eventos diz: "Once a workflow has run at least once, you can dispatch it against any branch or tag via the GitHub API or GitHub CLI." A tabela dá `GITHUB_SHA` = "Last commit on the `GITHUB_REF` branch or tag" e `GITHUB_REF` = "Branch or tag that received dispatch". Juntando: roda o arquivo do ref escolhido, mas o workflow precisa estar registrado antes. As duas frases ficam em tensão e a página não resolve o caso de um arquivo que só existe fora da branch padrão. | DOC + TESTE | mesma página |
| A primeira execução registra o workflow? | Um blog (2025-08-19) diz que um workflow que nunca rodou precisa rodar uma vez (sugere um gatilho `pull_request` temporário) e depois `gh workflow run <arquivo> --ref <branch>` funciona. Outras discussões relatam 404 para arquivo que existe só em branch de feature e uma correção usando o ID numérico do workflow. Nada é oficial. | COMUNIDADE | [blog](https://andreynautilus.github.io/posts/2025-08-19-github-workflow_dispatch-from-branch), [discussão da comunidade](https://github.com/orgs/community/discussions/25756) |
| O `push` precisa do arquivo na branch padrão? | Não. A página de eventos diz que o evento `push` inclui "workflows that are not merged into the default branch". O `GITHUB_SHA` é o "tip commit pushed to the ref" e o `GITHUB_REF` é o ref atualizado, então vale a versão do arquivo no commit enviado. | DOC | página de eventos |
| Diferença entre o arquivo da branch e o da padrão | `push` usa o commit enviado; `schedule` usa a padrão ("Scheduled workflows run on the latest commit on the default branch"); `pull_request_target` usa a base. Só o gatilho manual depende da branch padrão para o registro. | DOC | página de eventos |

Casos de borda do `push` com `branches` + `paths` (DOC, [sintaxe de workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)):

- Os dois filtros precisam casar; se um pular, nada começa (e um check obrigatório ficaria "Pending").
- Branch existente: o diff compara o SHA da ponta com o da base. **Branch nova:** o diff é contra "the parent of the ancestor of the deepest commit pushed". Portanto o primeiro push de `test/windows-owner` dispara desde que algum commit enviado toque o arquivo marcador.
- Sem arquivos alterados, sem execução. Um **commit vazio nunca dispara** um workflow com filtro `paths`. Cada execução seguinte exige um commit que altere `.github/test-windows-owner.trigger` (por exemplo, uma linha de contador).
- Filtros de caminho não são avaliados em push de tag. Mais de 1.000 commits sempre executa; estouro de tempo do diff sempre executa; com mais de 3.000 arquivos alterados o casamento pode ser perdido (a ferramenta devolveu 3.000; irrelevante aqui).
- Apagar a branch faz o `GITHUB_SHA` voltar à branch padrão (DOC): não dependa de evento de exclusão.
- Pushes feitos com o `GITHUB_TOKEN` do repositório não iniciam execuções (DOC). Aqui valem as credenciais do dono, então não se aplica.
- Tags: o desenho não usa, então nenhum workflow por tag pode disparar.

**Implicações para o desenho**

- D-T1 opção **C está confirmada** pela documentação. Mantenha `paths` + `branches` (+ guarda do ator). No guia do dono: "altere a linha marcadora em cada commit; commit vazio não faz nada".
- A opção A (`gh workflow run --ref`) **não está documentada como funcionando** para arquivo que só existe fora da branch padrão. Trate como TESTE. Se a primeira execução por push ocorrer, um `gh workflow run <id-do-workflow> --ref test/windows-owner` posterior talvez funcione (COMUNIDADE); não prometa nem construa sobre isso.
- Mantenha `workflow_dispatch: {}` no arquivo apenas como extra opcional. Ele não mostra o botão "Run workflow" enquanto o arquivo não existir na `main` (DOC).
- Detalhe de CLI: a opção longa é `--ref` (também `-r` no `gh` 2.103.3 instalado, MEDIDO com `gh workflow run --help`). O desenho diz `-r`; os dois funcionam localmente, mas a página de docs lista só `--ref`.
- TESTE L1-a (opcional, custa uma execução): após a primeira execução por push, tentar o dispatch pelo ID do workflow com `--ref`. Não é necessário para a C.

## 2. L2: Environments em repositório público, plano gratuito

| Pergunta | Resposta | Rótulo | Fonte |
|---|---|---|---|
| Existe no plano gratuito de repositório público? | Sim. "Users with GitHub Free plans can only configure environments for public repositories." A página REST: Environments, Secrets por Environment e regras de proteção de deploy existem em repositórios públicos em todos os planos atuais; revisores obrigatórios e temporizador de espera valem para repositórios públicos em Free, Pro e Team. | DOC | [Managing environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment), [REST environments](https://docs.github.com/en/rest/deployments/environments) |
| E se o repositório virar privado? | A página diz que regras e Secrets de um repositório que vira privado são ignorados no Free. Consequência: sem portão de aprovação e sem Secret; o aborto antecipado do desenho com Secret vazio então para o job. Mantenha esse aborto. | DOC | página managing-environments |
| Quem configura? | Repositório pessoal: o dono. Organização: acesso `admin`. Quem edita workflows pode criar um Environment só citando o nome, mas ele nasce sem regras e sem Secrets, e só admins configuram. | DOC | mesma |
| Revisores obrigatórios | Até 6 pessoas ou times. Uma aprovação basta. Os revisores precisam de pelo menos leitura. | DOC | mesma + REST |
| O autor pode aprovar? | Ajuste opcional "prevent self-review": quem disparou a execução não pode aprová-la, "even if they are a required reviewer". Desligado por padrão. **Dono único = quem faz push = revisor, então o ajuste precisa ficar DESLIGADO.** | DOC | página managing, [changelog 2023-10-16](https://github.blog/changelog/2023-10-16-actions-prevent-self-reviews-for-secure-deployments-across-actions-environments) |
| Admin bypass | "Allow administrators to bypass configured protection rules" vem ligado por padrão. O que ele faz diante de um portão de revisor obrigatório não estava no que a ferramenta devolveu. | DOC + TESTE | página managing |
| Restrição de branch | "Deployment branches": branches e tags selecionadas com padrões de nome (branch ou tag, definidos separadamente). Curingas usam `File.fnmatch` do Ruby e `*` não casa `/`; o nome literal `test/windows-owner` é exato. | DOC | [REST de política de branch](https://docs.github.com/en/rest/deployments/branch-policies) |
| Secrets | Secrets de Environment chegam só aos jobs que citam o Environment, e só depois que as regras passam. "A job cannot access environment secrets until a reviewer approves." | DOC | página managing, [secure use](https://docs.github.com/en/actions/reference/security/secure-use) |
| Outros limites | Nome até 255 caracteres, sem diferenciar maiúsculas, único. Apagar o Environment apaga Secrets e regras e falha jobs em espera. Temporizador de 0 a 43.200 minutos. | DOC | página managing, REST |

**Riscos residuais (princípio documentado, não testado):**

- Quem tem escrita pode enviar um workflow alterado para `test/windows-owner`, e o dono veria um pedido de aprovação dessa execução. A tela de aprovação mostra o commit; o dono precisa conferir que é dele. Mitigação a avaliar: um ruleset de branch limitando quem pode dar push na branch (rulesets de repositório público não foram lidos nesta passada: TESTE).
- A máscara não é garantida: "automatic redaction is not guaranteed", valores derivados (codificações) devem ser registrados como Secrets, e um log vazado deve ser apagado e o Secret rotacionado (DOC, secure use). O hash PBKDF2 não é a senha, mas trate-o como sensível.
- Logs de execução de repositório público são públicos. Nenhuma página lida nesta passada afirma isso, então o `@qa` deve verificar na primeira execução (TESTE) e manter qualquer `echo` longe do hash e da URL do rascunho.

**Implicações para o desenho**

- Acrescentar aos passos do dono: revisor obrigatório = dono, **prevent self-review DESLIGADO**, regra de branch de deploy `test/windows-owner` (branches selecionadas), admin bypass como está (o dono aprova de qualquer forma; TESTE o que acontece).
- Manter o aborto por Secret vazio no job (cobre também o caso "virou privado").
- Acrescentar um critério de aceite: o `@qa` confirma na primeira execução real que um push do dono para em "waiting for review" e que nenhum valor de Secret existe no log antes da aprovação.

## 3. L3: quem vê rascunhos de release e artefatos de Actions em repositório público

| Pergunta | Resposta | Rótulo | Fonte |
|---|---|---|---|
| Quem vê rascunhos? | Listagem REST: "Only users with push access will receive listings for draft releases." Criar release exige acesso de push. | DOC | [REST releases](https://docs.github.com/en/rest/releases/releases) |
| Download direto de asset de rascunho por um estranho | A página REST de assets não diz nada sobre rascunhos e exige autenticação na maioria das chamadas. Um caso da comunidade relata asset de rascunho baixável só logado com acesso, e outro mostra assets de rascunho num caminho temporário `releases/download/untagged-<hash>/` que dá 404 após publicar. Nada oficial. Espere "404 ou login" para estranhos, mas prove. | COMUNIDADE + TESTE | [REST de assets](https://docs.github.com/en/rest/releases/assets), [thread do Istio](https://discuss.istio.io/t/cannot-download-1-1-snapshot-4/453), [issue](https://github.com/LRainner/AgentCat/issues/16) |
| O que um rascunho expõe a contas sem escrita? | Pela regra documentada de listagem, nada na lista da API. A página de gestão de releases não diz quem vê o feed web. Se o nome da tag ou o título vazam: a tag normalmente não é criada para um rascunho (ver L5), então nenhum ref aparece; o título é privado a quem tem push na listagem. | DOC (API) + TESTE (web) | página de releases |
| Forks | Um fork recebe branches, não releases nem Secrets. Não lido nesta passada: trate como TESTE/comportamento conhecido e não dependa disso. | TESTE | nenhuma |
| Quem vê e baixa artefatos de Actions? | REST: "Anyone with read access to the repository can use this endpoint" (listar, obter). O guia: "Read access to the repository is required" para baixar. Em repositório público toda conta tem leitura, então toda conta **logada** pode baixar; a URL de download redireciona e "expires after 1 minute". Evidência de terceiros diz que não há link público permanente e que a interface web exige login. | DOC + COMUNIDADE | [REST artifacts](https://docs.github.com/en/rest/actions/artifacts), [guia de download](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts), [nightly.link](https://github.com/oprypin/nightly.link) |
| Retenção | `retention-days` no `upload-artifact` não pode passar do limite do repositório/organização; o padrão (90 dias) veio de resumos de busca, não de uma página que li. | DOC + COMUNIDADE | [storing artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts) |

**Implicações para o desenho**

- **Confirmado:** job único e nenhum `upload-artifact` para o `.bat` (D-T3 item 3). Um artefato seria baixável por qualquer conta logada, e o `.bat` embute o hash.
- O rascunho é o recipiente certo, mas a afirmação "invisível a estranhos" para o **asset** só é documentada para a listagem. Acrescentar um teste: sem token, `curl -sI` na `browser_download_url` do asset do rascunho e esperar algo diferente de `200`; se possível também com uma segunda conta de teste.
- Não imprimir a URL do rascunho no log (o `gh release create` imprime; redirecionar ou descartar a saída). É inofensivo se o rascunho é privado, mas elimina uma pista.
- A rotação importa: até um rascunho privado pode vazar se o dono encaminhar o `.bat`. A senha viaja por outro canal (já está em D-T4).

## 4. L4: PBKDF2 no Windows 10 e no PowerShell 5.1

| Pergunta | Resposta | Rótulo | Fonte |
|---|---|---|---|
| Construtor com `HashAlgorithmName` | `Rfc2898DeriveBytes(String, Byte[], Int32, HashAlgorithmName)`, `(Byte[], Byte[], Int32, HashAlgorithmName)` e `(String, Int32, Int32, HashAlgorithmName)` valem para o .NET Framework 4.7.2, 4.8 e 4.8.1 (não para 4.6.x nem 4.7/4.7.1). | DOC | [construtores de Rfc2898DeriveBytes](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes.-ctor?view=netframework-4.8.1) |
| Hash padrão dos construtores antigos | A classe é descrita como baseada em HMACSHA1. Os construtores de 3 argumentos (sem `HashAlgorithmName`) portanto produzem PBKDF2 com SHA-1 e divergiriam em silêncio do helper em Node. | DOC | [página da classe](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes?view=netframework-4.8.1) |
| Mínimos | O sal deve ter 8 bytes ou mais; iterações maiores que zero. Sal de 16 bytes serve. | DOC | página dos construtores |
| Método estático `Pbkdf2` | Existe só no .NET moderno; suas sobrecargas não aparecem para o .NET Framework. Não usar no PowerShell 5.1. | DOC | página da classe |
| .NET Framework por build do Windows 10 | 4.6 na 1507, 4.6.1 na 1511, 4.6.2 na 1607, 4.7 na 1703, 4.7.1 na 1709, **4.7.2 pré-instalado desde a 1803**, 4.8 pré-instalado desde a 1903; builds anteriores podem instalar 4.7.2/4.8 (a tabela marca como instalável). O Windows 11 traz 4.8 ou 4.8.1. | DOC | [versões e dependências](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/versions-and-dependencies) |
| Runtime do Windows PowerShell 5.1 | Roda no .NET Framework completo e vem no Windows; o suporte segue a versão do Windows. | DOC | [What is Windows PowerShell?](https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell) |
| Iterações recomendadas | OWASP: "PBKDF2-HMAC-SHA256: 600,000 iterations (recommended)"; HMAC-SHA-256 é o preferido quando se exigem implementações com validação FIPS. A página também alerta para senhas muito longas (DoS) e sugere pré-hash com sal; irrelevante para senha curta com limite de tamanho. | DOC | [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| `-AsSecureString` | `Read-Host -AsSecureString` está documentado no 5.1 e mostra um asterisco por caractere. A documentação alerta que caracteres formados por vários pontos de código (emoticons) podem causar problemas em senhas. | DOC | [ConvertFrom-SecureString 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring?view=powershell-5.1) |
| `SecureString` protege? | A orientação da Microsoft (DE0001) é evitá-lo em desenvolvimento novo: ele só mantém o valor fora de objetos `String` comuns, o texto puro ainda precisa ser materializado para uso, e só é cifrado no .NET Framework. Trate como "sem eco, exposição curta", não como memória protegida. | DOC | [DE0001](https://github.com/dotnet/platform-compat/blob/master/docs/DE0001.md) |
| Tempo de 600.000 iterações no PS 5.1 | **Sem número oficial.** O `pbkdf2Sync` do Node 24.20.0 (sha256, 600.000) levou 397 ms nesta máquina Linux (MEDIDO, 2026-11-11). Um post do Stack Overflow (espelho) relata PBKDF2 no .NET Framework 4.8 cerca de 4 vezes mais lento que no .NET 8, sem informar iterações (COMUNIDADE). Estimativa: 1 a 2 s em desktop normal, mais em máquina fraca. | MEDIDO + COMUNIDADE + TESTE | [espelho da pergunta](https://backiee.wasmer.app/http_Stackoverflow_com/questions/78441140/rfc2898derivebytes-is-very-slow-in-c-sharp-net-framework-version-4-8) |

**Implicações para o desenho**

- D-T2 está **confirmado**: o construtor com `HashAlgorithmName` exige 4.7.2+, o que cobre o Windows 10 1803 e posteriores por padrão; 1607 a 1709 precisariam da atualização. O fallback `Add-Type` com laço HMAC continua útil para elas. Um laço puro em PowerShell é lento demais (não medido; razoável).
- **Nunca usar os construtores sem `HashAlgorithmName`** (usam SHA-1). O teste de contrato deve afirmar que toda chamada a `Rfc2898DeriveBytes` em `installer.ps1` e em `Gerar-HashSenhaTeste.ps1` passa `HashAlgorithmName` (`SHA256`), e que o teste de interoperabilidade cobre um hash do Node verificado no PowerShell.
- Preferir a sobrecarga com senha `Byte[]` e bytes UTF-8 explícitos (4.7.2+, DOC): mesma codificação do Node, e a `String` pura não é necessária para o hash.
- Documentar **senhas só ASCII** (letras, dígitos, símbolos comuns). A codificação do console do `Read-Host` numa janela aberta por `.bat` (página de código OEM) versus o terminal UTF-8 do Node pode gerar bytes diferentes para caracteres acentuados. É inferência do desenho, a provar com um teste de interoperabilidade com uma senha-canário não ASCII (TESTE).
- Não afirmar proteção de memória. Dizer "sem eco, bytes zerados em melhor esforço, strings do .NET são imutáveis".
- Orçamento: a verificação "abaixo de 5 s" do arquiteto para o fallback é plausível; acrescentar um passo de medição para o dono (`Measure-Command` em volta da derivação) e manter a pausa de 2 segundos entre tentativas.
- Manter 600.000 da OWASP e o formato `pbkdf2-sha256$600000$...`; revisar se o valor mudar (REFRESH IF).

## 5. L5: comandos `gh` e permissões do token

| Pergunta | Resposta | Rótulo | Fonte |
|---|---|---|---|
| `gh release create --draft --prerelease --target` | As opções existem: `-d/--draft` ("Save the release as a draft instead of publishing it"), `-p/--prerelease`, `--target <branch>` ("Target branch or full commit SHA"), `-t/--title`, `-n/--notes`, `--verify-tag`. Confirmado localmente com o `gh` 2.103.3 (MEDIDO). | DOC + MEDIDO | [gh release create](https://cli.github.com/manual/gh_release_create) |
| Quando a tag é criada? | "If a matching git tag does not yet exist, one will automatically get created from the latest state of the default branch. Use `--target` to point to a different branch or commit." A página REST diz que `target_commitish` decide de onde a tag é criada e que fica "unused if the Git tag already exists". **Nenhuma das duas diz se um rascunho cria a tag.** A comunidade mostra rascunhos sob uma URL `untagged-<hash>`, o que sugere que não há tag até publicar. | DOC + COMUNIDADE + TESTE | [REST releases](https://docs.github.com/en/rest/releases/releases) |
| Anexar assets | Com assets, o `gh` cria um rascunho, envia e depois publica, a menos que se use `--draft`; os passos não são atômicos. Com releases imutáveis ativas, as proteções valem só após publicar; um rascunho ainda pode ser modificado ou apagado. | DOC (help instalado) | `gh release create --help` |
| Permissão para criar | "Users with push access to the repository can create a release." `contents: write` no job permite criar release. | DOC | REST releases, [sintaxe de workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions) |
| **Caso de borda dos arquivos de workflow** | REST criar release: o token precisa do escopo `workflow` (e tokens fine-grained/App da permissão de repositório "Workflows") "when the resolved target commit modifies workflow files" em relação à branch padrão; senão 404 (às vezes 403). A chave `permissions:` lista 17 escopos e `workflows` não é um deles, então o `GITHUB_TOKEN` não consegue obtê-lo. | DOC | REST releases, sintaxe de workflow |
| `gh secret set --env` | `-e/--env <environment>` define um Secret de Environment. "If `--body` isn't set, the value is read from standard input"; um `gh secret set NOME --env E` sem corpo pergunta, e `< arquivo` ou pipe também funcionam. Atenção: `-f` é `--env-file` (dotenv), não um arquivo de corpo; não existe `--body-file`. Os escopos do token não estão na página. Os Secrets são cifrados localmente antes do envio (help instalado). | DOC + MEDIDO | [gh secret set](https://cli.github.com/manual/gh_secret_set) |
| `gh api` para o Environment | `PUT /repos/{owner}/{repo}/environments/{name}` com `reviewers` (`type` `User` ou `Team`, `id`; até 6), `prevent_self_review`, `wait_timer`, `deployment_branch_policy` {`protected_branches`, `custom_branch_policies`} (valores opostos; iguais dão 422). Depois `POST .../environments/{name}/deployment-branch-policies` com `name` e `type` (`branch`); exige `custom_branch_policies: true` antes, senão 404; duplicado retorna 303. Tokens clássicos precisam de `repo`; acesso admin ao repositório. Os nomes das permissões fine-grained não estão nas páginas. | DOC + TESTE | [REST environments](https://docs.github.com/en/rest/deployments/environments), [branch policies](https://docs.github.com/en/rest/deployments/branch-policies) |
| `GITHUB_TOKEN` e gatilhos | Eventos criados pelo `GITHUB_TOKEN` não iniciam novas execuções, exceto `workflow_dispatch` e `repository_dispatch`. `permissions: {}` desativa todas as permissões; citar uma põe todas as outras em `none`. | DOC | [página de eventos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), sintaxe de workflow |
| `gh release delete` | `--cleanup-tag` e `-y/--yes` existem (help instalado). | MEDIDO | `gh release delete --help` |

Padrões de comando para o `@devops` (montados a partir dos campos acima; **TESTE**, não executados aqui; troque os marcadores; o id do usuário é lido, não gravado em arquivo):

```text
# Environment com revisor e sem bloqueio de auto-aprovação
gh api -X PUT repos/<dono>/<repo>/environments/windows-owner-test --input - <<'JSON'
{"prevent_self_review": false,
 "reviewers": [{"type": "User", "id": <id numérico de: gh api user --jq .id>}],
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON

# Permitir só a branch de teste
gh api -X POST repos/<dono>/<repo>/environments/windows-owner-test/deployment-branch-policies \
  -f name='test/windows-owner' -f type=branch

# Secret (pergunta; o valor nunca é digitado na linha de comando)
gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test
```

**Implicações para o desenho**

- **Mudar o passo 4 do D-T3:** não usar `--target "$GITHUB_SHA"` às cegas. O commit da branch de teste sempre difere da `main` em `.github/workflows/`, que é exatamente a condição documentada que pede um escopo `workflow` que o `GITHUB_TOKEN` não pode ter. Usar `--target main` (um commit sem mudança de workflow) para o rascunho e escrever o `$GITHUB_SHA` real nas notas. Se o dono algum dia publicar, a tag apontaria para a ponta da `main`, não para a branch de teste: aceitável porque o rascunho é apagado, nunca publicado. Documentar: "nunca publique este rascunho".
- Se até `--target main` falhar, criar a release por `gh api` com os mesmos campos, e por último só uma rota sem artefato (não recomendada). Tudo isso é TESTE.
- Manter `permissions: { contents: write }` no nível do job só no único job, com `permissions: {}` no topo (confirmado). O `checkout` funciona com `contents: write` (inclui leitura).
- A criação do Environment é uma **ação do dono/`@devops` com as credenciais de admin do dono**, não algo que o workflow faz. Manter fora do workflow.
- `gh secret set` sem `--body` está certo (stdin ou pergunta). Não usar `--body "$VAR"` (histórico do shell, lista de processos). Se o helper em Node fizer pipe, ele deve imprimir só o hash no stdout e perguntar no stderr ou no TTY.
- `gh release delete test-windows-<run_id> --cleanup-tag --yes` é válido (a limpeza de tag não faz nada se não existir tag).

## 6. A opção C do `@architect` se sustenta?

Sim, com quatro correções:

1. Prevent self-review DESLIGADO (seção 2).
2. `--target main` em vez de `$GITHUB_SHA` para o rascunho, com o SHA nas notas (seção 5).
3. O arquivo marcador precisa mudar em todo commit que dispara; commit vazio não faz nada (seção 1).
4. Acrescentar itens de TESTE para o download por estranho, a visibilidade dos logs e o comportamento do admin bypass (seção 7).

## 7. Itens em aberto (testes, não pesquisa)

| # | Item | Quem | Como |
|---|---|---|---|
| T-1 | O primeiro push de `test/windows-owner` para em "waiting for review"; nenhum Secret no log antes da aprovação | `@qa` com o dono | Execução real; ler o log |
| T-2 | Admin bypass: pula o portão de revisor para o dono? | dono | Observar a primeira execução |
| T-3 | `gh release create --draft --prerelease --target main` funciona com o `GITHUB_TOKEN` quando a branch altera arquivos de workflow; e também `--target $GITHUB_SHA` (para saber se o caso de borda pega) | `@qa` | Duas execuções, ou uma depois da outra |
| T-4 | A URL do asset do rascunho sem token não devolve `200`; segunda conta se houver | `@qa` | `curl -sI` |
| T-5 | Logs de execução deste repositório público visíveis sem login | `@qa` | Requisição anônima |
| T-6 | Tempo de PBKDF2 com 600.000 no Windows PowerShell 5.1 e no fallback; interoperabilidade com senha-canário não ASCII e o helper em Node | dono / sessão Windows | `Measure-Command`; as verificações do D-T5 item 4 |
| T-7 | Opcional: dispatch pelo ID do workflow com `--ref` após a primeira execução | `@devops` | Um `gh workflow run` |

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Dono deixa o self-review LIGADO | Job espera e estoura o tempo | Passos do dono dizem DESLIGADO; `@qa` confere o ajuste |
| `--target $GITHUB_SHA` recusado por mudança em workflows | Sem rascunho | `--target main`, SHA nas notas (T-3) |
| Outro escritor envia workflow alterado para a branch de teste | Secret lido depois que o dono aprova sem conferir | Conferir o commit na aprovação; ruleset de branch (não verificado) |
| Hash ou URL do rascunho impressos no log público | Divulgação | Sem eco; varredura de log pelo QA; máscara não é garantida |
| Framework anterior ao 4.7.2 (Windows 10 1607 a 1709) | Construtor ausente | Fallback `Add-Type` ou instalar o 4.8 |
| Construtor padrão com SHA-1 usado por engano | O hash nunca confere | Teste de contrato em toda chamada a `Rfc2898DeriveBytes` |
| Senha acentuada difere entre Node e PowerShell | Dono trancado fora | Regra só ASCII; teste com canário não ASCII |
| Repositório vira privado | Regras e Secrets ignorados | Aborto por Secret vazio (já no desenho) |

## 9. Próximos passos (sem implementação aqui)

- `@architect`: aplicar as quatro correções em `windows-owner-test-installer-design.md` (passos do dono no D-T1, passo 4 do D-T3, texto de contrato do D-T2).
- `@dev`: testes de contrato para `HashAlgorithmName` em toda chamada, `--target main`, sem `--body`, sem `upload-artifact`, nota do arquivo marcador na documentação.
- `@qa`: testes T-1 a T-5 na primeira execução real; varredura de vazamento do log e do rascunho.
- `@devops`: criar o Environment com as credenciais do dono depois da decisão do dono; criar a branch só depois disso.
- Dono: T-2, T-6 e apagar o rascunho e o Secret depois.

## 10. Autoavaliação (rubrica, alvo de pelo menos 9,0)

| Critério | Peso | Nota | Observação |
|---|---|---|---|
| Fontes oficiais primeiro, datadas, rotuladas | 25 % | 9,2 | 14 páginas oficiais (GitHub Docs, manual do GitHub CLI, Microsoft Learn, OWASP); toda resposta rotulada |
| Cobertura de L1 a L5 e casos de borda | 25 % | 9,0 | Achou dois itens que o rascunho não previa (impasse do self-review, checagem de arquivo de workflow no alvo); acesso de estranhos e tempo no PS 5.1 seguem como TESTE |
| Aderência ao projeto e mudanças acionáveis no desenho | 20 % | 9,3 | Quatro correções concretas, padrões de comando, lista de testes |
| Honestidade sobre limites | 15 % | 9,3 | Limites da ferramenta que resume, itens só da comunidade e comandos não testados sinalizados |
| Verificação no ambiente | 10 % | 8,5 | Opções do `gh` e tempo do Node medidos; o comportamento do GitHub em si não foi exercitado (sem escrita remota permitida) |
| Paridade en / pt-BR, legibilidade | 5 % | 9,0 | |
| **Total ponderado** | | **9,1** | |

## Fontes (consultadas em 2026-11-11)

- GitHub Docs: [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Managing environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment), [Secure use](https://docs.github.com/en/actions/reference/security/secure-use), [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token), [Artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts), [Downloading artifacts](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts), [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
- GitHub REST: [Releases](https://docs.github.com/en/rest/releases/releases), [Release assets](https://docs.github.com/en/rest/releases/assets), [Artifacts](https://docs.github.com/en/rest/actions/artifacts), [Environments](https://docs.github.com/en/rest/deployments/environments), [Deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies); [changelog 2023-10-16](https://github.blog/changelog/2023-10-16-actions-prevent-self-reviews-for-secure-deployments-across-actions-environments) (lido só como resultado de busca).
- Manual do GitHub CLI: [gh release create](https://cli.github.com/manual/gh_release_create), [gh secret set](https://cli.github.com/manual/gh_secret_set); help do `gh` 2.103.3 instalado.
- Microsoft Learn: [construtores de Rfc2898DeriveBytes](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes.-ctor?view=netframework-4.8.1), [classe](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes?view=netframework-4.8.1), [versões do .NET Framework e do Windows](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/versions-and-dependencies), [What is Windows PowerShell?](https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell), [ConvertFrom-SecureString 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring?view=powershell-5.1); [DE0001](https://github.com/dotnet/platform-compat/blob/master/docs/DE0001.md); [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Comunidade (opinião/relato): [workflow_dispatch a partir de uma branch, 2025-08-19](https://andreynautilus.github.io/posts/2025-08-19-github-workflow_dispatch-from-branch), [discussão 25756](https://github.com/orgs/community/discussions/25756), [thread do Istio sobre download de rascunho](https://discuss.istio.io/t/cannot-download-1-1-snapshot-4/453), [issue 16 do AgentCat](https://github.com/LRainner/AgentCat/issues/16), [nightly.link](https://github.com/oprypin/nightly.link), [espelho do Stack Overflow sobre a velocidade do PBKDF2](https://backiee.wasmer.app/http_Stackoverflow_com/questions/78441140/rfc2898derivebytes-is-very-slow-in-c-sharp-net-framework-version-4-8).
- MEDIDO: `crypto.pbkdf2Sync` do Node 24.20.0 com 600.000 iterações, 397 ms; saída de `--help` do `gh` 2.103.3.
