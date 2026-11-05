# OPS-20 — Permitir que a pessoa streamer escolha quem tem direito à devolução de pontos

[English](../../../stories/OPS-20/story.md)

**Status:** Rascunho refinado — planejamento em andamento; a implementação ainda aguarda o término da migração da OPS-15 e a implementação por @dev com UX ≥ 9,0 antes de qualquer mudança de painel/texto. **Issue:** [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76), criada pelo `$aiox-devops`.
**Origem:** Conversa do proprietário com um streamer que vai usar o bot, 2026-10-21. À pergunta “Você devolve os pontos quando termina um resgate?”, o streamer respondeu que só devolve **para quem é sub**, porque quem é sub já colabora com a live.
**Relacionadas:** outbox financeiro durável FND-3; ciclo de fila/recompensa FND-9; paridade das configurações de fila da OPS-15 (`refundIfRemovedWhileCalled`, `refundOnNoShow`, `refundIfViewerLeavesCalled`). Pesquisa: [research.md](research.md).
**Coordenação necessária:** `$aiox-data-engineer` (migration, snapshot e plano de rollback), `$aiox-ux-design-expert` (score ≥ 9,0/10 antes de qualquer mudança de painel/texto), `$aiox-architect` (fronteira de domínio) e `$aiox-qa` independente.

## Problema

Hoje a devolução é um conjunto de chaves liga/desliga independentes por fila. A pessoa streamer não consegue dizer “devolva, mas só para alguns viewers”. Cada canal tem sua regra: uns devolvem para todos, outros nunca, outros só para subs. Chaves únicas obrigam a devolver demais ou de menos, ou a tratar exceções à mão na Twitch.

Base da pesquisa (código lido em 2026-10-21; sem evidência de Twitch real): `decideEntryTransition()` já solicita devolução incondicionalmente quando um resgate em espera é removido e quando uma fila é limpa ou excluída, sobrepondo a política. As devoluções guiadas por política (chamado, não compareceu, viewer saiu) vêm de três colunas Booleanas da fila. Badges de chat não são fonte com qualidade de auditoria, e o payload do resgate não traz o status de sub.

## História

Como streamer que devolve pontos apenas para alguns viewers (por exemplo, subs),
quero escolher quais viewers têm direito à devolução quando um resgate é removido, não atendido ou abandonado,
para que o bot aplique a regra do meu canal, em vez de devolver para todos ou para ninguém.

## Critérios de aceitação (refinados)

### Regra e públicos

1. Cada fila tem **uma** regra de elegibilidade de devolução com os valores **todos** (comportamento atual; padrão, para nada mudar nas filas existentes), **somente subs** e **ninguém**. Em “somente subs”, subs são sempre elegíveis (público padrão).
2. “Somente subs” também expõe a inclusão **independente e configurável** de: a própria conta da pessoa streamer, moderadores e VIPs. Os padrões são: streamer, moderadores e VIPs **não elegíveis**; cada um pode ser ligado separadamente. O painel diz com clareza que, quando alguém ajuda com um sub (por exemplo, presenteando), a pessoa streamer ainda pode escolher devolver os pontos (ver CA 8).
3. O que conta como sub é **configurável**: por padrão, qualquer assinatura ativa, incluindo presenteadas e todos os tiers. Opções: excluir assinaturas presenteadas e/ou exigir um tier mínimo. O status vem das assinaturas ativas que a Twitch informa (tier e indicador de presente, pesquisa §1). **Sinalização para `@po`/`@architect`:** decidir se “tier mínimo” entra no MVP ou em incremento posterior; “excluir presenteadas” é MVP, salvo decisão em contrário.
4. A regra vale para **toda** devolução que o bot solicitaria: removido enquanto chamado, não compareceu, viewer saiu, limpeza da fila, exclusão da fila e remoção de entradas em espera. A pesquisa constatou que limpeza, exclusão e remoção em espera hoje sempre devolvem; agora devem passar pela regra. As chaves por gatilho existentes continuam decidindo **quando** a devolução é tentada; a regra decide **se** o viewer tem direito.

### Decisão, auditoria e status desconhecido

