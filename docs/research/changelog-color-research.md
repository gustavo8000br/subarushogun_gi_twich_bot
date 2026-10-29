# Color highlighting and structure for the public changelogs — research note

[Português brasileiro](../pt-BR/research/changelog-color-research.md)

- Author: `@analyst` (Atlas). Date: 2026-10-28. Requested by the owner through `@aiox-master` (one extra agent, this time only).
- Research index: row 24 in [`docs/research-index.md`](../research-index.md). Before this note the topic was not in the index (GAP).
- Labels: **VERIFIED** means an official source, a GitHub API response, or this repository's code confirmed it. **PARTIAL** means the source was incomplete, secondary, or a community report. **UNVERIFIED** means it is an inference.
- Scope: public stage changelogs only (`CHANGELOG-<stage>.md` and `docs/pt-BR/CHANGELOG-<stage>.md`; the beta pair is the current target). `CHANGELOG_INTERNAL.md` is internal and out of scope. No changelog, `AGENTS.md`, test or script was edited. Nothing was published on GitHub; the only remote calls were read-only (`GET` releases of public repositories) and the stateless `POST /markdown` render endpoint.
- Desk research plus API probes. It does not replace a look at a real draft release on github.com, the GitHub mobile apps, or a screen reader (see "Limitations").

## Question

The owner wants the public changelogs to highlight by color what was **added, changed, removed, fixed, and incompatible**. Which GitHub Markdown mechanisms can do that reliably (light/dark theme, release notes, mobile, editors, screen readers), and how should the two public changelogs be structured?

## Constraints found in this repository

| # | Finding | Label |
|---|---|---|
| R1 | `apps/infra/scripts/create-release-notes.mjs` finds a version section with `line === "## <heading>"` and ends it at the next line starting with `## `. A heading such as `## v0.2.0-beta - 2026-10-28` or `## 🚀 v0.2.0-beta` would **break release-note generation**. Dates, emoji and badges must not go on the `## v…` line, and no `## ` heading may appear inside a version section. | VERIFIED (code) |
| R2 | The release body is built as `# <identity>` / `## English` / en section / `## Português brasileiro` / pt-BR section. The `### …` category headings inside each section stay one level below the language heading, so the hierarchy remains valid. | VERIFIED (code) |
| R3 | `tests/unit/release-notes.test.js` checks the `## vX.Y.Z-beta` headings, their order (newest first) and some sentences. It does not check `### Added`/`### Adicionado`, so renaming or decorating the category headings does not break it. | VERIFIED (code) |
| R4 | `tests/unit/documentation-contract.test.js` enforces "concise, no jargon, at most 5 bullets per section" **only on the alpha files**. Beta has no such test today. | VERIFIED (code) |
| R5 | `CHANGELOG-beta.md` uses `### Added / Changed / Fixed`; the pt-BR copy uses `### Adicionado / Alterado / Corrigido`. There is no `Removed`, `Deprecated`, `Security` or breaking section. In `v0.2.0-beta` the incompatible change (OBS links moved from `/overlay.html?...` to `/overlay?...`) sits in the middle of **Changed** and is repeated under **Fixed**. In `v0.1.0-beta` a removal ("Removed Hide/Archive from normal queue controls") sits under **Fixed**. No entry has a date or an issue link. | VERIFIED (file read) |
| R6 | Relative links in the changelogs differ between languages (`docs/pt-BR/...` in en, `../../...` in pt-BR). Both bodies are pasted into one GitHub Release, where relative links are resolved against the release page URL. A relative link to a story file would therefore be broken in the release. The `/markdown` API kept `docs/stories/OPS-15/story.md` as a relative `href`. | VERIFIED (render) for the href; UNVERIFIED that it 404s on the release page |

## Findings

### 1. Community discussion 31570 ("How to add colored text to GitHub Markdown")

