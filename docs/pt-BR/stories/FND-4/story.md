# Story FND-4: OAuth Twitch, adapters e reconciliação

[English](../../../stories/FND-4/story.md)

**Complexidade:** COMPLEX
**Executor:** @dev
**Quality gate:** @qa
**Épico/capacidade:** Integração Twitch, FND-4
**Fonte:** seção FND-4 de `docs/pt-BR/stories.md`; `docs/pt-BR/integrations.md`; `docs/pt-BR/stories/FND-0/spec/spec.md`.

## Status

**Done**

## História

**Como** streamer que configura o chatbot Twitch local,
**quero** validar meu aplicativo confidencial Twitch, conectar a conta broadcaster e recuperar o estado de recompensas/resgates gerenciados,
**para que** o chatbot gerencie suas recompensas de fila sem expor credenciais nem inventar resultados remotos.

## Critérios de Aceitação

1. A validação Client ID/Secret usa Client Credentials; falha não salva a substituição, e Secret/token/código não aparece em respostas, interface, URLs, logs ou erros.
2. Authorization Code usa state único vinculado à sessão e callback HTTPS exato `https://localhost:${APP_PORT:-3000}/callback`; identidade do token deve corresponder ao Client ID/broadcaster configurado e aos escopos obrigatórios. Renovação é persistida, há validação inicial/por hora e autorização revogada mantém o painel local disponível para reconectar.
3. O usuário autorizado precisa ser o broadcaster configurado. Affiliate/Partner e disponibilidade da API Channel Points são verificados antes de ativar recursos Twitch. A projeção segura do setup mostra apenas campos allowlistados de elegibilidade/capacidade e explica estados indisponíveis/inelegíveis.
4. Somente recompensas gerenciadas por este app são associadas. Criação de recompensa é intenção durável na outbox, verifica a capacidade do canal, cria pausada com fila de resgate habilitada e nunca repete cegamente um POST de resultado desconhecido. Propriedade ambígua pode ser resolvida somente revalidando recompensa exata gerenciável pelo app e registrando auditoria sem alegar confirmação Twitch.
5. EventSub de add/update e reconciliação paginada de resgates deduplicam pelo ID do resgate, preservam estado terminal, tratam update antes do add/falha parcial e recuperam após reconexão. Assinaturas de chat/EventSub usam a própria conta do streamer e escopos mínimos necessários.
6. Testes PostgreSQL real isolado cobrem vínculo/persistência de credenciais, criação/associação durável de recompensa, recuperação de lease e resultado desconhecido. Testes unitários do adapter usam fakes; nenhum sucesso real Twitch é alegado sem execução autorizada.
7. Referências oficiais de integração são datadas, versões fixadas, bilíngues e incluem o mapeamento operação/evento → endpoint → escopo → SDK.

## Escopo

Inclui validação do app Twitch e OAuth, ciclo de token, adapters Twurple, elegibilidade do canal, criação e recuperação de propriedade de recompensa gerenciada, EventSub, reconciliação de resgates, estado do setup e documentação de integração relacionada. Edição/abertura-fechamento/arquivamento/exclusão de recompensas são comportamentos mais amplos de painel acompanhados em FND-5/FND-6. O aceite real Twitch é uma etapa do operador após o merge e não é alegado nesta story.

## Evidências TDD

- OAuth: `tests/unit/twitch-oauth.test.js` — 6 testes passaram após Red por falta de validação Client Credentials, vínculo/expiração/reuso do state e checagens de identidade/escopo; testes de persistência PostgreSQL verificam vínculo/rotação do mesmo app.
- Runtime/adapters Twurple: `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/eventsub-runtime.test.js`; falta de identidade normalizada do evento primeiro falhou no contrato EventSub e passou após normalização do adapter.
- Reconciliação: `tests/unit/twitch-event-processor.test.js`, `tests/unit/twitch-reconciliation.test.js`, `tests/unit/twitch-integration.test.js`; regressão do modo de fila primeiro aceitava `should_redemptions_skip_request_queue=true`, depois passou com normalização e detecção de divergência.
- Intenção durável de recompensa: Red PostgreSQL teve 2 falhas porque faltava transação atômica de criação da fila + outbox; Green passou 38. Red do worker teve 6 falhas comportamentais e Red PostgreSQL teve 2 operações ausentes; após worker com lease, criação pausada, limite de capacidade, associação de propriedade e estado desconhecido, testes unitários e PostgreSQL isolado passaram.
- Recuperação de recompensa ambígua: Red PostgreSQL 2, Red de rota 404 e Red da UI por ação/endpoints ausentes; Green verificou candidatos exatos gerenciáveis, nova consulta Twitch, sessão/CSRF, auditoria do operador, fila fechada e ausência de falsa confirmação.
- Projeção de elegibilidade: `tests/unit/queue-routes.test.js -t 'safe setup projection'` primeiro omitiu elegibilidade. Green passa com campo proibido `privateToken` excluído. `tests/unit/setup-messages.test.js` cobre capacidade Affiliate/Partner, estados inelegível/indisponível e consulta pendente. São fixtures de adapter; nenhum broadcaster foi consultado.
- Regressão do formulário HTTPS: reproduzido `currentTarget` nulo depois do despacho assíncrono; referências estáveis agora limpam o Secret após sucesso. Comandos/resultados exatos estão em `docs/pt-BR/stories.md`.

