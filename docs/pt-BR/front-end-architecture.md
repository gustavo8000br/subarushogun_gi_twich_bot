# Arquitetura do Frontend: `apps/web`

[English](../front-end-architecture.md) · Comportamento do produto: [especificação do frontend](front-end-spec.md).

## Runtime e limites

O frontend do navegador usa Next.js App Router com `output: 'export'`. A saída de produção contém somente assets estáticos e é servida pelo processo HTTPS local Fastify existente via `@fastify/static`, na mesma origem da API atual. Não há servidor Next.js em runtime, hospedagem pública, porta adicional nem proxy de API cross-origin. O callback OAuth continua como rota Fastify explícita. A entrada OBS exata continua `/overlay.html?ref=...#token`, sem redirects nem rewrites; painel e overlay têm layouts e bundles separados.

O código-fonte do navegador permanece em JavaScript ESM com JSDoc. O pipeline Next.js é a exceção documentada que faz bundle/transpilation do frontend para assets estáticos; não autoriza código de aplicação TypeScript. O navegador nunca importa Prisma nem se comunica diretamente com a Twitch.

## Arquivos e módulos

```text
apps/web/
  app/                 composição de rotas e layouts
  features/            setup, filas, operações, configurações, widgets, overlay
  components/ui/       componentes compartilhados de apresentação acessível
  lib/api/             cliente API same-origin e contratos de requests
  lib/i18n/            catálogos runtime, locale e helpers de formatação
  styles/              tokens de design e estilos globais compartilhados
  out/                 export estático gerado; não é fonte de verdade
```

Manter composição de rotas/layouts fina. Módulos de feature consomem projeções explícitas da API e nunca implementam transições de domínio. Painel e `/overlay.html` usam entradas separadas para o OBS não baixar o bundle do painel. Conteúdo não confiável permanece como texto e nunca é renderizado como HTML. Consultar estado local na cadência limitada existente; não adicionar WebSocket ao painel. Mutações mantêm CSRF de sessão, chave de idempotência e revisão esperada aplicável.

## Modelo de telas

Configuração/reconexão → visão geral → lista/detalhe de filas → recuperação Twitch/pontos → conta e configurações do produto → gerenciamento de widgets. O overlay OBS é uma entrada de apresentação separada e baseada em capability. Cada superfície existente preserva os estados aplicáveis carregando, vazio, desconectado, desatualizado, parcial, erro, sucesso, pendente, desconhecido e conflito. Controles refletem ciclo de vida atual; a validação do servidor continua autoritativa. Ações destrutivas mantêm as etapas existentes de revisão e confirmação.

## Privacidade e estado

O painel recebe somente projeções de API para a operadora local autenticada. UID é retornado somente conforme política atual de privacidade da fila; projeções do overlay aplicam a política mais restritiva atual de saída. Segredos nunca são retornados após envio de credenciais. O overlay usa sua capability bearer existente sem sessão do painel e não pode expor o segredo do fragmento após inicialização. Mudanças de configuração atualizam projeções sem armazenar texto de notificação renderizado.

## Verificação

Testes de componente e navegador cobrem a matriz de paridade por superfície, ação, endpoint, locale, estado e referência de teste. Contratos de build/Compose verificam export estático, precedência exata das rotas Fastify, chamadas API same-origin e separação dos bundles painel/overlay. Descoberta runtime de catálogos continua via `/api/localization/catalogs`; testes adicionam um catálogo elegível após o build frontend e verificam disponibilidade sem rebuild ou restart da API. Verificações browser do overlay e OBS/CEF nativo cobrem URLs/capabilities existentes e o orçamento documentado da FND-7. Testes de rota backend continuam responsáveis por sessão, CSRF, Host/Origin, autorização, projeções de privacidade e correção das mutações.