| # | Finding | Label |
|---|---|---|
| D1 | Asked 2022-09-01. The accepted answer (2022-09-06) uses MathJax color: `$${\color{red}Red}$$`, later `\textcolor`, `\textsf`, and hex such as `\color{#ff0000}`. | VERIFIED (discussion page) |
| D2 | Rejected or limited alternatives in the thread: `diff` code blocks (`+ - ! @@`, "inadequate" for the author), inline HTML/CSS (sanitized), images (text cannot be copied), custom syntaxes that GitHub never adopted. | VERIFIED (discussion page) |
| D3 | Reported problems: links cannot be colored; LaTeX does not render inside code blocks; the **iOS/iPadOS (2024-11-25) and Android (2025-04-27) GitHub apps show the raw expression** instead of colored text; in 2025-05/06 users reported the trick **stopped working and then came back** with no explanation. | PARTIAL (user reports, not GitHub statements) |
| D4 | **No GitHub staff answer** and no official support statement for colored text. The conclusion of the thread is "a workaround through math rendering, not a feature". | VERIFIED (absence on the page) |

### 2. What GitHub Flavored Markdown renders today

Probe: the same Markdown sent to `POST /markdown` with `mode: gfm` (the renderer used for repository context) and `mode: markdown` (plain), on 2026-10-28.

| Mechanism | Renders on github.com | Theme light/dark | Release notes | Mobile, editors, feeds | Screen reader / copy | Label |
|---|---|---|---|---|---|---|
| **Alerts** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | Yes in `gfm` (`<div class="markdown-alert markdown-alert-warning">`, icon with `aria-hidden="true"` and a **text title "Warning"**). In plain `markdown` mode it stays a blockquote with the literal `[!WARNING]` text. | Colors come from the GitHub theme, so they adapt to light, dark and high-contrast themes. | **Yes.** The `body_html` of real releases (`cli/cli` v2.103.0, `obsproject/obs-studio` 32.2.2) contains `markdown-alert-important`. | Unknown on the mobile apps; editors without support (for example the VS Code built-in preview, per community reports) show a normal quote with `[!WARNING]` as text, which is still readable. | The title is real text ("Warning"), the icon is hidden from assistive technology. Copying keeps the text. | VERIFIED (docs, API, real releases); mobile/editors UNVERIFIED/PARTIAL |
| **Fenced `diff` block** (`+` green, `-` red, `!` orange, `#` gray, `@@` purple) | Yes (`highlight-source-diff` with `pl-mi1`, `pl-md`, `pl-mc`, `pl-c`, `pl-mdr` classes). | Theme-aware syntax colors. | Code blocks render in releases (standard fenced code). | Editors usually highlight `diff` too. | Read as "plus Added line" / "minus …". Copy keeps the `+`/`-` prefixes. **No links, bold or issue references inside a code block**; long lines do not wrap (horizontal scroll); `class="notranslate"` blocks browser translation. | VERIFIED (render); releases PARTIAL (not a release with `diff` observed) |
| **Math color** `$\color{red}{…}$`, `$${\color{…}…}$$` | Supported surfaces per the docs: issues, discussions, PRs, wikis and Markdown files. Rendering is **client-side**: the API returns `<math-renderer>` with the raw `$…$` text. | Fixed color you choose; it does not adapt to the theme, so contrast is not guaranteed on both themes. | **Not in the documented list** of math surfaces. | Raw LaTeX in any place that does not run GitHub's JavaScript: mobile apps (D3), API consumers, Atom/RSS release feeds, email notifications, local editors. | Rendered as math (MathJax), not as normal text; links impossible; history of regressions (D3). | VERIFIED (docs, API); releases UNVERIFIED |
| **Emoji** (Unicode or `:shortcode:`) | Yes; shortcodes are converted to Unicode (`:sparkles:` -> ✨). | Emoji keep their own colors on both themes. | Yes (plain text). | Raw Unicode emoji show everywhere (mobile, editors, terminals, feeds). `:shortcodes:` show as text outside GitHub. | Screen readers read the emoji name ("green square", "quadrado verde"), adding one short word before the heading. | VERIFIED (docs, API); screen-reader wording PARTIAL |
| **Inline HTML/CSS** `<span style>`, `<font color>` | **No.** `style` and `<font>` are stripped (the span survives without style, the font tag disappears). | — | — | — | — | VERIFIED (API, github/markup README) |
| `<details>`, `<mark>`, `<kbd>`, `<ins>`, `<del>`, `<sup>` | Kept. `<mark>` has a theme highlight; `<ins>`/`<del>` are only underline/strikethrough. | Theme-aware. | Probably the same sanitizer (UNVERIFIED). | Editors vary. | `<details>` hides content until expanded. | VERIFIED (API) |
| **Badges** (shields.io images) | Yes, proxied through `camo.githubusercontent.com`. | Fixed image colors; dark/light variants need `<picture>` (kept, wrapped in `<themed-picture>`). | Yes (images). | Network-dependent; offline editors and some feeds show only `alt`. External service dependency. | Only the `alt` text is read; the text cannot be selected. | VERIFIED (API) |
| **Color swatch** `` `#0969DA` `` | Only in issues, PRs and discussions (a small dot next to a hex code). | — | Not in files. | — | Shows a code, not a meaning. | VERIFIED (docs, API) |

