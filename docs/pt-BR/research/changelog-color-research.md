# Destaque por cor e estrutura dos changelogs públicos — nota de pesquisa

[English](../../research/changelog-color-research.md)

- Autoria: `@analyst` (Atlas). Data: 2026-10-28. Pedido do proprietário por meio do `@aiox-master` (um agente extra, só desta vez).
- Índice de pesquisa: linha 24 em [`docs/pt-BR/research-index.md`](../research-index.md). Antes desta nota o tema não estava no índice (GAP).
- Rótulos: **VERIFIED** quando uma fonte oficial, uma resposta da API do GitHub ou o código deste repositório confirmou. **PARTIAL** quando a fonte era incompleta, secundária ou relato da comunidade. **UNVERIFIED** quando é inferência.
- Escopo: só os changelogs públicos por estágio (`CHANGELOG-<estágio>.md` e `docs/pt-BR/CHANGELOG-<estágio>.md`; o par beta é o alvo atual). O `CHANGELOG_INTERNAL.md` é interno e fica fora. Nenhum changelog, `AGENTS.md`, teste ou script foi editado. Nada foi publicado no GitHub; as únicas chamadas remotas foram de leitura (`GET` de releases de repositórios públicos) e o endpoint sem estado `POST /markdown`.
- Pesquisa documental mais sondagens pela API. Não substitui olhar um rascunho de release real no github.com, os apps móveis do GitHub ou um leitor de tela (ver "Limitações").

## Pergunta

O proprietário quer que os changelogs públicos destaquem por cor o que foi **adicionado, alterado, removido, corrigido e incompatível**. Quais mecanismos do Markdown do GitHub fazem isso de forma confiável (tema claro/escuro, release notes, celular, editores, leitores de tela) e como estruturar os dois changelogs públicos?

## Restrições encontradas neste repositório

| # | Achado | Rótulo |
|---|---|---|
| R1 | `apps/infra/scripts/create-release-notes.mjs` acha a seção da versão com `line === "## <título>"` e a encerra na próxima linha que começa com `## `. Um título como `## v0.2.0-beta - 2026-10-28` ou `## 🚀 v0.2.0-beta` **quebraria a geração das release notes**. Datas, emoji e selos não podem ir na linha `## v…`, e nenhum título `## ` pode aparecer dentro de uma versão. | VERIFIED (código) |
| R2 | O corpo da release é montado como `# <identidade>` / `## English` / seção en / `## Português brasileiro` / seção pt-BR. Os títulos de categoria `### …` ficam um nível abaixo do título do idioma, então a hierarquia continua válida. | VERIFIED (código) |
| R3 | `tests/unit/release-notes.test.js` confere os títulos `## vX.Y.Z-beta`, a ordem (mais recente primeiro) e algumas frases. Não confere `### Added`/`### Adicionado`, então renomear ou decorar os títulos de categoria não o quebra. | VERIFIED (código) |
| R4 | `tests/unit/documentation-contract.test.js` exige "conciso, sem jargão, no máximo 5 itens por seção" **só nos arquivos alpha**. O beta não tem esse teste hoje. | VERIFIED (código) |
| R5 | `CHANGELOG-beta.md` usa `### Added / Changed / Fixed`; a cópia pt-BR usa `### Adicionado / Alterado / Corrigido`. Não há `Removed`, `Deprecated`, `Security` nem seção de incompatibilidade. Na `v0.2.0-beta` a mudança incompatível (links do OBS passaram de `/overlay.html?...` para `/overlay?...`) está no meio de **Alterado** e se repete em **Corrigido**. Na `v0.1.0-beta` uma remoção ("Removed Hide/Archive from normal queue controls") está em **Corrigido**. Nenhuma entrada tem data nem link de issue. | VERIFIED (leitura do arquivo) |
| R6 | Os links relativos diferem entre idiomas (`docs/pt-BR/...` no en, `../../...` no pt-BR). Os dois corpos são colados numa única GitHub Release, onde links relativos são resolvidos a partir da URL da página da release. Um link relativo para um arquivo de story ficaria quebrado na release. A API `/markdown` manteve `docs/stories/OPS-15/story.md` como `href` relativo. | VERIFIED (render) para o href; UNVERIFIED que dê 404 na página da release |

## Achados

### 1. Discussão 31570 da comunidade ("How to add colored text to GitHub Markdown")

