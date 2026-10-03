# Histórico interno

[English](../../CHANGELOG_INTERNAL.md)

## Unreleased

- Adiciona validação/materialização de versão FND-1, scripts de bootstrap e inicialização Compose, schema/migration Prisma e cobertura de integração com PostgreSQL real.
- Adiciona o grupo do Postgres como grupo suplementar aos serviços migrate/bot sem root para que leiam o segredo compartilhado `0440`.
- Amplia `/health` com `product_version` em execução, resultado real da conexão PostgreSQL e `twitch_api: not_configured` até a implementação da integração Twitch. Falhas do banco retornam 503 sanitizado.
- Durante manutenção do host, o armazenamento Docker foi movido para `/home/gustavo/.docker-data` e o containerd para `/home/gustavo/.containerd-data`; nenhum dado de instalação ou aplicação está incluído nesta alteração do projeto.
