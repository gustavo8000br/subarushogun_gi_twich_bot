# Kanban para acompanhar implementações — nota de pesquisa

[English](../../process/kanban-research.md)

- Autoria: `@analyst` (Atlas). Data: 2026-10-24. Pedido do proprietário, encaminhado pelo `@aiox-master`.
- Índice de pesquisas: linha 19 em [`docs/pt-BR/research-index.md`](../research-index.md). Antes desta nota, o tema era uma LACUNA (GAP).
- Rótulos: **VERIFIED** quer dizer que uma fonte oficial, o CLI instalado ou uma consulta somente leitura a este repositório confirmou. **PARTIAL** quer dizer que a fonte estava incompleta ou era secundária. **UNVERIFIED** quer dizer que é uma inferência.
- Escopo: pesquisa documental mais verificações somente leitura com `gh`. Nada foi criado nem editado no GitHub. Nenhum script de sincronização foi escrito nem testado.
- Premissa do proprietário (2026-10-24, recebida durante a pesquisa): o `@sm` **organiza** o quadro (prioridade, requisitos, tamanho, dependências, ordem). O `@devops` **mantém o quadro atualizado** (cria e move itens, sincroniza campos com o estado de story, issue e gate). Esta nota não propõe outra divisão.

## Problema

O proprietário perde a linha de pensamento de cada implementação: por que ela existe, que decisão foi tomada, em que gate está e o que vem depois. Essas informações ficam espalhadas entre a story, os gates do `@qa`, as notas de pesquisa, o handoff de sessão, as issues e os commits.

## Constatações sobre este repositório (somente leitura, 2026-10-24)

| # | Constatação | Rótulo |
|---|---|---|
| R1 | O `gh` é 2.45.0. A conta `gustavo8000br` tem os escopos `gist`, `read:org`, `repo` e `workflow`. **Faltam `project` e `read:project`.** Qualquer comando `gh project`, e qualquer leitura GraphQL de campos de projeto, falha com `INSUFFICIENT_SCOPES` / "missing required scopes [read:project]". | VERIFIED (`gh auth status`, consulta GraphQL) |
| R2 | A conta já tem **5 Projects (v2) de usuário**. Os nomes e o conteúdo não podem ser lidos sem `read:project`. Verifique esses projetos antes de criar um novo. | VERIFIED (só a contagem) |
| R3 | O repositório é público, pertence ao usuário e tem `has_projects: true`. | VERIFIED (`gh api repos/...`) |
| R4 | Há 32 issues e **nenhuma** tem pai ou sub-issue nativos (`parent` é nulo e `subIssuesSummary.total` é 0 em todas). Os campos de projeto "Parent issue" e "Sub-issue progress" ficariam vazios hoje, e a lei de roadmap (issue-mãe com sub-issues nativas) não aparece no remoto. | VERIFIED (GraphQL `parent`, `subIssuesSummary`) |
| R5 | As issues usam 4 labels (`accessibility`, `bug`, `documentation`, `enhancement`) e nenhum milestone. | VERIFIED |
| R6 | O `gh` 2.45.0 tem `gh project` com `create`, `field-create`, `field-list`, `item-add`, `item-edit`, `item-list`, `link` e outros subcomandos. O `field-create` só aceita `TEXT`, `SINGLE_SELECT`, `DATE` e `NUMBER` (não cria campo de iteração). O `item-edit` altera **um campo por chamada** e precisa dos IDs do item, do projeto e do campo, além do ID da opção nos campos single select. O `item-list` traz 30 itens se você não passar `-L`. Existem `gh issue create/edit --project`, mas **não há flags de sub-issue**. | VERIFIED (`--help` do binário instalado) |
| R7 | As linhas de status das stories são texto livre e não seguem um padrão. Exemplos: "In Progress — implementation authorized…", "Draft refined — planning in progress…", "Ready (`@po` GO 2026-10-22, 9/10)…". Uma busca simples por `^**Status:**` não achou linha de status em FND-1, FND-4, FND-7, OPS-1, OPS-2 nem OPS-3, e a linha `**Issue:**` não existe em todas as stories. Uma sincronização determinística não consegue extrair o status da prosa com confiança. | VERIFIED (grep em `docs/stories/*/story.md`) |
| R8 | A branch tem commits locais que não foram enviados. O que só está no repositório (por exemplo, um kanban em Markdown) fica invisível no github.com até o `@devops` fazer o push. Um quadro do Projects muda no GitHub na hora. | VERIFIED (handoff de sessão, estado do git) |

## Q1. GitHub Projects (v2): o que dá para automatizar