| # | Achado | Rótulo |
|---|---|---|
| D1 | Aberta em 2022-09-01. A resposta aceita (2022-09-06) usa cor do MathJax: `$${\color{red}Red}$$`, depois `\textcolor`, `\textsf` e hex como `\color{#ff0000}`. | VERIFIED (página da discussão) |
| D2 | Alternativas rejeitadas ou limitadas na thread: blocos `diff` (`+ - ! @@`, "inadequados" para o autor), HTML/CSS inline (sanitizado), imagens (o texto não pode ser copiado), sintaxes próprias que o GitHub nunca adotou. | VERIFIED (página da discussão) |
| D3 | Problemas relatados: links não podem ser coloridos; LaTeX não renderiza dentro de blocos de código; os **apps do GitHub para iOS/iPadOS (2024-11-25) e Android (2025-04-27) mostram a expressão crua** em vez do texto colorido; em 2025-05/06 houve relatos de que o truque **parou de funcionar e depois voltou**, sem explicação. | PARTIAL (relatos de usuários, não declarações do GitHub) |
| D4 | **Nenhuma resposta da equipe do GitHub** e nenhum suporte oficial a texto colorido. A conclusão da thread é "um contorno pela renderização matemática, não um recurso". | VERIFIED (ausência na página) |

### 2. O que o GitHub Flavored Markdown renderiza hoje

Sondagem: o mesmo Markdown enviado a `POST /markdown` com `mode: gfm` (renderizador usado no contexto de repositório) e `mode: markdown` (simples), em 2026-10-28.

| Mecanismo | Renderiza no github.com | Tema claro/escuro | Release notes | Celular, editores, feeds | Leitor de tela / cópia | Rótulo |
|---|---|---|---|---|---|---|
| **Alertas** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | Sim no `gfm` (`<div class="markdown-alert markdown-alert-warning">`, ícone com `aria-hidden="true"` e **título em texto "Warning"**). No modo `markdown` simples vira citação com o texto literal `[!WARNING]`. | As cores vêm do tema do GitHub e se adaptam aos temas claro, escuro e de alto contraste. | **Sim.** O `body_html` de releases reais (`cli/cli` v2.103.0, `obsproject/obs-studio` 32.2.2) contém `markdown-alert-important`. | Desconhecido nos apps móveis; editores sem suporte (por exemplo a prévia nativa do VS Code, segundo relatos da comunidade) mostram uma citação comum com `[!WARNING]` como texto, ainda legível. | O título é texto real ("Warning") e o ícone fica oculto da tecnologia assistiva. A cópia preserva o texto. | VERIFIED (docs, API, releases reais); celular/editores UNVERIFIED/PARTIAL |
| **Bloco cercado `diff`** (`+` verde, `-` vermelho, `!` laranja, `#` cinza, `@@` roxo) | Sim (`highlight-source-diff` com classes `pl-mi1`, `pl-md`, `pl-mc`, `pl-c`, `pl-mdr`). | Cores de sintaxe que seguem o tema. | Blocos de código renderizam em releases (código cercado padrão). | Editores costumam destacar `diff` também. | Lido como "mais Added line" / "menos …". A cópia leva os prefixos `+`/`-`. **Sem links, negrito ou referência a issue dentro do bloco**; linhas longas não quebram (rolagem horizontal); `class="notranslate"` impede tradução do navegador. | VERIFIED (render); releases PARTIAL (não foi observada release com `diff`) |
| **Cor em matemática** `$\color{red}{…}$`, `$${\color{…}…}$$` | Superfícies suportadas segundo a doc: issues, discussions, PRs, wikis e arquivos Markdown. A renderização é **no cliente**: a API devolve `<math-renderer>` com o texto `$…$` cru. | Cor fixa escolhida por nós; não se adapta ao tema, então o contraste não é garantido nos dois temas. | **Fora da lista documentada** de superfícies com matemática. | LaTeX cru onde o JavaScript do GitHub não roda: apps móveis (D3), consumidores da API, feeds Atom/RSS de releases, notificações por e-mail, editores locais. | Renderizado como matemática (MathJax), não como texto comum; links impossíveis; histórico de regressões (D3). | VERIFIED (docs, API); releases UNVERIFIED |
| **Emoji** (Unicode ou `:shortcode:`) | Sim; shortcodes viram Unicode (`:sparkles:` -> ✨). | Emoji mantêm as próprias cores nos dois temas. | Sim (texto). | Emoji Unicode aparece em todo lugar (celular, editores, terminais, feeds). `:shortcodes:` aparecem como texto fora do GitHub. | Leitores de tela leem o nome do emoji ("quadrado verde", "green square"), uma palavra curta antes do título. | VERIFIED (docs, API); texto lido pelo leitor de tela PARTIAL |
| **HTML/CSS inline** `<span style>`, `<font color>` | **Não.** `style` e `<font>` são removidos (o span sobra sem estilo, a tag font some). | — | — | — | — | VERIFIED (API, README do github/markup) |
| `<details>`, `<mark>`, `<kbd>`, `<ins>`, `<del>`, `<sup>` | Mantidos. `<mark>` tem destaque do tema; `<ins>`/`<del>` são só sublinhado/riscado. | Seguem o tema. | Provavelmente o mesmo sanitizador (UNVERIFIED). | Editores variam. | `<details>` esconde o conteúdo até expandir. | VERIFIED (API) |
| **Selos** (imagens do shields.io) | Sim, via proxy `camo.githubusercontent.com`. | Cores fixas da imagem; variantes claro/escuro exigem `<picture>` (mantido, dentro de `<themed-picture>`). | Sim (imagens). | Dependem de rede; editores offline e alguns feeds mostram só o `alt`. Dependência de serviço externo. | Só o `alt` é lido; o texto não pode ser selecionado. | VERIFIED (API) |
| **Amostra de cor** `` `#0969DA` `` | Só em issues, PRs e discussions (um ponto ao lado do código hex). | — | Não em arquivos. | — | Mostra um código, não um significado. | VERIFIED (docs, API) |

