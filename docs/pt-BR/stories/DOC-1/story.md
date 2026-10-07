# DOC-1 — README conciso e navegação por guias

[English](../../../stories/DOC-1/story.md)

**Status:** Ready for Review na PR #35. Testes de contrato do README/documentação passaram 22/22; os 653 testes e gates locais do repositório passaram.
**Capacidade:** Documentação e início de uso do projeto
**Issue GitHub:** Nenhuma; solicitação direta do proprietário do projeto.

## História

Como streamer, operador ou contribuidor,
quero que o README da raiz me oriente rapidamente e aponte para guias específicos,
para encontrar instalação, operação do produto, desenvolvimento, contribuição e roadmap sem percorrer um documento longo com assuntos misturados.

## Critérios de aceite

1. Os dois READMEs da raiz são páginas de entrada profissionais e paralelas em inglês/pt-BR, com no máximo 120 linhas.
2. Instalação por plataforma, uso do produto, desenvolvimento, regras de contribuição e roadmap ficam em guias específicos com links recíprocos entre idiomas.
3. Links locais do README resolvem e os guias apontam para a versão correta no outro idioma.
4. A documentação de contribuição define o mesmo padrão de estrutura/tamanho para manter a consistência em alterações futuras.
5. Nenhum comando operacional, limite de segurança, resultado de teste ou status atual de story é contradito pelas novas páginas de navegação.
6. Changelogs, esta story e o índice de stories registram a mudança somente documental nos dois idiomas.

## Evidências TDD

- **Red — contrato estrutural:** `npx vitest run tests/unit/readme-structure.test.js` falhou 5/5 antes das mudanças. Ambos os READMEs tinham 447 linhas (limite esperado: 120), faltavam links para guias específicos e nenhum guia de contribuição definia o padrão.
- **Green:** `npx vitest run tests/unit/readme-structure.test.js` passou 7/7 após criar páginas de entrada concisas, guias bilíngues específicos e o padrão de contribuição. O contrato verifica limites de linhas, links recíprocos de idioma/guias, links locais dos READMEs e o padrão escrito de 120 linhas.
- **Migração dos contratos de regressão:** o primeiro `npm test` completo após a reorganização revelou 10 falhas em contratos documentais antigos que ainda buscavam instalação, atualizador, OBS e roadmap nos READMEs da raiz. Nenhum comportamento do produto falhou. Ajustei as verificações para ler os guias bilíngues específicos e refletir os nomes atuais dos scripts e as evidências registradas da FND-7.
- **Green após a migração:** `npx vitest run tests/unit/readme-structure.test.js tests/unit/documentation-contract.test.js tests/unit/fnd7-documentation-contract.test.js` passou 22/22. `npm test` passou 653/653 em 88 arquivos; lint, typecheck, validação de versão/localização/denylist de portas, OpenGrep, configuração Compose e `git diff --check` passaram.
- **Refatoração:** movi pré-requisitos por plataforma e confiança do certificado para os guias de instalação; removi pré-requisitos do manual operacional e o liguei ao guia de instalação; separei desenvolvimento/contribuição e o roadmap completo. Atualizei os nomes dos scripts de atualização/desinstalação para os nomes canônicos e incluí comandos concisos para estado/logs nos manuais. O manual aponta às etapas de instalação sem depender de um README longo.

## Lista de arquivos

`README.md`; `README.pt-BR.md`; `docs/INSTALLATION.md`; `docs/pt-BR/INSTALACAO.md`; `docs/USER_GUIDE-en_US.md`; `docs/MANUAL_DE_USUARIO-pt_BR.md`; `docs/DEVELOPMENT.md`; `docs/pt-BR/DESENVOLVIMENTO.md`; `docs/CONTRIBUTING.md`; `docs/pt-BR/CONTRIBUICAO.md`; `docs/ROADMAP.md`; `docs/pt-BR/ROADMAP.md`; `docs/stories/DOC-1/story.md`; `docs/pt-BR/stories/DOC-1/story.md`; `docs/stories.md`; `docs/pt-BR/stories.md`; `tests/unit/readme-structure.test.js`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.
