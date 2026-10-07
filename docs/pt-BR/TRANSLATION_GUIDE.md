# Guia de contribuição de traduções

[English](../TRANSLATION_GUIDE.md)

Este guia explica como contribuir com traduções do produto. O locale-fonte é o português brasileiro (`pt-BR`), que também é o fallback seguro. Inglês (`en`) e espanhol (`es`) são os locales obrigatórios mantidos pelo projeto.

## Organização dos catálogos

Adicione um arquivo TSV UTF-8 sem BOM para cada módulo suportado:

```text
apps/web/localization/catalogs/<module>/<locale>.tsv
```

Use o identificador canônico do locale no nome (por exemplo, `de` ou `fr-CA`). Copie o arquivo `pt-BR.tsv` correspondente ao módulo, preserve todas as chaves e traduza somente o valor depois da tabulação. Nomes, descrições de recompensa e templates escritos pelo streamer ficam fora dos catálogos de produto; a aplicação os preserva exatamente como foram escritos.

## Modelo

Cada linha segue `chave<TAB>tradução`. As linhas abaixo mostram a estrutura: substitua a chave e o valor de exemplo pelas entradas correspondentes do catálogo-fonte e mantenha uma tabulação literal como separador:

```text
translation.unavailable<TAB>Texto do produto indisponível.
module.example.title<TAB>Título traduzido
queue.count.one<TAB>{count} pessoa aguardando
queue.count.other<TAB>{count} pessoas aguardando
```

`<TAB>` representa um caractere de tabulação, não os seis caracteres literais. Preserve os nomes dos placeholders, como `{count}`, `{user}` e `{seconds}`. Os valores são texto puro: não inclua HTML, marcação, expressões executáveis, caracteres de controle ou detalhes de erros do backend.

## Plurais

As chaves de plural usam a chave base da mensagem seguida da categoria exigida por `Intl.PluralRules` para aquele locale, como `queue.count.one` e `queue.count.other` em inglês. Alguns locales exigem categorias adicionais, como `zero`, `two`, `few` ou `many`; copie as categorias indicadas pela validação e traduza cada forma obrigatória. Não presuma que outro idioma segue as regras de plural do inglês.

## Contribuição e validação

1. Escolha um identificador canônico de locale e copie o `pt-BR.tsv` de cada módulo para o mesmo diretório, usando `<locale>.tsv`.
2. Traduza somente os valores. Preserve chaves, placeholders, sufixos de categoria plural e o sentido do texto-fonte.
3. Execute `npm run validate:localization`; o comando verifica identificadores, módulos obrigatórios, paridade de chaves/placeholders, categorias plurais e conteúdo inseguro.
4. Execute `npm test` e inclua os resultados da validação e dos testes na pull request. Peça revisão dos mantenedores para conferir sentido, gramática e terminologia antes do merge.
5. Envie juntos os arquivos de todos os módulos. Um locale comunitário só é oferecido quando o catálogo está completo e válido em todos os módulos descobertos. O bot em execução verifica novamente os catálogos montados; uma contribuição válida não exige alterar um registro de locales nem reconstruir a aplicação.

Catálogos incompletos ou inválidos são ignorados na descoberta e não substituem o locale selecionado. Ao relatar um problema do validador, informe locale e módulo sem incluir dados privados de usuários ou segredos.
