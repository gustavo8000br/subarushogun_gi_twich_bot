# Como contribuir

[Read in English](../CONTRIBUTING.md) · [Voltar ao README](../../README.pt-BR.md)

O repositório está privado atualmente. Contribuições exigem acesso e devem seguir a story ativa e sua issue GitHub.

## Antes de mudar comportamento

1. Leia a story correspondente, critérios de aceite, restrições de arquitetura e issue.
2. Siga **Red → Green → Refactor** antes de cada mudança de comportamento, correção de bug ou requisito. Registre comando/resultado Red reais e evidências Green/refatoração nas stories em inglês e pt-BR.
3. Use testes de integração com PostgreSQL real para garantias do banco. Use fakes nas fronteiras externas Twitch; nunca declare comportamento Twitch real com base em fake.
4. Mantenha o código do produto em JavaScript ESM com JSDoc. Não introduza TypeScript, transpiler ou bundler de frontend.
5. Atualize todo documento afetado em inglês e sua versão equivalente em pt-BR no mesmo incremento. Preserve equivalência de comandos, caminhos, IDs, datas, evidências e significado. Atualize os changelogs de usuários e internos quando aplicável.
6. Atualize checklist e lista de arquivos da story. Informe verificações que não puderam rodar; não alegue validação não observada.

## Padrão de documentação e README

- Inglês é a documentação principal do projeto; mantenha versão equivalente em pt-BR de todo guia para usuários ou contribuidores.
- Mantenha `README.md` e `README.pt-BR.md` como páginas de entrada concisas, com **no máximo 120 linhas** cada. Inclua resumo curto do produto/estado, início rápido compacto, índice de documentação, estado do projeto, caminho para contribuição e licença.
- Coloque instruções detalhadas em guias específicos: instalação, operação do produto, desenvolvimento, contribuição, roadmap, integrações, versionamento e stories.
- Não duplique procedimentos longos entre README e guia. O README deve apontar para o guia que mantém o procedimento.
- Mantenha os READMEs paralelos estruturalmente, com links recíprocos de idioma e comandos/links equivalentes.
- Prefira seções curtas, títulos descritivos, listas concisas e tabelas somente para comparações diretas ou resumos de status. A primeira tela deve ser útil sem obrigar a leitura de um índice longo.

## Verificações de desenvolvimento

Use Node.js `24.20.0` e instale dependências fixadas com `npm ci`. Antes de pedir revisão, rode as verificações do [guia de desenvolvimento](DESENVOLVIMENTO.md) e os gates específicos da story. Não remova os volumes da instalação Compose ativa durante os testes.

## Commits e pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<tipo>(<escopo opcional>): <resumo no imperativo>
```

Exemplos: `feat(queue): add atomic manual ordering`, `fix(outbox): retry uncertain updates safely`, `docs(readme): clarify first-run links`.

Trabalhe em branch derivada de `main`, abra pull request e faça merge pelo fluxo do repositório. Releases, tags e promoção de estágio seguem [VERSIONING](VERSIONING.md); a promoção de estágio exige aprovação do proprietário.

## Tratamento seguro

Nunca envie `.env`, volumes Docker, dumps de banco, credenciais/tokens Twitch, códigos OAuth, senhas de banco ou payloads brutos de chat/resgate. Consulte o [guia de instalação e dados locais](INSTALACAO.md) e o [manual do usuário](MANUAL_DE_USUARIO-pt_BR.md).

## Catálogos de tradução do produto

Consulte o [guia de contribuição de traduções](TRANSLATION_GUIDE.md) para formato, caminhos por módulo/locale, completude, plurais e validação. Execute `npm run validate:localization` após alterar catálogos.
