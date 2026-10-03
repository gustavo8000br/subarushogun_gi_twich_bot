# Privacidade e estado
[English](../../front-end-architecture/privacy-and-state.md)


Navegador recebe somente projeções da API autenticada da operadora. UID só é retornado enquanto modo da fila estiver visível; a projeção do estado público tem toggle mais restritivo de overlay, embora overlay não faça parte desta entrega. Segredos nunca são retornados após envio de credenciais. A UI atualiza após mudar configurações e não armazena texto de notificação renderizado.