5. A elegibilidade é decidida uma vez por resgate, no momento da decisão de devolução, com o status que a Twitch informa naquele instante, e persistida antes de criar a tarefa do outbox, para que novas tentativas não consultem de novo e mudem a resposta. Estados de resultado: `eligible`, `not_eligible`, `unknown`. `subscriber`/`not_subscriber` só vêm de resposta bem-sucedida com formato válido.
6. A auditoria registra, por resgate: o snapshot da regra (incluindo opções de público e de definição de sub), a decisão, o status de sub, o tier e o indicador de presente (anuláveis), a origem do status (por exemplo, assinaturas do Helix, não necessário, conta da própria pessoa streamer), o horário da consulta e, para unknown, apenas um **código** de motivo. Nunca guarda identidade de quem presenteou, tokens, UIDs em logs, nem texto de chat ou de resgate.
7. Quando o status não puder ser determinado (Twitch indisponível, escopo `channel:read:subscriptions` ausente, 401/403/429/5xx, timeout, corpo malformado, erro de consulta), o bot não presume: a devolução fica **pendente/desconhecida** (nunca convertida em concedida ou negada, nunca descartada em silêncio), com explicação localizada e segura. O painel pede que a **pessoa streamer ou moderadores** (quem tem acesso ao painel) confirmem o que fazer.

### Ação manual

8. Uma ação explícita de **override manual** permite que a pessoa streamer (e moderadores com acesso ao painel) devolva **ou** negue à mão um resgate específico, a qualquer momento, inclusive para um viewer que a regra marca como não elegível e por qualquer motivo que a pessoa streamer escolha. Todo override é auditado com quem, quando e motivo (texto livre limitado, fora dos logs). O override respeita o outbox durável (uma intenção financeira por resgate, idempotência) e não duplica uma devolução já solicitada.

### Escopo e consentimento

9. `channel:read:subscriptions` é um escopo **opcional**, nunca obrigatório, para que as conexões existentes continuem funcionando. Uma fila em “somente subs” resulta em `unknown` até a pessoa streamer reautorizar. O painel mostra orientação clara e uma ação de novo consentimento (reconectar a Twitch). “Todos” e “ninguém” não precisam de escopo novo. Canais sem afiliação/parceria (que não têm resgates) ocultam a opção, como as filas só manuais. “Zero subs” nunca é lido como “não é sub” sem uma resposta bem-sucedida.
10. Se as opções de público incluírem moderadores ou VIPs, os escopos extras necessários (pesquisa §3) também são opcionais, com o mesmo comportamento de `unknown` mais novo consentimento; a conta da própria pessoa streamer não exige chamada de API.

### Limpeza da fila e limites de taxa

11. A limpeza da fila consulta o status de sub em lotes (pesquisa §5: uma consulta cobre até 100 viewers, a validar com a documentação pelo `@architect`; os números de orçamento ali não estão verificados) e recua em caso de 429, deixando os itens afetados `unknown`/com nova tentativa. As devoluções podem ser agrupadas por recompensa (até 50 ids por chamada, segundo a pesquisa) somente se o resultado por resgate continuar registrado; um 404 (“não está UNFULFILLED”) nunca é informado como devolução.
12. Os textos de confirmação e resultado da limpeza (no painel e no chat) deixam de prometer um número único de devoluções de antemão. Informam contagens por resultado: elegíveis, não elegíveis e verificação pendente, sempre como “solicitada”/“pendente”, não “confirmada”, até a Twitch confirmar.

### Veracidade e tratamento de não elegíveis

13. O resgate de quem não tem direito é tratado de forma explícita, pois um item UNFULFILLED, caso contrário, permanece na fila da Twitch (pesquisa §7). A escolha entre (a) marcá-lo como FULFILLED sem devolução e (b) mantê-lo UNFULFILLED é registrada nesta story pelo `@architect` no portão de fronteira e revisada no portão do `@ux-design-expert`, antes do início da implementação. Os testes então verificam o comportamento escolhido em todos os gatilhos do CA 4. O painel e o chat nunca sugerem que uma devolução foi solicitada ou confirmada quando não foi.
14. As regras do outbox durável continuam valendo: uma intenção financeira por resgate, idempotência, lease/retry, nenhuma alegação de confirmação remota até a Twitch confirmar; unknown nunca vira `request_cancel` nem `no_operation` sem aviso.

### UX, textos e dados

