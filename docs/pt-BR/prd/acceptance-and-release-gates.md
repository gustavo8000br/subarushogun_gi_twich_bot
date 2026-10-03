# Aceitação e gates de release
[English](../../prd/acceptance-and-release-gates.md)


Os critérios AC-1 a AC-20 estão definidos em `stories/FND-0/spec/requirements.json` e são os comportamentos testáveis autoritativos. Todo comportamento começa com testes. As evidências exigidas incluem unitários, contratos reais de PostgreSQL isolado/migrations, contratos/aceitação de Compose, testes de privacidade e segurança, checagem de materialização de versão e paridade documental bilíngue. Os gates do projeto também incluem `npm run lint`, `npm run typecheck`, `npm test`, build e verificações de banco, Compose e versão, quando implementados.
