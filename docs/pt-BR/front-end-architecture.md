# Arquitetura do Frontend: `apps/web`

[English](../front-end-architecture.md) · Comportamento do produto: [especificação do frontend](../front-end-spec.md).

## Runtime e limites

`apps/web/public` contém HTML, CSS e JavaScript vanilla estáticos servidos por `@fastify/static` no processo Fastify local. Não inclui framework frontend, TypeScript, transpiler, bundler ou hospedagem pública. O navegador nunca importa Prisma ou acessa Twitch diretamente.

## Arquivos e módulos

```text
apps/web/public/
  index.html       estrutura semântica e regiões nomeadas
  styles.css       estilos responsivos do painel local
  app.js           cliente API com sessão, renderização e handlers
```

`app.js` renderiza projeções explícitas da API usando construção DOM e `textContent`. Não passar nomes/mensagens não confiáveis por `innerHTML`. Consultar estado local em intervalo limitado; não adicionar WebSocket ao painel. Mutações são requisições explícitas com token CSRF, chave de idempotência e revisão aplicável.

## Modelo de telas

Configuração/reconexão → visão geral → lista/detalhe da fila → recuperação financeira → configuração da conta. Cada tela possui estados carregando, vazio, desconectado, desatualizado, parcial, erro e sucesso/pendente. Controles refletem o ciclo de vida, mas a validação do servidor continua autoritativa. Ações destrutivas de apagar/limpar mostram resumo revisável antes da requisição final.

## Privacidade e estado

Navegador recebe somente projeções da API autenticada da operadora. UID só é retornado enquanto modo da fila estiver visível; a projeção do estado público tem toggle mais restritivo de overlay, embora overlay não faça parte desta entrega. Segredos nunca são retornados após envio de credenciais. A UI atualiza após mudar configurações e não armazena texto de notificação renderizado.

## Verificação

Cobertura Vitest de DOM/contrato confere regiões/ações obrigatórias, tratamento de estado financeiro pendente/confirmado, feedback de validação, rótulos/foco acessíveis e renderização literal de texto malicioso. Testes de rotas backend continuam responsáveis por sessão, CSRF, Host/Origin, autorização, projeção de privacidade e correção das mutações.
