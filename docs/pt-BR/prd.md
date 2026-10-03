# Documento de Requisitos do Produto: Bot local de filas da Twitch

[English](../prd.md) · Fonte: [resumo do projeto](project-brief.md) e [especificação FND-0](../stories/FND-0/spec/spec.md).

## Resultado do produto

A operadora consegue configurar e executar várias filas de pontos do canal da Twitch para uma broadcaster, preservar localmente a ordem das entradas e o histórico de atendimento, e recuperar operações de pontos com segurança após interrupções.

## Usuários e papéis

- **Streamer/operadora:** dona do aplicativo e canal Twitch; configura filas e contas e gerencia o atendimento.
- **Moderador autorizado:** gerencia filas com badges confiáveis da mensagem atual; gestão por VIP é configuração separada, opcional e desligada por padrão.
- **Viewer:** entra somente resgatando a recompensa de uma fila; pode consultar sua própria posição/estado e sair da própria entrada ativa pelo chat.

## Requisitos funcionais

| ID | Requisito | Prioridade |
| --- | --- | --- |
| FR-1 | Instalar uma instância local por Compose, com PostgreSQL persistente, geração única de segredo, saúde/migrations ordenadas e acesso loopback. | P0 |
| FR-2 | Configurar credenciais Twitch localmente, validar Client Credentials, executar OAuth de uso único vinculado à sessão, verificar identidade/escopos/elegibilidade e persistir renovação de token com segurança. | P0 |
| FR-3 | Gerenciar somente recompensas próprias do app; separar estado remoto desejado do confirmado e tornar criação/exclusão recuperáveis. | P0 |
| FR-4 | Suportar várias filas, chaves normalizadas globalmente únicas, políticas configuráveis e identidade histórica imutável. | P0 |
| FR-5 | Aceitar entradas somente de resgates próprios ou inclusão manual autorizada; usar ID Twitch como identidade, limitar uma entrada ativa por fila e validar formato exato de UID visível. | P0 |
| FR-6 | Encaminhar transições por um único serviço de domínio e persistir atomicamente estado, ordem/conta, auditoria, política fotografada e intenção na outbox. | P0 |
| FR-7 | Processar operações de pontos por outbox PostgreSQL durável, com idempotência, leases, retries, resolução remota e conflitos/estado desconhecido visíveis. | P0 |
| FR-8 | Receber eventos de resgate/chat via EventSub WebSocket, enviar via Helix, deduplicar e reconciliar após inicialização/reconexão/intervalo/solicitação do operador. | P0 |
| FR-9 | Interpretar comandos em português separados de execução/autorização e validar canal, papel, identidade, sintaxe, cooldown e limites de resposta. | P0 |
| FR-10 | Fornecer operações de lista/posição/saída/inclusão/remoção/próximo/início/conclusão/movimentação/abertura/fechamento/arquivo/limpeza/conta, notificações e timeout conforme política. | P0 |
| FR-11 | Fornecer UI local vanilla e API Fastify protegida para instalação, saúde, filas, entradas, operações financeiras, reconciliação, conta e projeção explícita do estado. | P1 |
| FR-12 | Persistir rótulos de conta atual/padrão e propriedade da troca; somente chamada automática individual pode definir essa propriedade. | P1 |
| FR-13 | Expor versão completa de runtime separada da versão do contrato API/revisão do estado; materializar SHA de sete caracteres da origem somente em artefatos. | P1 |
| FR-14 | Manter documentação principal em inglês e versões equivalentes pt-BR para instalação, stories/evidências, integração, versionamento e changelogs. | P1 |

## Aceitação e gates de release

Os critérios AC-1 a AC-20 estão definidos em `stories/FND-0/spec/requirements.json` e são os comportamentos testáveis autoritativos. Todo comportamento começa com testes. As evidências exigidas incluem unitários, contratos reais de PostgreSQL isolado/migrations, contratos/aceitação de Compose, testes de privacidade e segurança, checagem de materialização de versão e paridade documental bilíngue. Os gates do projeto também incluem `npm run lint`, `npm run typecheck`, `npm test`, build e verificações de banco, Compose e versão, quando implementados.

## Fora de escopo

Inscrição pública, comando de entrada para viewer, credenciais do jogo, verificação de UID, Discord/mensagens privadas, overlay, ranking, múltiplos canais/apps/contas de bot, backend/banco hospedado, telemetria, exportação/backup como funcionalidade, escala horizontal, IRC, framework frontend, TypeScript, transpiler ou bundler.

## Sequência

FND-1 runtime/persistência → FND-2 domínio/parser/ordem → FND-3 outbox financeira → FND-4 autenticação/adaptadores/reconciliação Twitch → FND-5 chat/chamadas/contas → FND-6 painel local/segurança/aceitação do sistema. Cada story passa pela validação AIOX e pelo contrato TDD antes da implementação.

## Rastreabilidade

Requisitos e critérios de aceitação correspondem a FR-*, NFR-* e CON-* em [requirements.json](../stories/FND-0/spec/requirements.json). Escolhas de tecnologia e APIs externas são limitadas às descobertas datadas em [research.json](../stories/FND-0/spec/research.json). Este documento não introduz capacidades novas ao produto.
