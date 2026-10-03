# Financial outbox contract
[Português brasileiro](../pt-BR/architecture/financial-outbox-contract.md)


One stable financial intent per redemption ID and operation key. Domain transaction persists terminal state, audit, policy snapshot, ordering/account effects and outbox row. A worker leases rows, calls Twitch outside the transaction, and persists expected-status confirmation, retry schedule, conflict, or unknown result. Lost responses trigger remote lookup. A missing redemption or 404 does not prove cancellation. Credentials/scopes invalidated by 401 halt automated attempts pending valid reconnection. Retry uses bounded exponential backoff/jitter and rate-limit headers.