| Recurso | Fatos | Rótulo |
|---|---|---|
| Layouts | Tabela, quadro (kanban) e roadmap (linha do tempo). As views podem ser filtradas, ordenadas, agrupadas e salvas. | VERIFIED [about-projects] |
| Campos | Até **50 campos**, somando nativos e personalizados. Tipos personalizados: texto, número, data, single select e iteração. | VERIFIED [about-projects] |
| Limite de itens | 50.000 itens por projeto, antes 1.200 (prévia pública, 2025-02-26). Até 10.000 itens arquivados. | PARTIAL [changelog-items], [ghes-archiving] (não conferido de novo na página atual do github.com) |
| Pai e sub-issues | O campo "Parent issue" agrupa e filtra views (`parent-issue:"OWNER/REPO#N"`). O "Sub-issue progress" mostra quantas sub-issues foram concluídas. Os dois são ativados na view de tabela, em "Hidden fields". Um pai aceita até 100 sub-issues, em até 8 níveis. | VERIFIED [parent-fields], [adding-sub-issues]. Uso no layout de quadro: UNVERIFIED |
| Workflows nativos | Definir status ao adicionar, fechar issue quando o status muda, marcar Done ao fechar, arquivar automaticamente e adicionar automaticamente. Dois vêm ligados por padrão: issue ou PR fechada → Done, e PR mesclada → Done. | VERIFIED [built-in] |
| Auto-add | O plano define quantos workflows de auto-add existem: Free 1, Pro/Team 5, Enterprise 20. **Não é retroativo.** Os filtros são `is:`, `label:`, `reason:`, `assignee:` e `no:`. Não foi possível ler o plano do proprietário (`plan: null`). | VERIFIED [auto-add]; plano do proprietário UNVERIFIED |
| API | `read:project` basta para leitura. `project` é necessário para mutações. `addProjectV2ItemById` adiciona uma issue ou PR e devolve o item existente se ele já estiver lá. `updateProjectV2ItemFieldValue` define valores de texto, número, data, single select ou iteração. **Não dá para adicionar e atualizar um item na mesma chamada.** Responsáveis, labels, milestone e repositório são propriedades da issue e não mudam por mutações de projeto. | VERIFIED [api] |
| Atualizações de status do projeto | Um projeto aceita atualizações de status ("On track", "At risk" etc.) com datas de início e de alvo e uma mensagem em Markdown. Elas aparecem no cabeçalho do projeto e nas listas de projetos. A mutação GraphQL é `createProjectV2StatusUpdate`. | VERIFIED na documentação do GHES e na referência GraphQL [status-updates], [graphql-projects]; comportamento no github.com PARTIAL |
| Visibilidade | Qualquer pessoa vê um projeto público. Um projeto privado só aparece para quem tem acesso de leitura. Itens de repositórios privados continuam ocultos para quem não tem acesso ao repositório. | VERIFIED [visibility] |
| Actions | O `GITHUB_TOKEN` não acessa projetos. Automação via Actions exige um PAT, para projetos de usuário, ou um GitHub App, para projetos de organização. | VERIFIED [actions] (páginas oficiais localizadas) |
| Sub-issues pelo CLI | O `gh` **v2.94.0+** traz `--parent`, `--set-parent`, `--remove-parent`, `--blocked-by`, `--blocking` e campos JSON de pai, sub-issues e dependências. No 2.45.0 é preciso usar a API, por exemplo o endpoint REST de sub-issues ou a mutação GraphQL `addSubIssue`. | VERIFIED [cli-2.94] para as flags; a chamada exata no 2.45 é UNVERIFIED (não executada) |

**Pegadinhas**

1. Hoje o token não tem o escopo `project` (R1). O proprietário precisa rodar `gh auth refresh -s project` de forma interativa. O escopo `project` dá escrita em **todos** os projetos da conta, ou seja, é mais amplo que este repositório. VERIFIED (comportamento do escopo segundo [api]; a amplitude é PARTIAL).
2. Como cada chamada edita um campo só, atualizar um card inteiro (cerca de 8 campos) leva cerca de 8 chamadas, mais as consultas de ID. Um script deve guardar em cache os IDs de `field-list --format json`. VERIFIED (R6).
3. O workflow padrão "fechada → Done" também dispara para issues fechadas como *not planned*. Use `reason:` ou mova esses itens à mão. PARTIAL (inferido de [built-in]).
4. Deixe **desligado** o "Close issues on status change", para que só o `@devops` feche issues, de propósito. Isto é recomendação, não fato.
5. Adicionar uma issue a um projeto registra um evento "added to project" na linha do tempo da issue. É um evento, não um comentário, então não fere a regra de não comentar. PARTIAL (comportamento comum do GitHub; não conferido na documentação).
6. Não está confirmado o uso de webhooks (`projects_v2_item`) com projetos de usuário. O desenho abaixo não depende deles. UNVERIFIED [webhook-thread].
7. O limite de tamanho do campo de texto não foi encontrado. Mantenha os valores em uma linha mais links. UNVERIFIED.
8. Não está confirmado se dá para renomear as opções de um campo single select (por exemplo, as opções de Status) pelo `gh` 2.45. Planeje fazer isso uma vez pela interface. UNVERIFIED.