## Registro de Validação

- Suíte local final: `npm test` — 45 arquivos, 283 testes passaram.
- `npm run lint`, `npm run typecheck`, `npm run review:static` (40 arquivos JS da aplicação, 0 achados), `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram.
- `npm test -- --run tests/integration/compose-runtime.test.js` — 3 testes Compose/HTTPS isolados passaram.
- Nenhuma operação real de OAuth Twitch, recompensa, resgate, reembolso, chat ou EventSub foi executada. O operador validará no Windows/Twitch após o merge.

## Lista de Arquivos

Arquivos desta revisão:

- `.dockerignore`, `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `README.md`, `README.pt-BR.md`, `compose.yaml`, `iniciar.sh`, `iniciar.bat`, `atualizar.sh`, `atualizar.bat`, `desinstalar.sh`, `desinstalar.bat`.
- `apps/api/src/http/local-session.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/server.mjs`, `apps/api/src/twitch/auth-runtime.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/outbox/reward-worker.mjs`.
- `apps/infra/scripts/bootstrap.mjs`, `apps/infra/scripts/healthcheck.mjs`, `apps/infra/src/bootstrap-secret.mjs`, `apps/web/app.js`, `apps/web/index.html`, `apps/web/application-setup.mjs`, `apps/web/setup-messages.mjs`.
- `docs/integrations.md`, `docs/pt-BR/integrations.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, `docs/stories/FND-0/spec/spec.md`, `docs/pt-BR/stories/FND-0/spec/spec.md`, `docs/stories/FND-1/story.md`, `docs/pt-BR/stories/FND-1/story.md`, `docs/stories/FND-4/story.md`, `docs/pt-BR/stories/FND-4/story.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `tests/integration/queue-repository.test.js`, `tests/unit/bootstrap-secret.test.js`, `tests/unit/documentation-contract.test.js`, `tests/unit/local-ignore-policy.test.js`, `tests/unit/local-session.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/runtime-composition.test.js`, `tests/unit/start-script.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/twitch-oauth.test.js`, `tests/unit/web-route.test.js`, `tests/unit/maintenance-scripts.test.js`, `tests/unit/reward-outbox-worker.test.js`, `tests/unit/setup-messages.test.js`, `tests/unit/web-application-setup.test.js`.

## Resultados QA


### Data da revisão: 2026-10-05

### Revisado por: Quinn (Test Architect)

### Revisão do commit: b7a08b3

### Avaliação da qualidade do código

PASS (100/100). Os sete critérios de aceitação estão ligados a cobertura automatizada. O worker financeiro mantém chamadas remotas fora das transações do banco, persiste a intenção antes de chamar a Twitch e para para resolução do operador quando a propriedade é ambígua. Análise estática e quality gates do repositório passaram. Consulte `docs/qa/gates/FND-4-twitch-integration.yml` para o rastreamento Given/When/Then e comandos exatos.

### Refatoração feita

Nenhuma durante o QA; a revisão avaliada permaneceu inalterada.

### Verificação de conformidade

- Padrões de código: ✓ Estrutura ESM/JSDoc e lint configurado passaram.
- Estrutura do projeto: ✓ Layout modular apps e verificações estruturais passaram.
- Estratégia de testes: ✓ Fakes unitários e testes de integração PostgreSQL isolado com migrations reais e Compose passaram.
- Todos os critérios: ✓ Há cobertura automatizada para AC 1–7.

### Checklist de melhorias

- [x] Critérios de aceitação confrontados com os testes.
- [x] Revisados segredos, sessão local/CSRF, OAuth HTTPS, criação durável de recompensa e recuperação de resultado ambíguo.
- [x] Confirmada a documentação de integração/story/changelog em inglês e pt-BR.
- [ ] Operador validar os scripts `.bat` em Windows nativo após o merge.
- [ ] Operador validar OAuth e recompensa com o app Twitch autorizado; nenhum sucesso real foi alegado.

### Revisão de segurança

Nenhum achado bloqueador. Mutações usam sessão local/CSRF; state OAuth é único e vinculado à sessão; campos de segredos/tokens ficam fora das projeções do setup; gravações ambíguas na Twitch não são repetidas cegamente.

### Desempenho

Nenhum achado bloqueador. O worker usa leases, o trabalho é limitado, o atraso de retry tem teto e a reconciliação paginada é testada. Benchmark de desempenho não fazia parte do escopo.

### Arquivos alterados durante a revisão

`docs/qa/gates/FND-4-twitch-integration.yml`; Resultados QA/status/histórico da FND-4 e changelogs internos bilíngues.

### Estado do gate

Gate: PASS → `docs/qa/gates/FND-4-twitch-integration.yml`
Perfil de risco: nenhum risco bloqueador identificado.
Avaliação NFR: segurança, desempenho, confiabilidade e manutenção PASS.

### Transição do ciclo de vida

PASS: InReview → Done.


## Histórico

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-05 | 0.1.0 | Story FND-4 formalizada com implementação/evidências TDD; enviada para revisão QA. | @dev |
| 2026-10-05 | 0.1.0 | QA PASS (100/100) no commit `b7a08b3`; os sete critérios foram ligados às evidências automatizadas. Verificações de Windows nativo e Twitch real continuam como validação do operador. | @qa |
