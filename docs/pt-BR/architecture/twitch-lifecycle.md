# Ciclo Twitch
[English](../../architecture/twitch-lifecycle.md)


Rotas OAuth validam credenciais do app antes de substituir valores armazenados; leitura de Secret retorna somente presença. Callback OAuth valida Host, sessão, state e expiração de uso único. Provider de refresh persiste cada token atomicamente. Runtime valida token ao iniciar e por hora. EventSub WebSocket registra handlers de resgate add/update e mensagem de chat. Adaptadores normalizam enums/formas dos campos do SDK na fronteira. Reconciliação inicia observação de eventos, verifica configurações de recompensas do app, importa resgates não atendidos paginados, consulta individualmente IDs locais sem resolução, aplica status terminal externo confirmado via serviço de domínio e então retoma workers/timers aplicáveis.
