# Restrições da arquitetura
[English](../../fullstack-architecture/architecture-constraints.md)


Uma instalação local, uma broadcaster/app Twitch, um processo de bot, PostgreSQL local via Compose, sem backend público/armazenamento remoto/telemetria. O código de runtime do produto é JavaScript ESM; o código-fonte da aplicação de navegador permanece JavaScript ESM com JSDoc. A OPS-15 adota Next.js App Router, servido pelo servidor de produção do Next.js via HTTPS local, com o Fastify como processo de API separado em loopback no mesmo contêiner (o plano anterior de export estático é histórico). Não introduz código de aplicação TypeScript, hospedagem pública nem nova porta pública. `.env.example` continua sendo scaffolding do framework AIOX. Código em `apps/*`.
