# Superfície HTTP
[English](../../architecture/http-surface.md)


Operações mutáveis usam POST/PATCH/DELETE, validação de schema, sessão local, CSRF, chave de idempotência e revisão de estado quando aplicável. GET `/api/state` exige sessão e retorna projeção explícita com `product_version`, `api_contract_version`, revisão e timestamp, conta, conectividade, filas e entradas filtradas por privacidade. Callback OAuth é exceção GET validada específica. Assets estáticos nunca recebem Prisma client ou segredos.
