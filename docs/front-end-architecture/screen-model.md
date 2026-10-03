# Screen model
[Português brasileiro](../pt-BR/front-end-architecture/screen-model.md)


Setup/reconnect → overview → queue list/detail → financial recovery → account settings. Each screen has loading, empty, disconnected, stale, partial, error and success/pending states. Queue controls reflect lifecycle but server validation remains authoritative. Destructive delete and clear actions show a review summary before the final request.