Orientação do próprio GitHub para alertas: "limit them to one or two per article", "avoid placing alerts consecutively" e "Alerts cannot be nested within other elements" (VERIFIED, docs). Significado oficial: WARNING = "Urgent info that needs immediate user attention to avoid problems"; CAUTION = "Advises about risks or negative outcomes of certain actions" (VERIFIED pelo post do changelog do GitHub e cópias da doc; PARTIAL quanto ao texto atual exato).

### 3. Acessibilidade

- WCAG 2.2, critério 1.4.1 Uso de Cor: a cor não pode ser "o único meio visual de transmitir informação"; um rótulo de texto ou ícone junto da cor atende (técnica G205, falha F81). Portanto toda categoria mantém o **título em texto**; a cor é um segundo sinal (VERIFIED, W3C).
- Contraste (critério 1.4.3, texto 4,5:1): alertas, emoji e cores de sintaxe são controlados pelo GitHub/SO e se adaptam ao tema; uma cor fixa em `\color{…}` ou num selo é escolhida por nós e pode falhar em um dos temas (VERIFIED quanto ao princípio; o contraste real da paleta de alertas do GitHub não foi medido aqui, UNVERIFIED).
- Pares só de cor como verde vs. vermelho são o caso clássico que falha para deficiência de visão de cores vermelho-verde; forma e texto precisam carregar o significado (PARTIAL, orientação geral de acessibilidade).

### 4. Keep a Changelog 1.1.0 e o mapeamento para pt-BR

- Princípios: para humanos; uma entrada por versão; agrupar tipos iguais; versões e seções com link; mais recente primeiro; data de lançamento exibida; dizer se segue SemVer (VERIFIED).
- Tipos: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Não há tipo "Breaking", mas "If you do nothing else, list deprecations, removals, and any breaking changes" e "it should be painfully clear when something will break" (VERIFIED).
- Tradução oficial pt-BR: `Adicionado`, `Modificado`, `Obsoleto`, `Removido`, `Corrigido`, `Segurança`; `Não publicado` para Unreleased; datas ISO 8601; versões retiradas marcadas `[YANKED]`/`[REMOVIDO]` (VERIFIED).
- [AUTO-DECISION] `Changed` -> manter o **`Alterado`** que o projeto já usa no pt-BR, em vez do `Modificado` da tradução (motivo: sem retrabalho, mesmo sentido). `Deprecated` -> **`Obsoleto`**. Incompatível -> **`Mudanças incompatíveis`** (não é tipo do Keep a Changelog; entra como bloco destacado, ver seção 5).
- SemVer 2.0.0: "Major version zero (0.y.z) is for initial development. Anything MAY change at any time"; para X > 0, uma mudança incompatível na API pública DEVE subir a MAJOR (VERIFIED). Isso bate com a política de bumps do proprietário: mudanças incompatíveis de contrato público são matéria de MAJOR, mas enquanto o projeto estiver em `0.N.0-beta` podem sair numa MINOR; `v1.0.0-beta` só quando tudo estiver validado.

