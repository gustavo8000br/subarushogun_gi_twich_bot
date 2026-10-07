# Especificação: permissões hierárquicas de comandos e cargos da audiência Twitch

[English](../../../../stories/OPS-7/spec/spec.md)

> **Story:** OPS-7 (issue GitHub #39)
> **Complexidade:** COMPLEX (24/25)
> **Planejamento:** 2026-10-07
> **Estado:** implementação e gates locais concluídos; QA independente aprovado com 10/10. Consulte `../story.md`, `../tdd-log.md` e `../qa/qa-report.md`. A verificação Twitch ao vivo não foi realizada.

## 1. Visão geral

Substituir as listas explícitas de cargos do catálogo de comandos por uma política de nível mínimo que concede acesso também aos grupos superiores. Incluir um critério distinto de seguidor, verificado pela Helix da Twitch, mantendo o status de inscrito baseado no badge do evento de chat atual. Preservar limites fixos para streamer/moderadores, localizar os rótulos e migrar as configurações salvas sem alterar permissões efetivas na inicialização.

A ordem abaixo é uma hierarquia de autorização do produto, **não** uma hierarquia definida pela Twitch:

| Nível | ID canônico | Inglês | pt-BR | Espanhol | Evidência |
| ---: | --- | --- | --- | --- | --- |
| 0 | `everyone` | Everyone | Todos | Todos | Não exige prova de cargo |
| 1 | `follower` | Followers | Seguidores | Seguidores | Consulta Helix atual |
| 2 | `subscriber` | Subscribers | Inscritos | Suscriptores | Badge do canal no evento atual |
| 3 | `vip` | VIPs | VIPs | VIPs | Badge atual e toggle VIP existente |
| 4 | `moderator` | Moderators | Moderadores | Moderadores | Badge do canal no evento atual |
| 5 | `streamer` | Streamer | Streamer | Streamer | ID exato do broadcaster configurado; fixo |

`everyone` é o menor nível. Selecionar um nível mínimo concede acesso àquele grupo e a todos os níveis superiores verificados. Uma pessoa pode ter mais de uma evidência; o resolvedor usa o maior nível válido para a decisão atual. Inscrito e seguidor são critérios distintos. Os rótulos são localizados, sem criar IDs duplicados.

## 2. Objetivos e fora de escopo

### Objetivos

- Permitir que o streamer escolha o nível mínimo de cada comando configurável e visualize os grupos herdados.
- Fazer painel, `!fila comandos` / `!queue comandos` / `!cola comandos` e autorização do servidor usarem o mesmo resolvedor.
- Verificar seguidores atuais com a menor permissão Twitch necessária.
- Preservar políticas salvas e os limites fixos dos comandos.
- Manter localizado o conteúdo próprio do produto sem traduzir nomes, descrições de recompensas ou templates escritos pelo streamer.

### Fora de escopo

- Tempo de seguimento/inscrição, nível de inscrição, histórico de presente ou distinções entre assinatura paga e Prime.
- Persistir seguidores ou cargos, adicionar cache persistente de membros ou usar eventos `channel.follow` como fonte de associação atual.
- Alterar o catálogo além de corrigir o bloqueio aprovado para comandos de conta e localizar rótulos existentes.
- Dar acesso de seguidor a operações de fila ou alterar regras financeiras.
- Adicionar escopos Twitch além do `moderator:read:followers` opcional especificamente aprovado.

## 3. Requisitos e aceite

Os requisitos normativos são FR-1–FR-12, NFR-1–NFR-5 e CON-1–CON-6 em `requirements.json`. Os critérios AC-1–AC-17 formam o gate de implementação. Em especial:

1. Cada comando configurável salva exatamente um nível mínimo (`everyone`, `follower`, `subscriber`, `vip` ou `moderator`). O broadcaster mantém acesso por identidade aos comandos configuráveis; o mesmo resolvedor puro é usado pela autorização do chat e pela ajuda, e a identidade do broadcaster nunca vem do cliente. Acesso exclusivo do streamer fica reservado a comandos imutáveis.
2. Acesso fixo é imutável: gestão de filas e `!queue ping` exigem streamer/moderador; `!conta <nome>` e `!conta reset` exigem a identidade do broadcaster.
3. VIP só é uma evidência de cargo quando o toggle VIP existente está ligado. Evidência independente de inscrito, moderador ou streamer continua válida com o toggle desligado.
4. Usar badges atuais do chat do canal de destino para moderador, VIP e inscrito. `source_badges`, texto, display name, login, cargos no corpo HTTP e eventos antigos nunca autorizam.
5. Verificar seguidor pela Helix para o `user_id` exato do evento atual. Validar escopo e identidade do token antes de interpretar `data: []` como não seguidor. Qualquer resultado não resolvido falha fechado e não causa mutação, tarefa outbox, consulta de conta/fila ou operação financeira.
6. Solicitar o escopo de seguidor somente quando o streamer tentar configurar um nível que o exige. OAuth vinculado à sessão valida os escopos realmente concedidos, Client ID, broadcaster e `state`. Consentimento negado/falho mantém a credencial e política utilizáveis anteriores.
7. Listas da versão 1 continuam como `legacy_exact` após atualização. Não são convertidas implicitamente. O painel mostra os cargos efetivos atuais e a proposta de novo nível; converter somente após salvar explicitamente o comando editado.
8. Ajuda fica dentro do limite de 500 caracteres e filtra usando a mesma política de acesso efetiva. Se a verificação de seguidor estiver indisponível, omitir comandos que dependam dela e usar texto localizado e seguro.
9. Cada incremento segue Red → Green → Refactor. Garantias PostgreSQL usam instância real isolada com migrations; mocks ficam restritos às fronteiras Twitch/rede.

## 4. Arquitetura

### 4.0 Dependências, arquivos e limite de reversão

- Dependências de runtime permanecem nas versões já fixadas em `package-lock.json`: `@twurple/api`, `@twurple/auth` e `@twurple/eventsub-ws` 8.2.0, Prisma/PostgreSQL e stack web vanilla existente. Não se planeja pacote/serviço novo, nova tabela nem assinatura Twitch. Conferir declarações e documentação oficial novamente se o lockfile mudar antes da implementação.
- Arquivos existentes esperados para inspeção/alteração: `apps/api/src/commands/catalog.mjs`, `authorization.mjs`, `chat-handler.mjs`, `help.mjs`; `apps/api/src/twitch/oauth.mjs`, `auth-runtime.mjs`, `helix-adapter.mjs`, `eventsub-runtime.mjs`; `apps/api/src/persistence/queue-repository.mjs`; `apps/api/src/http/queue-routes.mjs`; `apps/web/app.js`, `command-catalog-view.mjs`, `index.html`, `styles.css`, TSVs dos catálogos chat/panel; `tests/unit/command-catalog.test.js`, `command-authorization.test.js`, `chat-command-handler.test.js`, `command-help.test.js`, `queue-routes.test.js`, `twitch-oauth.test.js`, `twitch-adapter.test.js`, `eventsub-runtime.test.js`; e `tests/integration/command-policy-persistence.test.js` mais eventuais testes novos de escopo restrito. Arquivos podem entrar/sair da lista final da story somente com justificativa registrada antes de alterá-los.
- Não se espera migration destrutiva: manter JSON v1 legível e preservar valor até converter comando explicitamente. Se gravação ou validação v2 falhar, rejeitar a gravação e manter o JSON anterior. Rollback de deploy volta o código anterior; não reescreve registros v2 para listas v1 presumidas. Versão compatível seguinte lê mínimo v2 e `legacy_exact`; se binário antigo não puder ler v2 com segurança, bloquear escrita/conversão até restaurar versão compatível em vez de rebaixar dados persistidos.
- Consentimento OAuth opcional usa troca staged de credencial: validar grant do callback para o mesmo client/broadcaster e escopos requeridos+opcional, depois substituir atomicamente a credencial ativa e salvar política/revisão selecionada. Erro antes do commit descarta grant staged e mantém credencial/política ativas. Este limite precisa de teste de transação PostgreSQL real com fakes OAuth.

### 4.1 Política de cargos e resolvedor de domínio

A configuração existente `chat_command_policies` é um Setting JSON `{ version, policies }` cujos valores são arrays. Introduzir representação v2 versionada sem novo serviço ou tabela:

```json
{
  "schemaVersion": 2,
  "revision": 2,
  "policies": {
    "queue:lista": { "mode": "minimum_role", "minimumRole": "follower" },
    "queue:posicao": { "mode": "legacy_exact", "allowedRoles": ["subscriber", "moderator"] }
  }
}
```

O envelope salvo usa `schemaVersion` e `revision`; a projeção da API chama a revisão de concorrência de `version`. Manter versão do schema separada da revisão; nenhuma delas é `product_version` ou a versão do contrato da API.

- Validar todos os formatos e falhar fechado com política malformada ou desconhecida.
- Ler arrays antigos como `legacy_exact`, sem gravar no banco durante o boot. Preservar semântica OU até a conversão explícita daquele comando.
- Novos padrões usam `minimum_role`; comandos de consulta/autosserviço continuam por padrão em `everyone`. Regras fixas vêm do registro canônico, não da persistência editável.
- Atualizar uma política grava o comando escolhido, incrementa a revisão e registra ator, origem, ID do comando, modo/nível antigo e novo na mesma transação PostgreSQL.
- Não gravar claims, resultado de seguidores, resposta Twitch bruta, mensagem de chat ou OAuth nos detalhes de auditoria.
- O resolvedor puro recebe definição canônica, política validada e evidências confiáveis. A consulta externa de seguidor ocorre antes, num serviço Twitch; a função pura não faz rede nem mutação.

### 4.2 Evidências confiáveis de cargo

Resolver os claims nesta ordem, usando o maior nível atual válido:

1. `streamer`: `message.userId === configuredBroadcasterId`.
2. `moderator`: `badges` do evento atual contém `moderator` para o canal de destino.
3. `vip`: `badges` do evento atual contém `vip` e `allowVipManagement === true`.
4. `subscriber`: `badges` do evento atual contém `subscriber` para o canal de destino.
5. `follower`: consulta Helix atual tem sucesso para o ID Twitch do usuário do evento.
6. `everyone`: nível base; não exige consulta de rede.

A ordem é política do produto. Badges Twitch podem se sobrepor e não são uma hierarquia rígida. VIP não inscrito satisfaz política mínima de inscrito porque o produto colocou VIP acima; com toggle VIP desligado, o claim VIP é ignorado. Moderador permanece acima de VIP/inscrito. Políticas `everyone` nunca precisam verificar seguidor.

Rejeitar evento de canal incorreto ou Shared Chat de outro canal antes de consultar Twitch ou executar comando. Usar o mapa de objetos `badges` do Twurple EventSub atual; manter suporte a arrays normalizados somente na fronteira atual do adapter/domínio.

### 4.3 Verificação de seguidor e escopo OAuth

Usar o método instalado `api.channels.getChannelFollowers(broadcasterId, eventUserId)`, correspondente a `GET /helix/channels/followers?broadcaster_id=...&user_id=...`.

- Autenticar com o token de usuário broadcaster da instalação. Conferir identidade de broadcaster/Client ID e escopo atual `moderator:read:followers` pelo estado já validado do provider antes de usar resposta da API.
- Retornar resultado tri-state: `follower`, `not_follower` ou `unknown`. Nunca converter falha, escopo ausente, 401/403, resposta malformada, timeout ou rate limit em `not_follower`.
- Confirmar que a linha positiva tem exatamente o ID Twitch solicitado. Nunca autorizar por login ou display name.
- Consultar somente após reconhecer comando que exige evidência de seguidor. Claims superiores conhecidos podem dispensar a consulta. Ajuda pode fazer no máximo uma verificação para o usuário; se desconhecido, listar apenas comandos comprovadamente acessíveis abaixo de seguidor e explicar que não foi possível confirmar acesso de seguidor.
- Não manter cache de resultados concluídos. Consultas simultâneas para mesmo broadcaster/usuário podem compartilhar promessa em andamento; novo comando faz consulta atual. Não persistir associação nem payload.
- Não criar assinatura EventSub de follower para autorização: `channel.follow` informa novos follows, não associação atual nem unfollow.
- Sanitizar erros nos logs. Em 429, respeitar janela de reset e não repetir agressivamente. Falha de autorização não libera comando. Não expor erro técnico/token no chat.
- Escopos obrigatórios atuais permanecem iguais. Se o streamer escolher nível que exige follower sem escopo opcional, painel inicia OAuth vinculado à sessão com escopos atuais mais `moderator:read:followers`. Callback valida escopos realmente concedidos. Só após validação pode concluir a política. Consentimento negado/falho não pode substituir token/política anteriores.
- Se o escopo opcional for perdido, desabilitar apenas uso de políticas dependentes de seguidor e oferecer ação de reconexão/autorização; não indisponibilizar as demais funções Twitch.

### 4.4 Matriz de regras fixas

| Comandos | Acesso fixo/mínimo | Editável? |
| --- | --- | --- |
| Gestão de fila: adicionar, remover, próximo, atender, concluir, mover, abrir/fechar, prévia/confirmação de limpeza | Moderador (streamer herda) | Não |
| `!conta <nome>` e `!conta reset` | Identidade streamer apenas | Não |
| `!queue ping` / equivalente na raiz localizada | Moderador (streamer herda) | Não |
| Consulta pública, autosserviço e descoberta de comandos | Nível configurável; padrões atuais seguem `everyone` | Sim |

O registro canônico é fonte das regras imutáveis. Rejeitar payload HTTP que tente alterar comando fixo antes de persistir. Corrigir regras/testes existentes de `global:conta:set` e `global:conta:reset`, atualmente permitindo moderadores em OPS-3, conforme a regra explícita do proprietário.

### 4.5 Painel, API, ajuda e localização

- Manter sessão local autenticada, CSRF, chave de idempotência, validação de schema e revisão otimista das rotas protegidas.
- API de comandos retorna projeção segura: ID, texto/sintaxe localizada, modo/nível mínimo, cargos herdados efetivos, audiência fixa, estado de revisão legacy, prontidão do escopo follower e revisão da política. Não serializar linhas Prisma nem tokens.
- Para cada comando configurável, painel oferece um nível mínimo e prévia dos grupos herdados (ex.: “Inscritos e acima”: Inscritos, VIPs, Moderadores, Streamer). Linhas fixas aparecem bloqueadas. Linhas legacy mostram cargos atuais e proposta antes de salvar conversão.
- Ajuda usa chaves dos catálogos FND-8 para rótulos e raiz de comando localizada. `subscriber` vira `Subscribers`, `Inscritos`, `Suscriptores`; `follower` vira `Followers`, `Seguidores`, `Seguidores`. São IDs de cargo distintos.
- Nomes, slugs, descrições e templates escritos pelo streamer não são traduzidos. Texto não confiável continua renderizado por `textContent` e limitado no chat.
- Cooldown de viewer continua para todo remetente que não seja streamer/moderador, incluindo seguidor/inscrito/VIP; não conceder exceção de cooldown apenas por esses cargos.

## 5. Pesquisa Twitch e Twurple

Consulta em 2026-10-07; endpoint, escopo, método SDK e declarações instaladas constam em `research.json`.

| Operação | Endpoint ou evento Twitch | Escopo | Adaptação |
| --- | --- | --- | --- |
| Ler badges atuais de moderador/VIP/inscrito | EventSub `channel.chat.message` v1 | `user:read:chat` existente | Twurple 8.2.0 fornece `badges` alvo como mapa de objetos; ler por evento, não persistir. |
| Verificar seguidor atual | `GET /helix/channels/followers?broadcaster_id={broadcaster}&user_id={chatter}` | Escopo opcional `moderator:read:followers`; token deve ser broadcaster ou moderador do canal | Twurple 8.2.0 `api.channels.getChannelFollowers(broadcaster, user)`; conferir escopo antes de interpretar `data` vazio. |
| Observar apenas novo seguidor | EventSub `channel.follow` v2 | `moderator:read:followers` | Não usar para autorização; não é consulta de associação atual. |
| Validar token OAuth e escopos concedidos | `GET https://id.twitch.tv/oauth2/validate` | Contrato de validação de token | Validar no início/por hora como já previsto; conferir Client ID/broadcaster e escopos atuais. |

### Fontes consultadas

- [Twitch — Sending and Receiving Chat Messages](https://dev.twitch.tv/docs/chat/send-receive-messages/)
- [Twitch — EventSub Reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference/)
- [Twitch — EventSub Subscription Types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Twitch — Helix API Reference, Get Channel Followers](https://dev.twitch.tv/docs/api/reference)
- [Twitch — OAuth Scopes](https://dev.twitch.tv/docs/authentication/scopes/)
- [Twitch — Validating Tokens](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [Twitch — API Rate Limits](https://dev.twitch.tv/docs/api/guide)
- [Twurple 8.2.0 — HelixChannelApi](https://twurple.js.org/reference/api/classes/HelixChannelApi.html)
- [Twurple 8.2.0 — RefreshingAuthProvider](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html)
- Declaração Twurple instalada: `node_modules/@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.d.ts` (`badges: Record<string,string>`, `sourceBadges: Record<string,string> | null`).

## 6. Estratégia TDD

Cada item é incremento de comportamento; o primeiro artefato de implementação deve ser teste comportamental falhando. Registrar comando Red/falha exata, resultado Green e refactor/reexecução nos documentos da story pareados. Não usar mock para provar garantia PostgreSQL.

1. **Hierarquia:** testes parametrizados de todos níveis/claims, sobreposição, identidade streamer, toggle VIP e herança monotônica. Provar que login/display name/body não concede acesso.
2. **Comandos fixos:** catálogo, payload de rota, chat e serviço: gestão=moderador+, conta=streamer, ping=moderador+ e negação antes de qualquer efeito.
3. **Badges/EventSub:** mapa de objetos atual, arrays normalizados, `sourceBadges` ignorado, apenas evento atual, canal errado e Shared Chat estrangeiro.
4. **Adapter follower:** ID positivo exato; não seguidor com escopo; escopo/identidade ausentes; ambiguidade de resposta vazia; ID incorreto; erro, timeout, 401, 429/reset, 5xx, resposta malformada, mudança de escopo e ausência de persistência.
5. **Consulta condicional:** sem rede para texto irrelevante, política `everyone`, claim conhecido suficiente; uma promessa em voo compartilhada para concorrência; nenhum cache obsoleto concluído.
6. **Sem efeitos indevidos:** follower desconhecido/negado não gera leitura/mutação de fila/conta, operação de resgate/outbox ou mensagem de sucesso. Comando `everyone` continua funcional na falha Helix.
7. **Ajuda/cooldown:** ajuda global/localizada e por fila, follower desconhecido, comandos ocultos, herança, máximo 500 caracteres e cooldown em follower/inscrito/VIP, não streamer/moderador.
8. **Compatibilidade persistida:** PostgreSQL real isolado e migrations reais; ler política v1; reiniciar; mesma decisão legacy; converter só um comando; preservar demais; auditar; conflito de revisão; JSON inválido fechado. Boot não escreve setting v1.
9. **API/painel:** sessão, CSRF, idempotência/revisão, cargo desconhecido, rejeição de mutação fixa, DTO seguro, prévia herdada e conversão legacy, rótulos localizados, texto seguro e estado de escopo.
10. **OAuth escopo opcional:** state curto, único e vinculado à sessão; lista mínima de escopos; callback ignora escopos query-supplied; valida token/client/broadcaster/escopo atual; negar/faltar escopo/erro preserva credencial/política anterior; grant válido no mesmo canal funciona; troca canal/client segue bloqueada.
11. **Segurança/observabilidade:** nenhum token, snapshot de cargo, resultado de follower ou erro bruto Twitch em log/chat/URL/DTO/auditoria/estado público; apenas motivo sanitizado e estado acionável no painel.
12. **Documentação/versão:** paridade inglês/pt-BR de story, integrações, changelogs aplicáveis; sem promover beta antes de OPS-7, OPS-8, FND-9 e DOC-2; testes de versão não reescrevem `VERSION`.

Gates finais: testes focados a cada incremento; integração PostgreSQL; `npm run lint`; `npm run typecheck`; `npm test`; `npm run review:static`; `npm run validate:version`; Compose config; paridade documental; diff limpo. QA independente da implementação deve pontuar 10/10 antes de Done. Consulta real de follower Twitch autorizada permanece validação separada e não deve ser alegada sem execução.

## 7. Riscos e mitigação

| Risco | Severidade | Mitigação/teste obrigatório |
| --- | --- | --- |
| Lista salva antiga vira acesso herdado mais amplo | Crítica | Preservar `legacy_exact` até salvamento por comando; comparar audiência antiga/nova na UI. |
| Resposta Helix vazia é tomada como não seguidor sem escopo | Crítica | Validar escopo/identidade; resultado tri-state e teste sem escopo. |
| Evidência antiga concede acesso | Crítica | Ler badges por evento, não cachear follower concluído, rejeitar canal de origem estrangeiro. |
| Toggle VIP muda herança de modo inesperado | Alta | Claim VIP ausente quando desligado; preservar cargos independentes; tabela verdade. |
| Alteração de conta ainda aceita moderador | Crítica | Fixar identidade broadcaster no registro e rota; testes regressivos. |
| Consulta follower adiciona atraso/rate limit aos comandos normais | Média | Só consultar após parse; verificar apenas quando necessário; coalescer somente chamadas em voo; respeitar reset. |
| Perda de escopo opcional interrompe outras operações | Alta | Capacidade follower isolada; desativar só políticas dependentes. |

## 8. Plano de implementação

Os incrementos ordenados e comandos de verificação estão em `plan.json`. Trabalho começa somente após esta especificação passar duas críticas QA e ser aceita como contrato de implementação OPS-7.

### Mapa esperado de arquivos

A story de implementação deve confirmar esta lista esperada em cada teste Red e registrar os caminhos finais exatos, incluindo/removendo arquivos somente com justificativa. Artefatos de planejamento são pareados em `docs/stories/OPS-7/spec/` e `docs/pt-BR/stories/OPS-7/spec/`; índice de stories, roadmap e decisões de integração têm versões bilíngues. Não criar API, migration, pacote ou escopo fora dos critérios revisados.

## 9. Sequência de release

Sequência autorizada pelo proprietário: OPS-7 → OPS-8 → FND-9 → DOC-2. O proprietário autorizou condicionalmente avançar o stage para `beta` somente depois das quatro stories concluídas. Concluir story, PR, commit ou teste não promove `.release-stage`; após toda a sequência, seguir fluxo autorizado de identidade canônica `v1.0.0-HHHHHHH-beta` com @devops. Não alterar stage nem materializar release durante o planejamento da OPS-7.

## 10. Questões em aberto

Nenhuma questão bloqueadora identificada. Decisões recebidas nesta sessão distinguem badge de inscrito de relação de seguidor e aprovam o escopo follower opcional. A ordem e os rótulos da hierarquia acima são política explícita do produto.
