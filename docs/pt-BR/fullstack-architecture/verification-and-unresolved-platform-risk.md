# Verificação e risco de plataforma
[English](../../fullstack-architecture/verification-and-unresolved-platform-risk.md)


Testes unitários usam portas Twitch falsas e relógio controlável. Garantias de restrição, transações, migrations, leases e recuperação usam PostgreSQL isolado. Aceitação Compose verifica bootstrap, ordem, saúde, persistência após reinício e runtime sem root. Permissões de secrets baseados em arquivo exigem verificação empírica em cada plataforma declarada; nenhuma paridade entre hosts é alegada antes desses testes.
