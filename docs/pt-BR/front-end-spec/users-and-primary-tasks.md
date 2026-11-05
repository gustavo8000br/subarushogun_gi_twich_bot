# Usuários e tarefas principais
[English](../../front-end-spec/users-and-primary-tasks.md)


A streamer/operadora usa o navegador no mesmo computador para configurar a Twitch, inspecionar a saúde da integração, criar e operar filas, gerenciar comandos de chat e widgets do OBS, resolver operações de pontos incertas e consultar o histórico. O painel é uma área autenticada da operadora; não é um portal público para viewers. O overlay do OBS é servido pela mesma aplicação Next.js em rota e bundle separados (`/overlay`), autenticado por um link de capacidade por widget, e nunca expõe dados ou controles do painel.
