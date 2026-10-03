# Fronteira Twitch
[English](../../fullstack-architecture/twitch-boundary.md)


Usar o client confidencial e token de usuário da streamer. Client Credentials valida o par de app; Authorization Code usa `state` de uso único associado à sessão. Renovação Twurple é persistida atomicamente. EventSub WebSocket recebe eventos de chat e resgates; Helix gerencia recompensas/status de resgates e envia mensagens. Métodos/campos do SDK fixado são verificados durante implementação. Reconciliação lê páginas remotas, deduplica por ID e nunca infere estado terminal pela ausência em páginas.
