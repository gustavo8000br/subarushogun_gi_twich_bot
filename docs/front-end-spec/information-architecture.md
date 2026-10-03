# Information architecture
[Português brasileiro](../pt-BR/front-end-spec/information-architecture.md)


1. **Setup and reconnection:** exact callback URL, Twitch developer-console guidance, Client ID/Secret replacement, validation state, connect/reconnect action, channel identity and eligibility.
2. **Overview:** local product/API/state versions, database/bot/chat/EventSub state, last reconciliation, reward-count warning, active financial issues.
3. **Queues:** open/closed/archived/deletion-pending state; queue settings; create/edit/open/close/archive/unarchive/delete with explicit confirmation.
4. **Queue detail:** waiting order, called entries, in-progress service, terminal history; manual add, call, start, complete, remove, move, and safe call retry.
5. **Points and recovery:** pending, confirmed, conflict, or unknown operations with retry/reconcile actions that cannot change the recorded intent.
6. **Account:** current/default text labels and reset behavior.
