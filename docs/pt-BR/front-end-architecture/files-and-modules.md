# Arquivos e módulos
[English](../../front-end-architecture/files-and-modules.md)


A migração mantém o frontend existente em `apps/web/` enquanto o novo código Next.js é construído em `apps/frontend/`. Isso permite verificar export e contratos de runtime antes do cutover. O novo código da aplicação continua em JavaScript ESM com JSDoc:

```text
apps/frontend/
  app/                 composição App Router; layouts raiz separados para painel e overlay
  features/            setup, visão geral, filas, operações, configurações, widgets, overlay
  components/ui/       componentes visuais compartilhados e acessíveis
  lib/api/             cliente same-origin e contratos JSDoc
  lib/i18n/            carga de catálogos runtime, seleção de locale e formatação
  styles/              tokens, estilos globais e por feature
  scripts/             artefatos de compatibilidade da exportação estática
  features/panel-shell/ inicialização da sessão local, navegação e composição do shell
  features/overview/    resumos read-only e apresentação de projeções
apps/web/               frontend vanilla existente, mantido até os gates de paridade
```

O shell do painel inicializa `/api/session` antes das leituras protegidas, carrega as projeções allowlisted de `/api/state` e do operador `/api/queues`, e consulta `/api/localization/catalogs` em runtime. Somente o catálogo first-party pt-BR é embutido como fallback de renderização estática; a API runtime fornece o conjunto completo de idiomas instalados e é a autoridade para a seleção persistida. Projeção de fila inválida mostra erro de API em vez de resumo vazio. Mutações preservam CSRF, idempotência e revisão esperada.

Esta fundação gera `apps/frontend/out/*`, incluindo uma cópia alias `overlay.html`, e a imagem de produção contém essa saída. A rota dedicada do overlay agora monta o renderer somente leitura existente em sua própria entrada client para preservar o comportamento atual de URL, capability, polling e revogação. Durante esta fase de migração, Fastify ainda serve `apps/web/`; a troca da raiz acontece em um gate de cutover posterior. Mantenha rotas/layouts finos e decisões de domínio nos serviços atuais do backend. Renderize conteúdo com segurança textual; nunca coloque nomes/mensagens não confiáveis em HTML bruto. Preserve polling limitado e não adicione WebSocket ao painel. Painel e overlay devem gerar bundles de entrada separados.
