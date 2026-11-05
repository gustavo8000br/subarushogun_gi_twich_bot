# Pesquisa OPS-15: PostgreSQL descartável em Docker nos testes de integração do Vitest (pull da imagem, limpeza, contenção)

[English](../../../stories/OPS-15/docker-test-cleanup-research.md)

- Data: 2026-10-23. Autoria: @analyst (Atlas). Só pesquisa; nenhum código, teste, container ou comando Docker foi executado (o socket Docker local não estava acessível a este agente: `permission denied while trying to connect to the docker API`).
- Gatilho: `docs/research-index.md` não tinha linha para este tema (LACUNA). As evidências vêm dos gates do @qa [qa-gate-2026-10-22.md](qa-gate-2026-10-22.md) (linhas "npm test (full)" e "Full suite") e [qa-gate-2026-10-23.md](qa-gate-2026-10-23.md) (linhas "npm test (full, parallel, run 1)", "Test infrastructure robustness" e seção "Cleanup").
- Local: o repositório guarda as notas de pesquisa junto da story (`docs/stories/<ID>/*-research.md` + cópia pt-BR), não em `docs/research/`. Esta nota segue esse padrão.
- Rótulos: **VERIFIED** = doc oficial, código upstream, código do pacote instalado ou código deste repositório; **PARTIAL** = a fonte oficial confirma uma parte, o resto é leitura minha ou fonte secundária; **UNVERIFIED** = inferência, precisa ser provada por teste.
- Versões: Vitest 5.0.3 (`package.json`, instalado), cliente Docker CLI 29.9.2 (local; não foi possível ler a versão do daemon), imagem `postgres:18.6-bookworm`.

## 1. O que o código faz hoje (VERIFIED, repositório)

| Item | Onde |
|---|---|
| Toda chamada `docker` usa `spawnSync` com `timeout: 30_000`, inclusive o `docker run` (que pode fazer pull implícito da imagem). | `tests/integration/queue-repository.test.js:26`, `overlay-widget-repository.test.js:22`, `qra-postgres-fixtures.test.js:27` |
| `containerStarted = true` só é definido **depois** que o `docker run` retorna exit 0. | `queue-repository.test.js:658-662`, `overlay-widget-repository.test.js:54-58`, `qra-postgres-fixtures.test.js:59-68` |
| A limpeza só roda `if (containerStarted)`. | `queue-repository.test.js:694`, `overlay-widget-repository.test.js:77`, `qra-postgres-fixtures.test.js:88` |
| `queue-repository` (e `command-policy-persistence.test.js:53`, `tombstone-index-plan.test.js:48`, `command-policy-v3-migration.test.js:52`, `postgres-foundation.test.js:49`) limpam com um único `docker stop` cujo resultado é ignorado. Esses arquivos nunca falham na limpeza, mas também nunca a verificam. | linhas acima |
| `overlay-widget-repository` e `qra-postgres-fixtures` usam o helper compartilhado `cleanupIsolatedPostgres`, que verifica a remoção e lança erro. São exatamente os dois arquivos que falharam na suíte paralela. | `tests/helpers/isolated-postgres-cleanup.mjs` |
| Todos os containers rodam com `--rm` (AutoRemove). Os dois arquivos que falharam também montam um volume **nomeado**. | `overlay-widget-repository.test.js:54-57`, `qra-postgres-fixtures.test.js:60-65` |
| Config do Vitest: `testTimeout` e `hookTimeout` 120 000 ms; sem `pool`, `maxWorkers`, `fileParallelism` nem `globalSetup`, então valem os padrões. | `vitest.config.js:7-8` |
| A tag `postgres:18.6-bookworm` se repete em 7 arquivos de integração. | `grep -rl postgres:18.6-bookworm tests` |

Comportamento do helper, linha a linha (`tests/helpers/isolated-postgres-cleanup.mjs`):

