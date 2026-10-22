# Arquivos e módulos
[English](../../front-end-architecture/files-and-modules.md)


O código Next.js fica em `apps/frontend/`; o frontend vanilla permanece em `apps/web/` somente até o cutover autorizado pelo proprietário e sua remoção completa. O novo código da aplicação continua em JavaScript ESM com JSDoc:

```text
apps/frontend/
  app/                 composição App Router; layouts raiz separados para painel e overlay
  features/            setup, visão geral, filas, operações, configurações, widgets, overlay
  components/ui/       componentes visuais compartilhados e acessíveis
  lib/api/             cliente same-origin e contratos JSDoc
  lib/i18n/            carga de catálogos runtime, seleção de locale e formatação
  styles/              tokens, estilos globais e por feature
  scripts/             configuração runtime do Next, servidor HTTPS de produção, launcher de desenvolvimento
  features/panel-shell/ inicialização da sessão local, navegação e composição do shell
  features/overview/    resumos read-only e apresentação de projeções
apps/web/               frontend vanilla; removido após o cutover autorizado
```

O shell do painel inicializa `/api/session` antes das leituras protegidas, carrega as projeções allowlisted de `/api/state` e do operador `/api/queues`, e consulta `/api/localization/catalogs` em runtime. Somente o catálogo first-party pt-BR é embutido como fallback de renderização estática; a API runtime fornece o conjunto completo de idiomas instalados e é a autoridade para a seleção persistida. Projeção de fila inválida mostra erro de API em vez de resumo vazio. Mutações preservam CSRF, idempotência e revisão esperada.

O estágio Docker do frontend executa `npm run build:frontend` e a imagem de runtime contém `apps/frontend/.next`, servido pelo servidor de produção do Next.js; não há export `out/`. Os módulos compartilhados com o painel vanilla ficam em `apps/shared/panel/` e chegam ao build pela única linha `COPY apps/shared`; somente os catálogos ainda são copiados de `apps/web/localization/catalogs` (revisão estrutural S-03). A rota dedicada do overlay monta o renderer somente leitura existente em sua própria entrada client, preservando o comportamento atual de URL, capability, polling e revogação. Em produção, `/` ainda é encaminhado ao shell vanilla servido pelo Fastify até o cutover. Mantenha rotas/layouts finos e decisões de domínio nos serviços atuais do backend. Renderize conteúdo com segurança textual; nunca coloque nomes/mensagens não confiáveis em HTML bruto. Preserve polling limitado e não adicione WebSocket ao painel. Painel e overlay devem gerar bundles de entrada separados.