## Opções comparadas

| Opção | Cor em todo lugar onde é lido | Acessível | Funciona em release notes | Links dentro | Risco | Veredito |
|---|---|---|---|---|---|---|
| A. Só títulos de categoria em texto (atual) | Sem cor | Sim | Sim | Sim | Nenhum | Base; continua sendo o sinal principal |
| B. Emoji Unicode de **quadrado colorido** antes de cada título de categoria + legenda | Sim (github.com, releases, celular, editores, terminais) | Sim, se o texto ficar (1.4.1) | Sim | Sim | Pequeno ruído no leitor de tela; o slug da âncora do título muda (UNVERIFIED) | **Recomendado** |
| C. Um alerta `> [!WARNING]` por versão para mudanças incompatíveis | Sim no github.com e em releases; citação legível nos demais | Sim (título em texto, ícone oculto) | Sim (VERIFIED) | Sim | Uso excessivo; o GitHub diz 1–2 por página | **Recomendado só para incompatibilidades** |
| D. Blocos `diff` | Sim no github.com | Fraco (prefixos lidos em voz alta, sem quebra de linha, sem tradução) | Provavelmente | **Não** | Perde links, negrito e referências a issues; ruim para prosa | Rejeitado |
| E. `\color` em matemática | Só no github.com web com JavaScript | Fraco (fonte matemática, cores fixas) | Não documentado | **Não** | LaTeX cru no celular/feeds; regressões passadas; uso não documentado | Rejeitado |
| F. Selos do shields.io | Sim onde imagens carregam | Só o `alt` | Sim | Só o link do selo | Dependência externa; offline/feeds mostram o alt | Rejeitado |
| G. HTML `style`/`<font>` | Não (removido) | — | — | — | — | Impossível |

[AUTO-DECISION] Quadrados coloridos (🟩 🟦 🟨 🟥 🟪 🟧) em vez de emoji semânticos (✨ 🔄 🗑️ 🐛 🔒) -> quadrados (motivo: o proprietário pediu **cor**, e os quadrados dão uma cor estável por categoria com a convenção conhecida do diff, verde = adicionado, vermelho = removido; o título em texto continua carregando o significado para quem não distingue cores e para leitores de tela). O conjunto semântico é alternativa aceitável se o proprietário preferir ícones à cor.

## Estrutura recomendada para os changelogs públicos

1. Título, depois uma linha de links (todos os changelogs / outro idioma), depois **uma linha de legenda** (nova). Exemplo: `Tipos: 🟩 Adicionado · 🟦 Alterado · 🟨 Obsoleto · 🟥 Removido · 🟪 Corrigido · 🟧 Segurança. Mudanças incompatíveis aparecem primeiro, num quadro de aviso.`
2. Versões da mais recente para a mais antiga, título exatamente `## vMAJOR.MINOR.PATCH-<estágio>` (sem data, emoji ou selo nessa linha, R1). O título precisa bater com o que o `create-release-notes.mjs` deriva da identidade; hoje é `vX.Y.Z-<estágio>` em todos os estágios, inclusive `-stable`. A política do proprietário chama o stable de `v1.0.0` sem sufixo; se isso for adotado, o script, o teste dele e esta regra mudam juntos (UNVERIFIED qual forma prevalece; item em aberto para `@architect`/`@dev`).
3. Primeira linha opcional da versão (texto simples, não título): `Lançado em: AAAA-MM-DD` (ISO 8601) e, quando houver, a issue pública como URL absoluta. URLs absolutas funcionam na visão do repositório, no corpo colado da release e nos dois idiomas (R6).
4. Em seguida, só se a versão tiver alguma, **um** bloco `> [!WARNING]` intitulado **Mudanças incompatíveis / Incompatible changes**. Cada item diz o que deixa de funcionar e o que a pessoa usuária precisa fazer. O mesmo item **não** se repete numa categoria abaixo. Use `> [!CAUTION]` só quando a ação puder perder dados ou envolver segurança. Nenhum outro alerta na versão (GitHub: um ou dois por página, não consecutivos).
5. Seções de categoria nesta ordem fixa, omitindo as vazias: `### 🟧 Security` / `### 🟧 Segurança`, `### 🟩 Added` / `### 🟩 Adicionado`, `### 🟦 Changed` / `### 🟦 Alterado`, `### 🟨 Deprecated` / `### 🟨 Obsoleto`, `### 🟥 Removed` / `### 🟥 Removido`, `### 🟪 Fixed` / `### 🟪 Corrigido`.
6. Itens na linguagem da pessoa usuária; uma remoção vai em Removido, nunca em Corrigido; cada item mora em um lugar só.
7. Pareamento en/pt-BR: mesmas versões, blocos, categorias, mesmo número de itens na mesma ordem, mesmos emoji; só as palavras mudam. O script de release já junta os dois.
8. Só emoji Unicode cru (sem `:shortcodes:`), sem blocos `diff`, sem `$\color$`, sem selos, sem estilo HTML inline.
9. Sem seção `Não publicado` nos arquivos públicos: o trabalho em andamento vive no `CHANGELOG_INTERNAL.md`, e o título da próxima versão-alvo é escrito quando o bump é preparado (prática atual do projeto; mantém R1 simples).