- `:10` roda `docker rm --force <nome>` e **ignora o resultado** (status, stderr, `error`).
- `:11-14` roda `docker inspect <nome>` **uma vez**. Se retornar exit 0 (o container ainda existe), lança erro na hora. Não há espera nem nova tentativa.
- `:2` `isMissing` aceita `no such container|object` (sem diferenciar maiúsculas) como "removido".
- `:13`, `:18`, `:22` montam a mensagem com `stderr ?? stdout ?? '...'`. Com `encoding: 'utf8'`, o `spawnSync` devolve `''` (não `null`) para um stream vazio; então, quando o `inspect` **tem sucesso** (status 0, `stderr === ''`), a mensagem fica só `Isolated PostgreSQL container cleanup failed: `, sem detalhe. Isso bate com o gate de 2026-10-22, que só conseguiu registrar "contention" (VERIFIED por leitura do código; o Node devolve strings quando `encoding` está definido).
- `:16-19` e `:20-23`: remoção e verificação do volume, também numa tentativa só.
- Pior tempo do helper: 4 chamadas × 30 s = 120 s, igual ao `hookTimeout` (`vitest.config.js:8`), antes de contar o `prisma.$disconnect()`.

## 2. Respostas

### Q1. Como garantir a imagem antes dos testes

- **VERIFIED** (docs do Docker, `docker container run`, https://docs.docker.com/reference/cli/docker/container/run/): `--pull` aceita `missing` (padrão, só faz pull se não estiver no cache), `always` e `never` ("nunca faz pull, falha se não estiver no cache").
- **VERIFIED** (código do docker/cli, `cli/command/container/create.go`, https://github.com/docker/cli/blob/master/cli/command/container/create.go): com a política padrão `missing`, o CLI chama primeiro `ContainerCreate`; se a imagem não existe, imprime `Unable to find image '<ref>' locally`, faz o pull com o **contexto do comando** e repete o `ContainerCreate`. Portanto o pull está dentro dos 30 s de `spawnSync` do `docker run`. É exatamente o texto registrado no gate de 2026-10-23.
- **VERIFIED** (docs do Vitest, https://vitest.dev/config/globalsetup): o `globalSetup` "é chamado antes de os workers de teste serem criados e só se houver pelo menos um teste na fila"; o teardown roda "depois que todos os arquivos de teste terminam"; valores chegam aos testes por `provide`/`inject`. A página não fala de timeout.
- **VERIFIED** (código instalado, `node_modules/vitest/dist/chunks/index.DpLw24bj.js`, `_initializeGlobalSetup`): o Vitest 5.0.3 apenas faz `await` do `setup()`; não há timeout em volta. Um pull no `globalSetup` só é limitado pelo timeout que passarmos ao comando Docker.
- **VERIFIED** (https://vitest.dev/config/hooktimeout): o `hookTimeout` padrão é 10 000 ms no Node; `0` desliga. O projeto usa 120 000 ms. Timeouts por hook (`beforeAll(fn, 120_000)`) sobrepõem o valor global.
- **Recomendação (PARTIAL: escolha de design, não testada aqui):** um helper compartilhado `ensurePostgresImage()` que roda `docker image inspect postgres:18.6-bookworm` (rápido, exit 0 se existe) e, só se faltar, `docker pull` com timeout próprio longo (por exemplo 300 s), chamado no início de cada `beforeAll` de PostgreSQL; depois o container sobe com `--pull never`, para o `docker run` nunca fazer pull dentro dos 30 s. O timeout do `beforeAll` precisa cobrir o pull (por exemplo 420 s).
- Por que `globalSetup` não é a primeira opção: ele roda sempre que há algum teste na fila, então `npm run test:unit` numa máquina sem a imagem também baixaria ~630 MB, e uma máquina sem Docker precisaria de proteção. Ele passa a ser a melhor opção se a config for dividida em projetos `unit` e `integration`, com `globalSetup` só no de integração (UNVERIFIED neste repo: não testado). Um passo `docker pull` no CI antes do `npm test` é uma opção complementar, do @devops (`.github/workflows/quality-gates.yml:110` roda `npm test`).
- **UNVERIFIED:** se vários `docker pull` paralelos da mesma imagem são deduplicados pelo daemon. O helper não deve depender disso; com a imagem em cache, ele nunca faz pull.

### Q2. Container Created, `docker rm -f` em container inexistente, `--rm`

- **VERIFIED** (docker/cli `cli/command/container/run.go`, https://github.com/docker/cli/blob/master/cli/command/container/run.go): `docker run` = `createContainer` (que inclui o pull) **e depois** `ContainerStart`. Se o cliente morre entre as duas chamadas, o container fica criado no daemon.
- **VERIFIED** (evidência do repositório, `qa-gate-2026-10-23.md`, "Cleanup"): o órfão `queuebot-repo-43295-34484391` estava no estado `created`, nunca iniciado, com `AutoRemove true`.
- **VERIFIED** (Docker Engine API v1.52, `HostConfig.AutoRemove`, https://docs.docker.com/reference/api/engine/version/v1.52.yaml): "Remove automaticamente o container quando o processo do container termina." Um container que nunca iniciou nunca termina, então **`--rm` não remove um container `Created`**. O `docker ps --filter status=created` documenta `created` como "nunca foi iniciado" (https://docs.docker.com/reference/cli/docker/container/ls/).
- **VERIFIED** (moby `daemon/monitor.go`, https://github.com/moby/moby/blob/master/daemon/monitor.go): o AutoRemove chama `containerRm(... ForceRemove: true, RemoveVolume: true)` no término; erros só vão para o log. `RemoveVolume` remove apenas volumes anônimos; volumes nomeados ficam (`docker container rm`, https://docs.docker.com/reference/cli/docker/container/rm/: "se um volume foi especificado com nome, ele não será removido").
- **VERIFIED** (docs do Node 24, https://nodejs.org/docs/latest-v24.x/api/child_process.html): no `timeout`, o `spawnSync` envia `killSignal` (padrão `SIGTERM`), retorna `status: null`, `signal` preenchido e `error` preenchido ("falhou ou estourou o tempo").
- **PARTIAL:** a fase exata em que o cliente morreu em 2026-10-23 (durante o pull, depois do create, durante o start) não foi registrada. O órfão prova que chegou ao `create`.
- **VERIFIED** (docker/cli `cli/command/container/rm.go`, master, https://github.com/docker/cli/blob/master/cli/command/container/rm.go): `if opts.force && errdefs.IsNotFound(err) { continue }`, então `docker rm -f <inexistente>` não imprime nada para esse nome e sai com **0**. O comportamento vem de uma mudança de 2020 no docker/cli, de Sebastiaan van Stijn (espelho: https://git.coopcloud.tech/p4u1/docker-cli/src/commit/32d8f358df005d478f1a29886b94f3e8ac111fcd/cli/command/container/rm_test.go). **PARTIAL** para a máquina do QA: a versão do daemon não foi lida; o código não deve depender só do exit code (mantenha a checagem com `inspect`).
- **VERIFIED** (Engine API `DELETE /containers/{id}`): 404 "no such container" (exemplo `No such container: c2ada9df5af8`), 409 "conflict", `force`: "Se o container estiver rodando, mata antes de remover."
- **VERIFIED** (docker/cli `cli/command/system/inspect.go`): `docker inspect <inexistente>` retorna `error: no such object: <ref>`. A regex atual (`:2`) reconhece.
- **Resposta:** sim, o container pode existir como `Created` depois que o cliente é morto, e `--rm` não ajuda nesse caso. `docker rm -f <nome>` é idempotente (exit 0 se não existe), então a limpeza deve rodar **sempre**, não atrás de `containerStarted`.
- **VERIFIED** (código instalado, `node_modules/vitest/dist/chunks/run.BTlFXlnv.js`, `runSuite`): o `afterAll` roda dentro de um `finally` com o comentário "afterAll runs even if beforeAll or suite children fail". Então uma limpeza incondicional no `afterAll` roda mesmo após um `beforeAll` com falha.

### Q3. Por que `rm -f` / a limpeza falham sob contenção, e o que o código trata

Causas conhecidas no daemon (VERIFIED em moby `daemon/delete.go`, https://github.com/moby/moby/blob/master/daemon/delete.go, e na Engine API):

1. `removal of container <nome> is already in progress` (`errdefs.Conflict`, 409): uma segunda remoção enquanto outra tem `RemovalInProgress`. Com `--rm`, um AutoRemove disparado por um término (por exemplo um container parado ou que caiu) pode correr em paralelo com o nosso `rm -f` explícito.
2. `could not kill container: ...` e `unable to remove filesystem` (este também registra o erro de remoção no container e o deixa no lugar).
3. A remoção de volume retorna 409 "Volume is in use and cannot be removed" enquanto algum container ainda o referencia (Engine API `VolumeDelete`).
4. Timeout do lado do cliente (nosso `spawnSync` de 30 s): o cliente é morto, mas o daemon continua trabalhando; um `inspect` logo depois ainda pode ver o container. **UNVERIFIED** que foi isso em 2026-10-22 (o stderr não foi registrado), mas é a explicação mais coerente: só os dois arquivos que verificam a remoção falharam, os dois passaram isolados, e a mensagem vazia bate com `inspect` exit 0.

| Caso | Tratado? | Onde |
|---|---|---|
| Container removido após `rm` (`no such container/object`) | Sim | `isolated-postgres-cleanup.mjs:2`, `:11-12` |
| Volume removido (`no such volume`) | Sim | `:16-17`, `:20-21` |
| Volume ainda presente após a remoção | Sim, falha visível (há teste unitário) | `:20-23`; `tests/unit/isolated-postgres-cleanup.test.js:22-31` |
| Resultado do `rm -f` (409 already in progress, falha no kill, timeout `ETIMEDOUT`) | **Não**, resultado ignorado | `:10` |
| Container ainda presente logo após o `rm` (remoção em andamento) | **Não**, lança erro na hora, sem polling | `:11-14` |
| Diagnóstico vazio quando o `inspect` tem sucesso (`'' ?? ...`) | **Não**, mensagem vazia | `:13` (mesmo padrão em `:18`, `:22`) |
| Timeout do `spawnSync` em `inspect`/`volume rm` (`status: null`, `error.code`) | **Não**, tratado como falha genérica, sem detalhe | `:12`, `:17`, `:21` |
| Volume 409 "in use" enquanto a remoção do container termina | **Não** há nova tentativa | `:16-18` |
| Container criado mas `docker run` falhou/estourou o tempo (`containerStarted` false) | **Não**, limpeza pulada | `queue-repository.test.js:694`, `overlay-widget-repository.test.js:77`, `qra-postgres-fixtures.test.js:88` |
| Resultado do `docker stop` em 5 arquivos | Não verificado (não falha, não detecta vazamento) | `queue-repository.test.js:694` e as 4 linhas da seção 1 |

Padrão de tolerância recomendado (PARTIAL: derivado das fontes acima, não de um "guia de retry" oficial; o Docker não publica um): tratar a remoção como uma **checagem de estado que converge** com prazo. Chamar `rm -f` e depois fazer polling do `inspect` até "no such" ou até o prazo (por exemplo 60 s, passos de 500 ms a 1 s). Tratar 409 "already in progress" e `ETIMEDOUT` como transitórios. Repetir a remoção do volume em "in use" dentro do mesmo prazo. Na falha final, lançar erro com status, signal, `error.code` e stderr (só nomes de container/volume; nunca connection string).

### Q4. Testcontainers para Node

- **VERIFIED** (https://node.testcontainers.org/modules/postgresql/): `@testcontainers/postgresql` oferece `new PostgreSqlContainer(image).start()`, `getConnectionUri()`, `snapshot()`/`restoreSnapshot()`. **PARTIAL** (a página de configuração do Node, https://node.testcontainers.org/configuration/, lista `TESTCONTAINERS_RYUK_DISABLED`; o comportamento está descrito nos docs do Go, https://golang.testcontainers.org/features/garbage_collector): o sidecar Ryuk remove containers, redes e volumes rotulados depois que o processo de teste some, o que cobre também execuções que caíram.
- **VERIFIED** (repositório, `docs/stories/OPS-20/test-research.md:15,42`; `package.json`): não é dependência hoje; aquela nota já recomendou manter o padrão do repo.
- **Recomendação:** agora não. É uma dependência nova (story + issue), um segundo container (Ryuk) por execução e a reescrita de 7 arquivos, para resolver o que um helper resolve. Reavaliar só se continuarem aparecendo órfãos depois da correção do helper, ou se entrarem outros tipos de container. Meio-termo barato: adicionar `--label queuebot.test=disposable` ao `docker run`, para o proprietário/@qa listar sobras com `docker ps -a --filter label=queuebot.test` (filtro VERIFIED: https://docs.docker.com/reference/cli/docker/container/ls/).

## 3. Recomendação para o @dev (teste primeiro)

Conjunto de mudanças (uma task de story; sem código de produto):

1. `tests/helpers/isolated-postgres-cleanup.mjs`
   - Tornar `async`, injetar `sleep` e `now` para os testes, aceitar `volumeName` opcional (o queue-repository usa tmpfs).
   - Guardar o resultado do `rm -f`; fazer polling do `inspect` até sumir ou até o prazo; tratar "already in progress" e `ETIMEDOUT` como transitórios; repetir `volume rm` em "in use".
   - Montar as mensagens com `||` e incluir `status`, `signal`, `error?.code`, stderr.
2. Novo helper compartilhado (mesma pasta), por exemplo `tests/helpers/isolated-postgres-image.mjs`: `ensurePostgresImage()` (`image inspect`, senão `pull` com timeout longo) e uma constante exportada para a tag da imagem.
3. Os 7 arquivos de integração com PostgreSQL: chamar `ensurePostgresImage()` primeiro, adicionar `--pull never` (e opcionalmente o label) ao `docker run`, e chamar o helper de limpeza **sem condição** no `afterAll` (remover a guarda `containerStarted` e o `docker stop` solto). Aumentar o timeout do `beforeAll` para cobrir o pull e dar ao `afterAll` um timeout explícito maior que o prazo da limpeza.

Testes que precisam falhar primeiro (`tests/unit/isolated-postgres-cleanup.test.js`, `runDocker` falso, sem Docker):

1. **Primeiro RED:** "espera o container sumir quando o inspect ainda o encontra logo após o rm": `rm` → 0; `inspect` → 0 (ainda presente); `inspect` → 1 `error: no such object: queuebot-test`; depois o volume é removido. Hoje lança erro em `:13`.
2. "repete a remoção do volume enquanto ele está em uso": `volume rm` → 1 `volume is in use`, depois 0; `volume inspect` → `no such volume`. Hoje lança erro em `:18`.
3. "informa status, signal e código de timeout quando o container nunca some": `inspect` sempre 0 até o prazo injetado → a mensagem não é vazia e contém o status. Hoje a mensagem é vazia.
4. "trata um rm com timeout (status null, error.code ETIMEDOUT) como transitório e ainda verifica a remoção".
5. "é um sucesso sem efeito quando o container nunca foi criado" (`rm -f` exit 0, `inspect` no such object) — protege a chamada incondicional.
6. Novo teste unitário para `ensurePostgresImage`: sem `pull` quando `image inspect` retorna 0; `pull` com o timeout longo quando retorna 1; pull com falha lança erro claro.

A prova de integração fica com o @qa: `npm test` completo e paralelo numa máquina **sem** a imagem em cache (`docker image rm postgres:18.6-bookworm` só se nenhum outro projeto a usar), e uma segunda execução completa para checar a limpeza sob contenção. Pesquisa documental não fecha isso.

## 4. Limitações

- Nenhum comando Docker foi executado; o daemon não estava acessível a este agente. A versão do daemon na máquina do QA é desconhecida.
- O stderr das falhas de limpeza de 2026-10-22 não foi registrado (o helper o esconde), então a causa raiz do item 2 do problema continua **UNVERIFIED** até a mensagem melhorada capturá-la.
- O código do docker/cli e do moby foi lido no `master`, não na tag exata da versão instalada.
- Não achei orientação oficial do Docker sobre retry/backoff na remoção; o padrão da Q3 é derivado.
- Não foi preciso usar fontes da comunidade; nenhuma conclusão depende delas.

## Fontes

- Docker CLI `container run`: https://docs.docker.com/reference/cli/docker/container/run/
- Docker CLI `container rm`: https://docs.docker.com/reference/cli/docker/container/rm/
- Docker CLI `container ls`: https://docs.docker.com/reference/cli/docker/container/ls/
- Docker Engine API v1.52 (OpenAPI): https://docs.docker.com/reference/api/engine/version/v1.52.yaml
- docker/cli `create.go`, `run.go`, `rm.go`, `system/inspect.go`: https://github.com/docker/cli/tree/master/cli/command
- Mudança de 2020 do `rm -f` no docker/cli (espelho): https://git.coopcloud.tech/p4u1/docker-cli/src/commit/32d8f358df005d478f1a29886b94f3e8ac111fcd/cli/command/container/rm_test.go
- moby `daemon/delete.go`, `daemon/monitor.go`: https://github.com/moby/moby/tree/master/daemon
- Node.js 24 `child_process.spawnSync`: https://nodejs.org/docs/latest-v24.x/api/child_process.html
- Vitest `globalSetup`, `hookTimeout`, `teardownTimeout`, `fileParallelism`, `pool`, `maxWorkers`: https://vitest.dev/config/globalsetup, https://vitest.dev/config/hooktimeout, https://vitest.dev/config/teardowntimeout, https://vitest.dev/config/fileparallelism, https://vitest.dev/config/pool, https://vitest.dev/config/maxworkers
- Testcontainers para Node: https://node.testcontainers.org/modules/postgresql/, https://node.testcontainers.org/configuration/; garbage collector do Go: https://golang.testcontainers.org/features/garbage_collector