## Q2. Alternativas

| Opção | Custo | Dependência externa | O proprietário vê de qualquer lugar | Preserva a linha de pensamento de cada implementação | Conflitos com as regras do projeto |
|---|---|---|---|---|---|
| (a) Kanban em Markdown no repo (`docs/kanban.md` gerado a partir das stories, ou o formato Obsidian Kanban: front matter `kanban-plugin: board`, raias `##`, cards `- [ ]`) | Grátis | Nenhuma (Obsidian é opcional) | Só depois do push, e sem interface de quadro no github.com (R8) | Sim, os links ficam no repo | Nenhum. Precisa ser bilíngue (dois arquivos). O `@sm` pode escrever direto. Os detalhes do formato são PARTIAL [obsidian-kanban] |
| (b) Issues + labels + milestones, sem Projects | Grátis | GitHub | Sim | Fraco. Não há quadro nem campos de "próximo passo" ou "gate", e as labels viram status | Labels e milestones são edições de issue, então só o `@devops` mexe nelas. Sem conflito, mas com ruído |
| (c1) Linear | Plano grátis: 250 issues ativas, 2 times, API GraphQL | SaaS fora do GitHub | Sim | Sim (estados personalizados, projetos) | Duplica as issues fora do GitHub, então a rastreabilidade story↔issue exige uma sincronização. PARTIAL [linear-pricing] |
| (c2) Jira Cloud | Grátis até 10 usuários | SaaS | Sim | Sim, mas é pesado | Mesma duplicação. VERIFIED [jira-plans] |
| (c3) Trello | Grátis até 10 colaboradores por workspace | SaaS | Sim | Em parte (cards e campos personalizados) | Mesma duplicação. VERIFIED [trello-limit] |
| (c4) Notion | Não pesquisado a fundo | SaaS | Sim | Sim (bancos de dados) | Mesma duplicação. UNVERIFIED |
| (d) Repo como fonte da verdade + espelho no GitHub Projects | Grátis | GitHub (já em uso) | Sim, ao vivo | Sim: o card guarda campos curtos com links para a story, o gate, a pesquisa e a PR | Nenhum, desde que só o `@devops` escreva no GitHub e nada seja gravado como comentário |

## Q3. Desenho do card para a linha de pensamento de uma implementação

O desenho segue um princípio: **o card não repete a story, ele aponta para ela.** Cada card é a issue real da story (não um item rascunho), então a rastreabilidade continua nativa. Itens rascunho só servem para ideias que ainda não têm story, e só se o `@sm` pedir.

| Campo (tipo) | Responsável | Conteúdo |
|---|---|---|
| Status (single select) | `@devops`, a partir da story | `Backlog`, `Draft`, `Ready`, `InProgress`, `InReview`, `Done`, mais `Blocked`. Espelham o ciclo de vida da story |
| Gate (single select) | `@devops`, a partir da story | `PO`, `UX`, `Architect`, `Data`, `QA plan`, `Dev`, `QA gate`, `Owner`, `PR/merge` |
| Agente (single select) | `@devops`, a partir da story ou do handoff | Agente responsável pelo próximo passo |
| Próximo passo (texto) | `@devops`, a partir da story ou do handoff | Uma frase |
| Por quê / decisão (texto) | O `@sm` escreve, o `@devops` publica | Uma frase e um link para a âncora da decisão (Change Log da story ou arquivo de decisão) |
| Evidência (texto) | `@devops` | Links para o último gate do `@qa` e para a nota de pesquisa |
| Story (texto) | `@sm` | Caminho ou URL de `docs/stories/<ID>/story.md` (a versão pt-BR é linkada a partir dela) |
| Prioridade (single select) | `@sm` | `P0` a `P3` |
| Tamanho (single select) | `@sm` | `XS` a `XL` (dificuldade) |
| Ordem (número) | `@sm` | Ordem de execução dentro de uma prioridade |
| Depende de (texto) | `@sm` | Números das issues. Vínculos nativos de "blocked by" exigem gh 2.94+ ou a API |
| Atualizado em (data) | `@devops` | Data da última sincronização |
| Parent issue / Sub-issue progress (nativos) | GitHub | Agrupamento por roadmap (depende de corrigir a lacuna R4) |
| PR vinculada (nativo) | GitHub | Automática quando a PR referencia a issue |