## Exemplo concreto: `v0.2.0-beta` reestruturada (só ilustração, não aplicada)

O texto é copiado do arquivo atual. Só os primeiros itens de cada categoria aparecem.

```markdown
# Histórico beta

[Todos os changelogs públicos](CHANGELOG.md) · [English](../../CHANGELOG-beta.md)

Tipos: 🟩 Adicionado · 🟦 Alterado · 🟨 Obsoleto · 🟥 Removido · 🟪 Corrigido · 🟧 Segurança. Mudanças incompatíveis aparecem primeiro, num quadro de aviso.

## v0.2.0-beta

Lançado em: AAAA-MM-DD

> [!WARNING]
> **Mudanças incompatíveis**
>
> - (item dos links do OBS `/overlay.html?...` -> `/overlay?...`, hoje em Alterado, com a ação: regenerar o link na página Widgets e colar na fonte do OBS)

### 🟩 Adicionado

- A criação de fila agora oferece uma prévia localizada e validada da mensagem de chamada no chat. ...
- A página Next.js de comandos do chat agora permite ao streamer alterar a audiência mínima dos comandos configuráveis. ...

### 🟦 Alterado

- (primeiro item atual de Alterado)

### 🟪 Corrigido

- (primeiro item atual de Corrigido)
```

O que muda em relação a hoje: o item de `/overlay.html` sai de **Alterado** e vai para o quadro de aviso; a repetição em **Corrigido** (links locais criados no formato `/overlay.html?...` não carregam mais, "conforme descrito em Alterado") é retirada ou reduzida à correção que vale só para desenvolvimento. O espelho em inglês usa `**Incompatible changes**`, `### 🟩 Added`, `### 🟦 Changed`, `### 🟪 Fixed` com o mesmo texto atual.

Na `v0.1.0-beta` (não é a mais recente; citada só como exemplo de classificação): "Removed Hide/Archive from normal queue controls" pertence a `### 🟥 Removed` / `### 🟥 Removido`, não a Corrigido.

## Regra pronta para colar no `AGENTS.md` (proposta; não aplicada)

Inglês:

```markdown
## Public changelog format

- Applies to `CHANGELOG-<stage>.md` and `docs/pt-BR/CHANGELOG-<stage>.md` (not `CHANGELOG_INTERNAL.md`). Base: Keep a Changelog 1.1.0.
- Newest version first. The version heading is exactly `## vMAJOR.MINOR.PATCH-<stage>`; never put a date, emoji, badge or link on that line, and never use `## ` inside a version (the release-notes script depends on it). An optional plain line `Released: YYYY-MM-DD` and the public issue as an absolute URL may follow the heading.
- If the version has incompatible changes (something that stops working or needs user action after the update), start the version with a single `> [!WARNING]` block titled **Incompatible changes**, one bullet per change with the required action; use `> [!CAUTION]` only for data-loss or security risk. Do not repeat those items below. No other alerts.
- Then the categories in this order, omitting empty ones, with the raw Unicode color square before the text: `### 🟧 Security`, `### 🟩 Added`, `### 🟦 Changed`, `### 🟨 Deprecated`, `### 🟥 Removed`, `### 🟪 Fixed`. Each item appears once; removals go under Removed, not Fixed.
- Color is never the only signal: keep the category text and the legend line under the title. Do not use `diff` blocks, `$\color{}$` math, badges, `:shortcodes:` or inline HTML styling.
- English and pt-BR stay equivalent: same versions, blocks, categories, emoji and bullet order.
```

Português brasileiro:

```markdown
## Formato dos changelogs públicos

