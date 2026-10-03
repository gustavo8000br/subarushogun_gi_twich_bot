# Requisitos funcionais
[English](../../prd/functional-requirements.md)


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
