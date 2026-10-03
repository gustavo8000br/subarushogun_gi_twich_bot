# API e segurança local
[English](../../fullstack-architecture/api-and-local-security.md)


Rotas do painel exigem sessão local. Validar Host e Origin exatos, bloquear DNS rebinding antes de rotas admin, usar cookies HttpOnly/SameSite e CSRF por sessão, validar schemas/chave de idempotência/revisão nas mutações. Callback OAuth é exceção GET limitada para Origin; Host/sessão/state continuam obrigatórios. Retornar projeções, não entidades Prisma. Sanitizar erros/logs Fastify/SDK/Prisma; nunca retornar ou registrar segredos, tokens, códigos OAuth, senha de banco, connection string ou payload bruto de chat/resgate.