**Views:** `Quadro por Status` para o acompanhamento diário, `Tabela por Prioridade/Ordem` para o planejamento do `@sm`, `Roadmap por issue-mãe`, e `Bloqueado/Proprietário` para mostrar o que depende do proprietário.

**Narrativa por sessão:** ao fim de cada sessão, o `@devops` publica uma atualização de status do projeto com o resumo do handoff e os links (uma nota "On track"/"At risk"). Isso não é comentário em issue.

## Q4. Governança (decisão do proprietário aplicada)

A divisão de autoridade não muda: a escrita no GitHub continua com o `@devops` (`agent-authority.md`, `AGENTS.md`), e o `@sm` ganha um artefato de planejamento no repositório.

1. **O `@sm` organiza, no repositório.** Ele mantém um plano do quadro legível por máquina com ID, prioridade, tamanho, ordem, dependências, link dos requisitos e link do por quê/decisão. O plano é bilíngue se tiver prosa. O `docs/process/backlog-inventory.md` que o `@sm` está escrevendo pode ser o lugar natural, mas quem decide são o `@sm` e o `@po`. Status e gate **não** são digitados pelo `@sm`. Eles vêm da story e dos arquivos de gate.
2. **A story é a fonte da verdade de status, gate e próximo passo.** Por causa do R7, inclua no template de story um bloco curto e padronizado (por exemplo, uma seção `Board` fixa ou front matter com `status`, `gate`, `agent`, `next_step`, `issue`). Essa mudança no template é do `@po` e do `@sm`. Quem atualiza o bloco segue o `story-lifecycle.md`: o `@po` marca Ready, o `@dev` marca InProgress/InReview, o `@qa` registra o veredito, e assim por diante.
3. **O `@devops` mantém o quadro atualizado.** Ele roda a sincronização em gatilhos fixos: transição de status da story, veredito do `@qa`, issue criada, PR aberta ou mesclada, e fim de sessão. Por enquanto roda à mão com `gh project item-add/item-edit`, e depois com um script determinístico.
4. **O orquestrador mantém a sincronização.** Em cada gatilho, o `@aiox-master` pede ao `@devops` para rodar a sincronização e diz qual story mudou. Uma story futura, com issue própria, implementação do `@dev` e gate do `@qa`, pode criar um script como `npm run board:sync -- --dry-run`. O script leria o plano do `@sm` e os blocos das stories, compararia com `gh project item-list --format json` e aplicaria só as diferenças. O `@devops` revisaria o dry-run antes de aplicar. Por ser código do repositório, o script precisa de uma story. Ele nunca escreveria comentários em issues.

## Recomendação

Opção (d): o repositório continua sendo a fonte da verdade, e um GitHub Project (v2) de usuário, vinculado ao repositório, é a visão do proprietário. Não adote ferramentas SaaS, porque elas duplicariam as issues fora do GitHub. Não adote um kanban em Markdown como visão principal, porque ele fica invisível até o push e não tem interface de quadro.

## Limitações

- Não foi possível inspecionar os 5 projetos existentes nem o plano do GitHub do proprietário (falta `read:project`; `plan: null`).
- Nenhum comando `gh project` nem mutação GraphQL foi executado. O comportamento dos comandos vem do `--help` e da documentação.
- O Notion não foi avaliado. Os detalhes de Linear e Obsidian vêm em parte de fontes secundárias.
- O uso do Projects no GitHub Mobile não foi verificado.

## Fontes (acessadas em 2026-10-24)

Mesmas fontes da versão em inglês, com os mesmos marcadores:

- [about-projects] https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
- [built-in] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations
- [auto-add] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically
- [api] https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- [parent-fields] https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-parent-issue-and-sub-issue-progress-fields
- [adding-sub-issues] https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
- [cli-2.94] https://github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli/
- [changelog-items] https://github.blog/changelog/2025-02-26-increased-items-in-github-projects-now-in-public-preview
- [ghes-archiving] https://docs.github.com/en/enterprise-server@3.15/issues/planning-and-tracking-with-projects/automating-your-project/archiving-items-automatically
- [visibility] https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects
- [status-updates] https://docs.github.com/en/enterprise-server@3.20/issues/planning-and-tracking-with-projects/sharing-project-updates
- [graphql-projects] https://docs.github.com/en/graphql/reference/projects
- [actions] https://docs.github.com/de/enterprise-server@3.14/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions
- [webhook-thread] https://github.com/dessant/issue-states/issues/2
- [linear-pricing] https://linear.app/pricing
- [jira-plans] https://support.atlassian.com/jira-cloud-administration/docs/explore-jira-cloud-plans/
- [trello-limit] https://support.atlassian.com/trello/docs/workspace-user-limit/
- [obsidian-kanban] https://community.obsidian.md/plugins/kanban e https://community.obsidian.md/plugins/plain-text-kanban
