# Translation contribution guide

[Português brasileiro](pt-BR/TRANSLATION_GUIDE.md)

This guide explains how to contribute product translations. The product source locale is Brazilian Portuguese (`pt-BR`); it is also the safe fallback. English (`en`) and Spanish (`es`) are required first-party locales.

## Catalog layout

Add one UTF-8, no-BOM TSV file for every supported product module:

```text
apps/web/localization/catalogs/<module>/<locale>.tsv
```

Use the canonical locale identifier in the filename (for example, `de` or `fr-CA`). Copy the matching `pt-BR.tsv` file for the module, preserve every key and translate only the value after the tab. Keep streamer-authored names, reward descriptions, and templates outside product catalogs; the application preserves those verbatim.

## Template

Each row is exactly `key<TAB>translation`. The lines below show the structure; replace the sample key/value with the corresponding source catalog entries and keep the literal tab separator:

```text
translation.unavailable<TAB>Product text unavailable.
module.example.title<TAB>Translated title
queue.count.one<TAB>{count} person waiting
queue.count.other<TAB>{count} people waiting
```

`<TAB>` above means one actual tab character, not the six literal characters. Keep placeholder names unchanged, such as `{count}`, `{user}`, or `{seconds}`. Values are plain text: do not add HTML, markup, executable expressions, control characters, or backend error details.

## Plurals

Plural message keys use the source message key followed by the category required by `Intl.PluralRules` for that locale, such as `queue.count.one` and `queue.count.other` in English. Some locales require additional categories such as `zero`, `two`, `few`, or `many`; copy the categories reported by validation and translate every required form. Do not assume English plural rules apply to another language.

## Contribute and validate

1. Choose a canonical locale identifier and copy every module's `pt-BR.tsv` to the same module directory using `<locale>.tsv`.
2. Translate values only. Preserve keys, placeholders, plural category suffixes, and the source meaning.
3. Run `npm run validate:localization`; it checks locale identifiers, required modules, key and placeholder parity, plural categories, and unsafe content.
4. Run `npm test` and include the validation/test results in your pull request. Ask maintainers to review meaning, grammar, and terminology before merge.
5. Submit all module files together. A community locale is offered only when its catalog is complete and valid across every discovered module. The running bot rescans mounted catalogs, so a valid contribution does not require a locale registry change or application rebuild.

Incomplete or invalid catalogs are ignored by locale discovery; they do not replace the currently selected locale. Report a validator issue with the locale/module path, but do not include private user data or secrets.
