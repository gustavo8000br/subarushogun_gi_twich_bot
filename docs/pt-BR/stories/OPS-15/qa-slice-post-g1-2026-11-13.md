# QA do fatiamento pós-G1 (2026-11-13) - `@qa` (Quinn)

**Veredito: CONCERNS. Nota 9,1/10** (mínimo 9,0 atendido). Escopo: árvore não comitada sobre os 7 commits do G1 (G1-3, G1-4, Dependabot, runbook 0.1 / D-5). O QA não alterou código; os arquivos temporários ficaram em `.local/qa-audit/post-g1/` e foram apagados.

## Bateria (uma execução completa, máquina ociosa, Node 24.20.0)

| Gate | Resultado |
|---|---|
| `npm run lint` | saída 0 |
| `npm run typecheck` | saída 0 |
| `npm test` (PostgreSQL descartável via Docker) | **198 arquivos, 2171 passaram, 12 ignorados, 0 falhas**, 128 s. Os 12 ignorados são os mesmos testes com container PowerShell do G1 (sem imagem PowerShell aqui); +5 testes vs G1 (4 do compose + 1 do painel) |
| `validate:localization` / `validate:version` / `validate:port-denylist` | saída 0 / 0 / 0 |
| `npm run review:static` (OpenGrep) | saída 0, 0 achados, 153 arquivos |
| `actionlint` simples | só a mensagem conhecida `queue: max` (`main-cd.yml:27`, `release.yml:15`); com o `-ignore` do CI fica limpo (saída 0). Workflows intocados |
| `zizmor --pedantic .github/workflows` | 15 achados, 0 médios, 0 altos (igual ao G1, saída 12 = baixo) |
| `git diff --check` em todos os arquivos alterados | limpo |
| Segredos / URL de sessão / nomes de clientes nas linhas adicionadas | nenhum (só `apiClient` casou "client") |

## Teste real de reinício (Docker 29, projeto Compose próprio `qapostg1restart`, porta 3991, imagem `main`)

- `docker inspect`: `db` e `bot` = `unless-stopped`; `bootstrap` e `migrate` = `no`.
- **Achado sobre o método:** `docker kill` (qualquer sinal, inclusive SIGKILL) e `docker stop` passam pela API do Docker e marcam o container como parado manualmente, então **não** reiniciam. É o comportamento desejado ("docker stop manual é respeitado"), mas significa que `docker kill` não simula uma queda. Verificado: após `docker kill -s QUIT` e após `docker kill`, ambos ficaram `exited`.
- **Queda real** (sinal enviado de dentro do container, então o Docker vê o processo morrer): `db` com `kill -QUIT 1` e `bot` com `kill -9` no processo node. Os dois voltaram, `RestartCount=1`, e chegaram a `healthy` em menos de 10 s.
- `docker stop` (e `compose stop`) manual: permaneceram parados por 12-15 s, não ressuscitaram.
- `compose down --volumes --remove-orphans`: 7 recursos removidos; depois não restou container, volume nem rede do projeto, então a política não os traz de volta.
- Limpeza: projeto, volumes e rede removidos; pastas temporárias de certificado/catálogo apagadas. A instalação antiga (`subarushogun-gi-twitch-queue-bot-*`: 4 containers Exited há 5 semanas, 2 volumes) não foi tocada.
- Não testado: reboot / reinício do daemon Docker (exige sudo); aplicar a política numa instalação existente (exige `up -d` para recriar; os containers antigos não têm a política).

## Mutações (em cópia; original intocado)

Todas mortas: `restart` do db removido (teste da política vermelho), `restart` do bot trocado por `always` (vermelho), entrada `docker-compose` do Dependabot removida (teste de contrato vermelho, mais um teste alheio que depende de docs e só falha na cópia sem docs), guarda do panel-shell trocada por `true` (teste G1-3 vermelho: `expected <h2 id="migration-title"> to be null`).

## Runbook 0.1 (D-5), en e pt-BR

Fiel e sem comando inventado: os caminhos da CA batem com `docs/INSTALLATION.md:55,74` e `installer.sh:376`; os links relativos resolvem; a afirmação do `Import-Certificate` no Windows bate com o guia; sintoma e versões (OBS 32.2.2, `obs-browser` 2.26.9, CEF 127.0.6533.120, TLS 1.3, `secure`) batem com `docs/integrations.md:80`. en e pt-BR têm os mesmos 7 itens.

## Achados

1. **CONCERN, runbook 0.1 passo 3 (os dois idiomas, linha 19):** diz que a confiança de 2026-10-06 veio de importar no "banco NSS do usuário que roda o OBS". A evidência (`docs/integrations.md:80`) diz **"um perfil NSS temporário do CEF"**, removido depois. Não é a mesma coisa. Além disso, `~/.pki/nssdb` existe nesta máquina (mtime 2026-10-06) mas não tem certificados (checado em leitura), e o `certutil` não está instalado. Texto proposto: "Em 2026-10-06 a CA foi importada num **perfil NSS temporário do CEF** (não no repositório comum do usuário) e removida depois; qual repositório o OBS lê por padrão, e o comando de importação, não foram registrados."
2. **LACUNA (não é defeito): confiança TLS no OBS não validada agora.** O passo 3 não traz comando (de propósito), falta `certutil` e improvisar um é proibido. Registrada como não validada; o passo 7 do runbook já diz isso.
3. **Menor, zizmor em `.github/dependabot.yml`:** 4 achados médios `dependabot-cooldown` (2 já existiam, 2 vêm das entradas novas). O CI não roda zizmor nesse arquivo; `cooldown` opcional depois.
4. **Detalhe:** o pedido cita `compose.yaml:15,47`; as linhas são 16 e 48.
5. **Sugestão de doc:** registrar no changelog / handoff que instalações existentes só recebem a política depois que `docker compose up -d` recriar `db` e `bot`.

## Grupos prontos para o `@devops`

1. G1-4: `compose.yaml` + `tests/unit/compose-restart-policy.test.js` (pronto).
2. Dependabot: `.github/dependabot.yml` + `tests/unit/ci-workflow-contract.test.js` (pronto).
3. G1-3: `panel-shell.jsx` + `tests/unit/next-overview-panel.test.jsx` (pronto).
4. Runbook 0.1 (en + pt-BR) + incrementos de File List da story OPS-15: pronto **depois** da correção de uma frase do achado 1 (só texto, `@dev`/`@po`).