15. O formulário de configurações da fila expõe a regra, os públicos e a definição de sub com texto acessível em en, es e pt-BR que explica o efeito em linguagem simples. Filas só manuais o ocultam. A revisão bilíngue dos textos (en e pt-BR, mais es) faz parte da revisão de UX, com o score 9,0/10 registrado na story antes da implementação; revisão estática se distingue de validação visual, de navegador e de tecnologia assistiva.
16. Migration do `@data-engineer`: coluna enum (`everyone`/`subscribers`/`nobody`) NOT NULL DEFAULT `everyone` na fila, mais campos configuráveis de público e de definição de sub com padrões que preservam o comportamento atual das linhas existentes (sem alteração de dados na migration). Snapshot antes; plano de rollback documentado. Armazenamento de auditoria conforme CA 6 e CA 8.
17. PostgreSQL isolado real com migrations reais verifica persistência, preservação do padrão nas filas existentes, decisões de elegibilidade, variações de público e de definição de sub, override manual e auditoria. Testes na fronteira Twitch usam fakes. Nenhuma alegação de Twitch real; os tipos de evidência permanecem separados.

## Decisões (proprietário, 2026-10-21)

1. **Os públicos são configuráveis por pessoa streamer, não fixos no código.** Subs são o padrão da regra “somente subs”; a própria conta da pessoa streamer, moderadores e VIPs são selecionáveis de forma independente. O painel deve dizer com clareza que, se alguém ajuda com um sub (presentes), a pessoa streamer ainda pode escolher devolver os pontos. O amigo streamer que vai usar o bot devolve apenas para subs. Moderadores normalmente nem deveriam resgatar (o moderador pode usar o comando de adicionar à fila com o próprio nick) e costumam ser atendidos de graça; por isso moderadores e VIPs ficam por padrão **não elegíveis**, mas selecionáveis.
2. **O que conta como sub também é configurável.** Padrão: qualquer assinatura ativa, incluindo presenteadas e todos os tiers. Opções: excluir presenteadas e/ou um tier mínimo. Se o tier mínimo entra no MVP ou depois será decidido com `@po`/`@architect` (sinalizado no CA 3).
3. **Uma regra por fila vale para todos os gatilhos de devolução** (removido enquanto chamado, não compareceu, viewer saiu, limpeza da fila, exclusão da fila, remoção de entradas em espera). As chaves por gatilho existentes continuam decidindo **quando** devolver. Limpeza, exclusão e remoção em espera, que hoje sempre devolvem, devem passar pela regra.
4. **Status de sub desconhecido nunca é presumido.** A devolução fica pendente/desconhecida e o painel pede que a pessoa streamer ou moderadores (quem tem acesso ao painel) confirmem. Uma ação de override manual explícita permite à pessoa streamer sempre devolver (ou negar) um resgate específico à mão, com auditoria de quem, quando e motivo, inclusive para um viewer não elegível quando a pessoa streamer assim decidir por qualquer motivo.
5. **Escopo ausente:** `channel:read:subscriptions` é opcional, com fluxo de novo consentimento e orientação clara no painel; o resultado é `unknown` até haver autorização. Canais sem afiliação ocultam a opção.
6. **O tratamento de resgates não elegíveis é configurável por fila** (proprietário, 2026-10-21, após fato verificado da Twitch: “You may update a redemption only if its status is UNFULFILLED”, ou seja, um resgate FULFILLED nunca mais pode ser reembolsado pela API). Opções: *manter UNFULFILLED até a streamer decidir* (o reembolso continua possível por override manual; o resgate fica pendente na lista da Twitch; o painel oferece “marcar como atendidos” em lote e “devolver pontos” individual, ambos auditados) ou *marcar FULFILLED automaticamente* (lista da Twitch limpa; reembolso manual impossível depois, e o painel deve dizer isso antes da escolha). Se resgates UNFULFILLED pendentes expiram ou têm limite na Twitch **não foi verificado**. Isso resolve o CA 13 junto com o gate de fronteira do `@architect` (valor padrão a ser proposto lá, redação a revisar pelo `@ux-design-expert`).
7. **Moderador ou VIP que também é inscrito é elegível** na regra “somente inscritos” (proprietário, 2026-10-21, respondendo OD-1 da nota de arquitetura): as opções de público (streamer, moderadores, VIPs) apenas ACRESCENTAM elegibilidade, então o padrão não exige escopos de moderador/VIP nem força novo consentimento.
8. **Decisões de UX (proprietário, 2026-10-21, OD-UX-1/2/3 do plano de UX, nota do gate 9,1/10 só estática):** (a) as opções “somente inscritos” e “ninguém” aparecem no painel só quando a fatia 3 (lista “precisa da sua decisão” e ações manuais) for entregue, para que não exista resgate pendente sem tela para resolvê-lo; (b) um único termo, “devolver os pontos”, substitui “reembolso” em todo o texto existente e novo do painel e nas quatro mensagens do chat em pt-BR, es e en (a parte do chat passa pelo `@po` e pela issue #65); (c) motivo (máx. 280 caracteres) obrigatório em toda ação manual de devolver ou negar, um motivo por lote.

## Validação do PO (2026-10-21)

**Validador:** `@po` (Pax), validação de rascunho de story (checklist de 10 pontos). **Score:** 9,0/10 (nova avaliação em 2026-10-21; primeira passagem 8,5). **Decisão:** GO para os portões de planejamento; a implementação continua bloqueada pelos portões abaixo.

**Pontos recuperados (8,5 → 9,0):** +0,5 porque o CA 13 agora é testável: a escolha em aberto tem responsável (`@architect`, portão de fronteira), revisor (portão do `@ux-design-expert`), prazo (antes da implementação) e obrigação de teste (todos os gatilhos do CA 4). Nenhum requisito novo foi adicionado; as duas opções vêm da pesquisa §7.

**O que ainda impede 10 (só se resolve após portões seguintes, por isso não entra na nota agora):** (1) a decisão de tier mínimo no MVP precisa de confirmação do `@architect` (CA 3); (2) o CA 11 depende de limites da Twitch que a pesquisa não verificou (100 `user_id`s, 50 ids, orçamento de taxa), a conferir no portão do `@architect`; (3) ainda não há estimativa de complexidade; ela pertence à avaliação de complexidade do `@architect`. O status permanece Rascunho até os portões de planejamento passarem, pois a implementação está bloqueada por eles.

| # | Verificação | Resultado |
|---|---|---|
| 1 | Título e objetivo claros | Aprovado |
| 2 | História completa | Aprovado |
| 3 | CAs testáveis | Aprovado (CA 13 reescrito: decisão registrada pelo `@architect` no portão de fronteira, revisada pela UX e depois testada) |
| 4 | Limites de escopo | Parcial, corrigido: seção "Fora do escopo" adicionada |
| 5 | Dependências | Aprovado (OPS-15, FND-3, FND-9, escopos opcionais, novo consentimento) |
| 6 | Rastreabilidade, sem invenção (Art. IV) | Aprovado: todo CA remete às decisões 1–5 do proprietário ou à pesquisa §0–§7 |
| 7 | Riscos | Aprovado |
| 8 | Desenvolvimento por story, portões (Art. III) | Aprovado |
| 9 | Segurança de dados e testes | Aprovado |
| 10 | Equivalência en/pt-BR | Aprovado (mesmos 17 CAs, 5 decisões, portões e riscos) |

**Correções aplicadas:** adicionada "Fora do escopo"; registrado que as decisões do proprietário prevalecem sobre a pesquisa §3/§7 (a pesquisa sugeria a pessoa streamer elegível por padrão e moderadores/VIPs fora do MVP; o proprietário escolheu os três configuráveis e não elegíveis por padrão); registrada a recomendação sobre tier mínimo.

**Tier mínimo — recomendação do PO: incremento posterior, não MVP** (decisão final no portão do `@architect`). Motivos: o streamer real do proprietário só precisa de "qualquer sub ativa"; o padrão conta todos os tiers; o CA 6 já guarda o tier, então a opção futura não exige backfill de dados; reduz a UX de configuração e a matriz de testes; o Prime aparece como tier 1000, o que não foi verificado (pesquisa §1). "Excluir presenteadas" continua no MVP.

## Fora do escopo

- Tier mínimo de assinatura (pendente de confirmação do `@architect` sobre a recomendação acima).
- Badges de chat ou cache de assinaturas via EventSub como fonte de status (pesquisa §4).
- Regras de elegibilidade por gatilho (pesquisa §7).
- Alegações de validação em Twitch real; bump de versão, push ou release.

## Portões de planejamento antes da implementação

- [x] Pesquisa do `@analyst`: consulta de inscritos na Twitch, escopos, limites (ver [`research.md`](research.md); números da referência oficial ainda não verificados, a serem rechecados pelo `@analyst`/`@architect` antes do gate de fronteira e de novo antes do desenvolvimento).
- [x] Validação do `@po`: GO (≥ 7/10) na story refinada.
- [x] Desenho do `@data-engineer`: migration, padrões, armazenamento de auditoria, snapshot e rollback.
  - Portão do data-engineer (2026-10-21): **GO** para o desenho; ver [data-model.md](data-model.md). Cinco colunas NOT NULL na fila com padrões que preservam o comportamento, nova tabela `refund_eligibility_decisions` (uma linha por resgate, gravada antes da chave inalterada `financial:{redemption_id}` do outbox; `unknown` não cria linha no outbox). Questões abertas Q1–Q6 seguem para o `@architect`. Nenhuma migration criada.
- [x] Fronteira do `@architect`: divisão de domínio entre regra, consulta de status e outbox; decisão de tier mínimo no MVP; abordagem de lotes; tratamento de resgates não elegíveis.
  - Gate do architect (2026-10-21): **GO**; veja [architecture.md](architecture.md). Avaliador puro + porta de status de assinante (adapter da Twitch, fakes) + worker assíncrono de verificação de elegibilidade (nenhuma chamada à Twitch dentro de transação de banco); tier mínimo fora do MVP; padrão `keep_unfulfilled` confirmado; consultas em lotes de ≤ 100 (verificado), atualização de resgates por tarefa no MVP (agrupar ≤ 50 configurável depois); complexidade COMPLEX (16/25), três fatias; ajustes D1–D3 no modelo de dados. Decisão do proprietário OD-1 resolvida em 2026-10-21 (decisão 7: as opções de público são aditivas; moderador ou VIP que também é inscrito é elegível), então a fatia 2 deixa de estar bloqueada.
- [x] Plano e revisão do `@ux-design-expert`: score ≥ 9,0/10 para o escopo revisado, registrado nesta story.
  - Portão de UX (2026-10-21): **9,1/10, APROVADO, apenas revisão estática de código/texto**; ver [ux-plan.md](ux-plan.md). Não coberto: visual, navegador real, tecnologia assistiva, pesquisa com pessoas usuárias, rótulos do painel da Twitch. Decisões pedidas ao proprietário: OD-UX-1 (expor “Só inscritos”/“Ninguém” no painel só com a fatia 3), OD-UX-2 (unificar “devolver os pontos” nos textos existentes e no chat), OD-UX-3 (motivo obrigatório em toda ação manual, inclusive em lote).
- [x] Plano de testes do `@qa`: PostgreSQL isolado, fakes na fronteira Twitch, separação de evidências.
  - Portão de QA (2026-10-21): **CONCERNS** (plano aprovado; qualidade do plano 9,0/10, só o plano, nada executado); ver [test-plan.md](test-plan.md). Rastreabilidade dos 17 CAs, testes 1–32 do data-model mapeados, avaliador por tabela + propriedades, testes de adapter/worker/corrida com fakes e ≥ 2 conexões reais, entrada/saída por fatia com Red primeiro, guarda de regressão do padrão `everyone`, checklist manual de TA, Twitch real como bloqueio documentado. Ressalvas: decisões de dependência (fast-check, axe, fake HTTP), retry interno de 429 do Twurple vs `lookupTimeoutMs`, flags do `migrate diff` no Prisma 6.19.3, ator streamer vs moderador (A2).
- [x] `@devops` reescreve o corpo principal da issue #76 com o escopo refinado (sem comentários em issues, regra do proprietário). Feito em 2026-10-21: corpo reescrito, título e labels inalterados.

## Dependências e riscos

- **Depende de:** término da migração da OPS-15; outbox FND-3 e ciclo FND-9 (comportamento estável); escopo opcional `channel:read:subscriptions` (e, se oferecidos, os escopos de moderador/VIP).
- **Lacuna de novo consentimento:** streamers já conectados precisam reautorizar; até lá “somente subs” resulta em `unknown`, o que exige UX clara.
- **Mudança de comportamento nos caminhos forçados:** limpeza, exclusão e remoção em espera deixam de devolver incondicionalmente; textos que prometiam contagem de devoluções precisam mudar.
- **Limites de taxa e latência:** uma consulta Helix extra antes de cancelar; limites e latência não verificados (pesquisa) e devem ser validados com a documentação e fakes.
- **O status reflete o momento da decisão**, não o do resgate; indícios por badge (`founder` x `subscriber`) não têm qualidade de auditoria.
- **Perda de afiliação:** resgates UNFULFILLED existentes não podem ser atualizados; o tratamento de falhas do outbox já cobre isso.
- **Privacidade:** nenhuma identidade de quem presenteou, token ou UID em logs; texto de motivo limitado e fora dos logs.
- **Não verificado na pesquisa:** máximo de `user_id` do endpoint de assinaturas, ausência de indicador Prime, valor do orçamento de taxa e latência real.

## Segurança de testes e dados

Testes primeiro (Red). Somente PostgreSQL descartável; preserve qualquer banco de desenvolvimento ativo. Sem bump de versão, push ou release sem autorização explícita do proprietário.
