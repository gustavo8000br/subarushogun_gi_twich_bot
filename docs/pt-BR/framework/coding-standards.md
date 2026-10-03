# Padrões de Código

[English](../../framework/coding-standards.md)

- Usar JavaScript ESM com JSDoc e identificadores em inglês para código, tabelas, colunas, eventos de auditoria e logs técnicos.
- Manter textos do produto e respostas do chat em português brasileiro.
- Manter módulos em `apps/web`, `apps/api`, `apps/infra`; arquivos da raiz limitam-se a Compose/Docker/entradas npm e documentação/configuração do projeto.
- Manter transições de domínio em serviços de domínio. Handlers HTTP/chat, timers, EventSub e workers não gravam status diretamente.
- Validar entradas externas/do usuário na fronteira. Tratar chat/resgate como não confiável; persistir somente campos permitidos. Renderizar valores com `textContent`.
- Nunca registrar tokens, segredos, códigos de autorização, senhas/URLs do banco, mensagens brutas ou payload rejeitado.
- Manter transações PostgreSQL curtas e fora de chamadas Twitch. Usar restrições do banco para unicidade/concorrência; lock em memória não basta.
- Toda mudança comportamental segue teste-first Red → Green → Refactor; registrar comandos/resultados reais nos dois arquivos stories. Garantias de integração usam PostgreSQL isolado real e migrations reais.
- Manter docs em inglês com arquivos de significado equivalente em `docs/pt-BR/`, links recíprocos e identificadores/paths/comandos preservados.
- Não adicionar funcionalidades de produto não solicitadas nem alterar versão/estágio em edições rotineiras.
