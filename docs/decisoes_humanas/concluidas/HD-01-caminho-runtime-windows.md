# HD-01 — Caminho de runtime Windows para validar API/banco local

**Status:** Decisão registrada: a opção A já está autorizada; restaurar o runtime é um acompanhamento operacional.
**English:** [HD-01 — Windows runtime path for local API/database verification](../../human_decisions/done/HD-01-windows-runtime-path.md)

### HD-01 — Caminho de runtime Windows para validar API/banco local

**Status:** O Docker Desktop já foi autorizado anteriormente para reinstalação completa. Seu engine Linux está indisponível no momento. Esta pergunta coleta preferência somente se você quiser mudar esse caminho; não é necessária nova autorização para seguir pela rota Docker já aprovada.

| Opção | Escolha | Efeito |
| --- | --- | --- |
| **A — Reparar/reinstalar Docker Desktop (recomendada)** | Usar Docker Desktop com backend de containers Linux para PostgreSQL isolado e os gates posteriores de Compose/instalador. | Corresponde às necessidades de aceite do Compose e do instalador real da OPS-15. Um engine Docker funcional ainda será necessário para esses gates. O guia atual do Docker recomenda WSL 2 como backend padrão para a maioria dos usuários e lista WSL 2.1.5+ como mínimo. |
| B — PostgreSQL nativo apenas para o smoke local | Instalar PostgreSQL no Windows e apontar somente a API de desenvolvimento para um banco descartável recém-criado. | Pode desbloquear o smoke local de sessão/estado/idioma. **Não** valida Docker Compose, instalador empacotado nem o fluxo obrigatório de instalação/atualização/remoção baseado em Docker. |
| C — Adiar a validação runtime | Continuar trabalho de código e testes de contrato e manter critérios runtime como Pendente. | Nenhuma instalação de sistema é necessária agora; a evidência de runtime/persistência permanece bloqueada. |

**Recomendação:** Manter A como caminho do projeto, coerente com a autorização anterior para reinstalar Docker e com a meta de testar o instalador Windows. Usar B somente se você quiser o smoke da API local antes, enquanto o reparo do Docker fica adiado. O Docker documenta seus backends e requisitos WSL [aqui](https://docs.docker.com/desktop/setup/install/windows-install/) e [aqui](https://docs.docker.com/desktop/features/wsl/). O PostgreSQL oferece um caminho de instalador binário para Windows [aqui](https://www.postgresql.org/download/windows/); essa alternativa não comprova o aceite do Compose.

**Seleção atual:** A já está autorizada; o engine ainda não foi restaurado. Não precisa responder, a menos que prefira B ou C.


