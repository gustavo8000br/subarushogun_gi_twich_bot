# Restrições da arquitetura
[English](../../fullstack-architecture/architecture-constraints.md)


Uma instalação local, uma broadcaster/app Twitch, um processo de bot, PostgreSQL local via Compose, sem backend público/armazenamento remoto/telemetria. O código de runtime do produto é JavaScript ESM; o código-fonte da aplicação de navegador permanece JavaScript ESM com JSDoc. A OPS-15 permite Next.js App Router e sua transpilation/bundling em build apenas para produzir export estático servido pelo processo Fastify existente. Não introduz código de aplicação TypeScript, servidor Next de produção, hospedagem pública ou nova porta pública. `.env.example` continua sendo scaffolding do framework AIOX. Código em `apps/*`.
