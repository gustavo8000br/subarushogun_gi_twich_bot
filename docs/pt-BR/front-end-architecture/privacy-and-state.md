# Privacidade e estado
[English](../../front-end-architecture/privacy-and-state.md)


O navegador recebe somente projeções permitidas da API para a operadora autenticada. UID continua sujeito à política atual de visibilidade da fila; projeções do overlay mantêm as regras de visibilidade mais restritas por widget. O overlay OBS servido localmente usa sua capability escopada existente e o contrato de API bearer sem sessão do painel. Segredos nunca são retornados após envio de credenciais. A UI atualiza após mudanças de configuração e não armazena texto de notificação renderizado. Armazenamento do painel e do overlay permanece separado; não persista credenciais nem amplie os dados de identidade.

O painel Next inicializa a sessão local existente antes das leituras protegidas. As linhas das filas vêm somente de `GET /api/queues`; a projeção mais ampla de `/api/state` não substitui a projeção da operadora. A tela renderiza nomes e estados como texto escapado e não mostra campos UID. Tokens CSRF ficam apenas na memória do cliente e são enviados nas mutações junto com chaves de idempotência; configurações com revisão enviam a revisão esperada fornecida pelo servidor. Nenhum corpo bruto de erro da API é renderizado.