GitHub's own guidance for alerts: "limit them to one or two per article", "avoid placing alerts consecutively", and "Alerts cannot be nested within other elements" (VERIFIED, docs). Official meaning: WARNING = "Urgent info that needs immediate user attention to avoid problems"; CAUTION = "Advises about risks or negative outcomes of certain actions" (VERIFIED via the GitHub changelog post and docs copies; PARTIAL for exact current wording).

### 3. Accessibility

- WCAG 2.2 SC 1.4.1 Use of Color: color must not be "the only visual means of conveying information"; a text label or an icon next to the color satisfies it (technique G205, failure F81). Therefore every category must keep its **text heading**; the color is a second cue (VERIFIED, W3C).
- Contrast (SC 1.4.3 text 4.5:1): alerts, emoji and theme syntax colors are controlled by GitHub/OS and adapt to the theme; a fixed `\color{…}` or a badge color is chosen by us and can fail contrast in one of the themes (VERIFIED for the principle; the actual contrast of GitHub's alert palette is not measured here, UNVERIFIED).
- Color-only pairs such as green vs. red are the classic case that fails for red-green color vision deficiency; shape and text must carry the meaning (PARTIAL, general accessibility guidance).

### 4. Keep a Changelog 1.1.0 and the pt-BR mapping

- Principles: for humans; an entry for every version; group the same types; versions and sections linkable; latest first; release date displayed; say whether SemVer is followed (VERIFIED).
- Types: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. No "Breaking" type, but "If you do nothing else, list deprecations, removals, and any breaking changes", and "it should be painfully clear when something will break" (VERIFIED).
- Official pt-BR translation: `Adicionado`, `Modificado`, `Obsoleto`, `Removido`, `Corrigido`, `Segurança`; `Não publicado` for Unreleased; ISO 8601 dates; yanked releases tagged `[YANKED]`/`[REMOVIDO]` (VERIFIED).
- [AUTO-DECISION] `Changed` -> keep the project's existing **`Alterado`** (already used in pt-BR) instead of the translation's `Modificado` (reason: no churn, same meaning). `Deprecated` -> **`Obsoleto`**. Breaking -> **`Mudanças incompatíveis`** (not a Keep a Changelog type; added as a highlighted block, see section 5).
- SemVer 2.0.0: "Major version zero (0.y.z) is for initial development. Anything MAY change at any time"; for X > 0, a backward-incompatible change to the public API MUST bump MAJOR (VERIFIED). This matches the owner's bump policy: incompatible public-contract changes are MAJOR material, but while the project is in `0.N.0-beta` they can ship in a MINOR; `v1.0.0-beta` only when everything is validated.

## Options compared

| Option | Color everywhere it is read | Accessible | Works in release notes | Links inside | Risk | Verdict |
|---|---|---|---|---|---|---|
| A. Text category headings only (current) | No color | Yes | Yes | Yes | None | Baseline, keep as the primary signal |
| B. Raw Unicode **colored square** emoji before each category heading + legend | Yes (github.com, releases, mobile, editors, terminals) | Yes if the text stays (1.4.1) | Yes | Yes | Slight screen-reader noise; anchor slug of the heading changes (UNVERIFIED) | **Recommended** |
| C. One `> [!WARNING]` alert per version for incompatible changes | Yes on github.com and releases; readable quote elsewhere | Yes (text title, hidden icon) | Yes (VERIFIED) | Yes | Overuse; GitHub says 1–2 per page | **Recommended for breaking changes only** |
| D. `diff` code blocks | Yes on github.com | Weak (prefixes read aloud, no wrap, no translation) | Probably | **No** | Loses links, bold and issue references; poor for prose | Rejected |
| E. Math `\color` | Only github.com web with JavaScript | Weak (math font, fixed colors) | Not documented | **No** | Raw LaTeX on mobile/feeds; past regressions; undocumented use | Rejected |
| F. shields.io badges | Yes where images load | `alt` only | Yes | Badge link only | External dependency, offline/feeds show alt | Rejected |
| G. HTML `style`/`<font>` | No (stripped) | — | — | — | — | Impossible |

[AUTO-DECISION] Colored squares (🟩 🟦 🟨 🟥 🟪 🟧) instead of semantic emoji (✨ 🔄 🗑️ 🐛 🔒) -> squares (reason: the owner asked for **color**, and squares give one stable color per category with the familiar diff convention green = added, red = removed; the text heading still carries the meaning for color-blind and screen-reader users). The semantic set is an acceptable alternative if the owner prefers icons over color.

## Recommended structure for the public changelogs

1. Title, then one line of links (all changelogs / other language), then **one legend line** (new). Example: `Types: 🟩 Added · 🟦 Changed · 🟨 Deprecated · 🟥 Removed · 🟪 Fixed · 🟧 Security. Incompatible changes appear first in a warning box.`
2. Versions newest first, heading exactly `## vMAJOR.MINOR.PATCH-<stage>` (no date, emoji or badge on that line, R1). The heading must match what `create-release-notes.mjs` derives from the identity; today that is `vX.Y.Z-<stage>` for every stage, including `-stable`. The owner's policy names stable `v1.0.0` without a suffix, so if that is adopted, the script, its test and this rule change together (UNVERIFIED which form wins; open item for `@architect`/`@dev`).
3. Optional first line of the version (plain text, not a heading): `Released: YYYY-MM-DD` (ISO 8601) and, when there is one, the public issue as an absolute URL. Absolute URLs work in the repo view, in the pasted release body and in both languages (R6).
4. Then, only if the version has any, **one** `> [!WARNING]` block titled **Incompatible changes / Mudanças incompatíveis**. Each bullet says what stops working and what the user must do. The same item is **not** repeated in a category below. Use `> [!CAUTION]` instead only when the action can lose data or is security sensitive. No other alerts in the version (GitHub: one or two per page, not consecutive).
5. Category sections in this fixed order, omitting empty ones: `### 🟧 Security` / `### 🟧 Segurança`, `### 🟩 Added` / `### 🟩 Adicionado`, `### 🟦 Changed` / `### 🟦 Alterado`, `### 🟨 Deprecated` / `### 🟨 Obsoleto`, `### 🟥 Removed` / `### 🟥 Removido`, `### 🟪 Fixed` / `### 🟪 Corrigido`.
6. Bullets in user language; a removal goes under Removed, never under Fixed; an item lives in exactly one place.
7. Pairing en/pt-BR: same versions, same blocks, same categories, same number of bullets in the same order, same emoji; only the words change. The release script already joins both.
8. Raw Unicode emoji only (no `:shortcodes:`), no `diff` blocks, no `$\color$`, no badges, no inline HTML styling.
9. No `Unreleased` section in public files: work in progress lives in `CHANGELOG_INTERNAL.md`, and the next target version heading is written when the bump is prepared (current project practice; keeps R1 simple).

## Concrete example: `v0.2.0-beta` restructured (illustration only, not applied)

Wording is copied from the current file. Only the first bullets of each category are shown.

```markdown
# Beta changelog

[All public changelogs](CHANGELOG.md) · [Português brasileiro](docs/pt-BR/CHANGELOG-beta.md)

Types: 🟩 Added · 🟦 Changed · 🟨 Deprecated · 🟥 Removed · 🟪 Fixed · 🟧 Security. Incompatible changes appear first in a warning box.

## v0.2.0-beta

Released: YYYY-MM-DD

> [!WARNING]
> **Incompatible changes**
>
> - OBS widget links now use the `/overlay?...` address instead of `/overlay.html?...`. An OBS browser source still configured with an older `/overlay.html` link no longer loads the widget: regenerate the link on the Widgets page and paste it into the OBS source.

### 🟩 Added

- Queue creation now offers a validated, localized preview for the viewer-call chat message. ...
- The Next.js chat commands page now lets streamers change the minimum audience for configurable commands. ...

### 🟦 Changed

- The home page is now the Overview of the Next panel. ...

### 🟪 Fixed

- The final local queue deletion confirmation now includes the queue title in the warning, so streamers can verify which queue they are removing.
```

Changes compared with today: the `/overlay.html` item leaves **Changed** and goes to the warning box; the duplicate under **Fixed** ("local links created earlier in the `/overlay.html?...` format no longer load ... as described under Changed") is dropped or reduced to the development-only fix. pt-BR mirror:

```markdown
> [!WARNING]
> **Mudanças incompatíveis**
>
> - (mesmo item, em pt-BR)

### 🟩 Adicionado
### 🟦 Alterado
### 🟪 Corrigido
```

For `v0.1.0-beta` (not the latest; mentioned only as a classification example): "Removed Hide/Archive from normal queue controls" belongs under `### 🟥 Removed` / `### 🟥 Removido`, not under Fixed.

## Rule ready to paste into `AGENTS.md` (proposal; not applied)

English:

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

Follow-ups for other roles (not done here): `@po`/`@dev` place the rule outside the AIOX-managed blocks of `AGENTS.md`; `@dev` may add a test that the beta/rc/stable files use only the allowed `###` headings, have at most one alert per version and keep en/pt-BR category parity; `@qa` checks one real draft release (owner OK needed) before the first tagged release that uses the format.

## Limitations

- No draft release was created (that would be a remote write). Alert rendering in releases is proven by two third-party releases; `diff` blocks and emoji headings in a release are inferred from standard Markdown rendering.
- The GitHub mobile apps, the VS Code preview, and screen readers (NVDA, VoiceOver, TalkBack) were **not** tested. Emoji announcement wording depends on the screen reader and its language.
- The anchor slug GitHub generates for a heading that starts with an emoji was not observed (the API does not return anchors). Version headings stay emoji-free, so version links are unaffected.
- The contrast of GitHub's alert colors in each theme was not measured.
- Discussion 31570 items are user reports; there is no GitHub statement about colored text.

## Verdict

**SUFFICIENT** for the decision and for writing the rule. **REFRESH IF** GitHub documents native colored text or changes/removes alerts, the release-notes script changes how it finds sections, or the owner wants colored math/badges anyway. The open items (mobile, screen reader, real draft release) are closed by a check during the first release that uses the format, not by more research.

## Sources

- GitHub Community discussion 31570, "How to add colored text to GitHub Markdown": https://github.com/orgs/community/discussions/31570
- GitHub Docs, Basic writing and formatting syntax (alerts, color models, emoji, `<picture>`, footnotes): https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
- GitHub Docs, Writing mathematical expressions: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions
- GitHub Docs, Creating and highlighting code blocks: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks
- GitHub Changelog, alerts announcement (2023-12-14): https://github.blog/changelog/2023-12-14-new-markdown-extension-alerts-provide-distinctive-styling-for-significant-content/
- github/markup README (sanitization step): https://github.com/github/markup
- GitHub REST API, render Markdown (`POST /markdown`) and release `body_html` (`cli/cli` release 419735650, `obsproject/obs-studio` release 370856907), queried 2026-10-28
- W3C, Understanding SC 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- Keep a Changelog 1.1.0: https://keepachangelog.com/en/1.1.0/ and pt-BR https://keepachangelog.com/pt-BR/1.1.0/
- Semantic Versioning 2.0.0: https://semver.org/