- Vale para `CHANGELOG-<estágio>.md` e `docs/pt-BR/CHANGELOG-<estágio>.md` (não para o `CHANGELOG_INTERNAL.md`). Base: Keep a Changelog 1.1.0.
- Versão mais recente primeiro. O título da versão é exatamente `## vMAJOR.MINOR.PATCH-<estágio>`; nunca ponha data, emoji, selo ou link nessa linha, e nunca use `## ` dentro de uma versão (o script de release notes depende disso). Logo abaixo pode vir uma linha simples `Lançado em: AAAA-MM-DD` e a issue pública como URL absoluta.
- Se a versão tiver mudanças incompatíveis (algo que deixa de funcionar ou exige ação da pessoa usuária depois da atualização), comece a versão com um único bloco `> [!WARNING]` intitulado **Mudanças incompatíveis**, um item por mudança com a ação necessária; use `> [!CAUTION]` só para risco de perda de dados ou de segurança. Não repita esses itens abaixo. Nenhum outro alerta.
- Depois, as categorias nesta ordem, omitindo as vazias, com o quadrado colorido Unicode antes do texto: `### 🟧 Segurança`, `### 🟩 Adicionado`, `### 🟦 Alterado`, `### 🟨 Obsoleto`, `### 🟥 Removido`, `### 🟪 Corrigido`. Cada item aparece uma vez; remoções vão em Removido, não em Corrigido.
- A cor nunca é o único sinal: mantenha o texto da categoria e a linha de legenda abaixo do título. Não use blocos `diff`, matemática `$\color{}$`, selos, `:shortcodes:` nem estilo HTML inline.
- Inglês e pt-BR permanecem equivalentes: mesmas versões, blocos, categorias, emoji e ordem dos itens.
```

Próximos passos para outros papéis (não feitos aqui): `@po`/`@dev` colocam a regra fora dos blocos gerenciados pelo AIOX no `AGENTS.md`; `@dev` pode adicionar um teste de que os arquivos beta/rc/stable usam só os títulos `###` permitidos, têm no máximo um alerta por versão e mantêm paridade de categorias en/pt-BR; `@qa` confere um rascunho de release real (exige OK do proprietário) antes da primeira release com tag que use o formato.

## Limitações

- Nenhum rascunho de release foi criado (seria escrita remota). A renderização de alertas em releases está provada por duas releases de terceiros; blocos `diff` e títulos com emoji numa release são inferidos da renderização padrão de Markdown.
- Os apps móveis do GitHub, a prévia do VS Code e leitores de tela (NVDA, VoiceOver, TalkBack) **não** foram testados. O texto lido para um emoji depende do leitor de tela e do idioma dele.
- O slug de âncora que o GitHub gera para um título que começa com emoji não foi observado (a API não devolve âncoras). Os títulos de versão continuam sem emoji, então os links de versão não são afetados.
- O contraste das cores de alerta do GitHub em cada tema não foi medido.
- Os itens da discussão 31570 são relatos de usuários; não há declaração do GitHub sobre texto colorido.

## Veredito

**SUFFICIENT** para a decisão e para escrever a regra. **REVISAR SE** o GitHub documentar texto colorido nativo ou mudar/remover os alertas, o script de release notes mudar a forma de achar seções, ou o proprietário quiser matemática colorida/selos mesmo assim. Os itens em aberto (celular, leitor de tela, rascunho de release real) são fechados por uma conferência na primeira release que usar o formato, não por mais pesquisa.

## Fontes

- Discussão 31570 da GitHub Community, "How to add colored text to GitHub Markdown": https://github.com/orgs/community/discussions/31570
- GitHub Docs, Basic writing and formatting syntax (alertas, modelos de cor, emoji, `<picture>`, notas de rodapé): https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
- GitHub Docs, Writing mathematical expressions: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions
- GitHub Docs, Creating and highlighting code blocks: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks
- GitHub Changelog, anúncio dos alertas (2023-12-14): https://github.blog/changelog/2023-12-14-new-markdown-extension-alerts-provide-distinctive-styling-for-significant-content/
- README do github/markup (etapa de sanitização): https://github.com/github/markup
- API REST do GitHub, renderizar Markdown (`POST /markdown`) e `body_html` de releases (`cli/cli` release 419735650, `obsproject/obs-studio` release 370856907), consultadas em 2026-10-28
- W3C, Understanding SC 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- Keep a Changelog 1.1.0: https://keepachangelog.com/en/1.1.0/ e pt-BR https://keepachangelog.com/pt-BR/1.1.0/
- Semantic Versioning 2.0.0: https://semver.org/
