# Estratégia de Testes

[English](../../framework/testing-strategy.md)

- Vitest executa testes unitários ESM e contratos HTTP/UI sem credenciais Twitch.
- Escrever e executar teste do comportamento antes de implementá-lo; observar Red comportamental, implementar o mínimo para Green e então refatorar/reexecutar a suite afetada.
- Usar adaptadores falsos e relógio controlável para fronteiras externas Twitch/tempo.
- Usar banco de teste PostgreSQL real separado com migrations Prisma reais para restrições, transações, concorrência, leases e crash recovery. Nunca usar SQLite ou mocks Prisma como prova de garantia de persistência.
- Testes de integração Compose validam bootstrap, persistência/permissão de segredo, ordem de dependências, saúde, bot sem root, persistência ao reiniciar e ciclo de volumes seguro.
- Scripts de versão têm testes de formato exato, consistência das fontes, marcador sem Git, SHA de sete caracteres, falha de descoberta, materialização somente do artefato e ausência de alteração comum no checkout.
- Não declarar teste validado sem executar e obter sucesso. Registrar comandos exatos e resultados Red/Green/Refactor observados nas stories inglesa e pt-BR.
