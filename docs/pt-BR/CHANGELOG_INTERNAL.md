# Histórico interno

[English](../../CHANGELOG_INTERNAL.md)

## Unreleased

- Adiciona serviço comum de transição de domínio que calcula intenção financeira com estado/política PostgreSQL bloqueados e confirma status/ordem/auditoria atomicamente; validado com migrations reais e testes de concorrência. Dispatch de chat/EventSub e entrega da outbox financeira continuam nas stories posteriores designadas.
- Substitui a dependência da revisão paga CodeRabbit, indisponível, por regras locais OpenGrep `1.30.0` fixadas; documenta escopo e limites nos dois READMEs e registros da FND-1. Execução Linux: 18 arquivos JavaScript, 0 achados; execução nativa do `.bat` Windows continua sem verificação.
- Inicia FND-2 após GO do PO (9/10); adiciona, com teste primeiro, uma função de decisão de transição que rejeita pares inválidos do ciclo de vida e distingue observações terminais externas de decisões financeiras locais. É um incremento parcial; não declara serviço de persistência nem comportamento de outbox.
- Adiciona, com teste primeiro, validador UID para exatamente nove dígitos ASCII, UID manual opcional visível, descarte no modo oculto e erros seguros sem eco do texto inválido. A limpeza na persistência/projeções continua pendente.
- Adiciona com TDD validação pura de chaves, parser de comandos pt-BR e autorização. Teste de regressão detectou e removeu entrada de viewer em `!<fila>` sem subcomando; autorização também rejeita uso de saída de autoatendimento para outra identidade.
- Adiciona aceitação real isolada de inicialização/reinício Compose, execução do helper POSIX com caminho que contém espaços e ponto de entrada estático em `apps/web` servido por `@fastify/static`. Gates Linux passam; execução do `.bat` Windows segue sem validação neste host.
- Amplia a sequência FND-5/FND-6 com serviços de aplicação compartilhados e gestão completa do streamer pelo painel local. Substitui os corpos das issues GitHub #1 e #6; nenhum comentário foi publicado. Pesquisa de referências UX e ativação `$aiox-ux-design-expert` ficam adiadas para o planejamento da FND-6.
- Adiciona READMEs centrais de operação vinculados nos dois idiomas e pesquisa oficial datada de Twitch, Twurple, Prisma, PostgreSQL e Docker Compose; registra o ciclo TDD do contrato documental.
- Adiciona validação/materialização de versão FND-1, scripts de bootstrap e inicialização Compose, schema/migration Prisma e cobertura de integração com PostgreSQL real.
- Adiciona o grupo do Postgres como grupo suplementar aos serviços migrate/bot sem root para que leiam o segredo compartilhado `0440`.
- Amplia `/health` com `product_version` em execução, resultado real da conexão PostgreSQL e `twitch_api: not_configured` até a implementação da integração Twitch. Falhas do banco retornam 503 sanitizado.
- Durante manutenção do host, o armazenamento Docker foi movido para `/home/gustavo/.docker-data` e o containerd para `/home/gustavo/.containerd-data`; nenhum dado de instalação ou aplicação está incluído nesta alteração do projeto.
