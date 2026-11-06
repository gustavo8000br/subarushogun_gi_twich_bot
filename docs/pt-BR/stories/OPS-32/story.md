# OPS-32 — Calendário de ciclos da fila: reinício automático por jogo, presets por jogo e a guia "Filas antigas"

[English](../../../stories/OPS-32/story.md)

**Status:** Rascunho (redigida pelo `@sm` em 2026-11-06). Ainda não validada: o `@po` valida a seguir; a issue **#117** foi criada pelo `@devops` em 2026-11-06 antes do GO (Pronta ainda exige o GO do `@po`). **Issue:** [#117](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/117) (texto em [issue-body-changes-2026-11-06c](../../process/issue-body-changes-2026-11-06c.md)). **Escopo da 0.4.0-beta:** **candidata**; o dono decide se entra na 0.4.0-beta ou depois (pergunta pendente no texto da issue).

**Fonte:** decisões do dono de 2026-11-06 e a nota de pesquisa do `@analyst` [2026-11-06-queue-calendar](../../research/2026-11-06-queue-calendar/README.md) (autoavaliação 8,9/10; as páginas oficiais dos jogos não puderam ser lidas, por isso **cada linha do catálogo exige a confirmação do dono na contagem regressiva do jogo** antes de entrar; seções citadas abaixo como "nota §N").
**Relacionadas:** OPS-31 (#115, devolução por grupo e avisos de chat; **esta story depende dela**), OPS-22 (recuperação financeira; a outbox e a leitura de verificação são reaproveitadas), OPS-23 (SSE), OPS-20 (substituída pela OPS-31), a [nota de devolução por grupo](../../research/2026-11-06-queue-group-refund/README.md).
**Itens registrados:** **ST-25** do inventário (esta story) e fatias **FT-79..FT-85**. Veja [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (agendador, idempotência, modelo de arquivamento), `$aiox-data-engineer` (esquema, expurgo de 7 dias), `$aiox-ux-design-expert` (plano e revisão, mínimo 9,0, antes do `@dev`), `$aiox-analyst` (feito: a nota; pesquisa nova só para LACUNA), `$aiox-devops` (issue), `$aiox-qa` independente (plano de testes, execução em canal real, veredito).

## Problema

- Os jogos que as pessoas streamers jogam reiniciam os modos de fim de jogo em um calendário (mensal ou por versão). Hoje o streamer precisa lembrar do momento, fechar a fila à mão, decidir o que acontece com quem ainda esperava e criar do zero as filas e as recompensas de cada jogo.
- Os pontos de resgates que ficam pendentes ficam retidos na Twitch; quando uma fila é zerada, o streamer precisa de tempo para decidir (também quando está offline no reinício), pessoa por pessoa ou em lote, se os pontos voltam.

## História

Como streamer,
quero escolher meu jogo e ver a fila reiniciar sozinha na hora do reset do jogo, com filas e recompensas sugeridas para esse jogo e a fila antiga guardada por 7 dias,
para não precisar vigiar o relógio e ainda poder devolver os pontos de quem ficou esperando.

## Decisões do dono tomadas como dadas (2026-11-06)

- **(a) Calendário de ciclos:** a fila **reinicia sozinha** na hora do reset para **jogos conhecidos**; o **streamer escolhe o jogo** (e o servidor/região).
- **(b) Presets:** ao escolher o jogo, o produto **sugere criar as filas e as recompensas** (os presets são **editáveis**; nada é criado até o streamer confirmar).
- **(c) Guia "Filas antigas" com retenção de 7 dias:** a fila reiniciada vai para lá; o streamer, mesmo offline no reset, decide depois, por pessoa ou em lote, se os pontos voltam.
- **(d) O que ocorre com resgates ainda pendentes depois dos 7 dias** é a **política padrão que o streamer define nas Configurações** (vale também quando o reinício ocorreu com o streamer offline). Valores possíveis: devolver, manter pendente, cumprir. Recomendação do `@analyst`: devolver no dia 7 com aviso nos dias 5 a 6; "manter" e "cumprir" como alternativas explícitas. **Valores finais: ponto para o `@po`/`@architect`** (veja "Pontos para o `@po` e o `@architect`").

## Escopo

**Dentro (fatias, na ordem sugerida da seção Dependências):**

- **FT-79 (a)** catálogo versionado de jogos, modos e ciclos, com a confirmação do dono por linha.
- **FT-80 (b)** seleção de jogo e servidor e a **sugestão de filas e recompensas** (presets editáveis).
- **FT-81 (c)** reinício automático e o estado **"calendário vencido"**.
- **FT-82 (d)** guia "Filas antigas" e a retenção de 7 dias.
- **FT-83 (e)** política padrão nas Configurações e o aviso antes do fim da retenção.
- **FT-84 (f)** cancelamentos em lote no fim da retenção.
- **FT-85 (g)** testes reais no canal de testes.

**Fora de escopo:** ciclos definidos pelo streamer (o dono não pediu; **pergunta futura**: as pessoas streamers precisam de ciclos próprios, para jogos fora do catálogo?); reinício automático para jogo fora do catálogo (existe o jogo "personalizado", sem presets e sem reinício automático); logos, arte ou qualquer recurso visual dos jogos; cadastro persistente de espectadores; parecer jurídico sobre marcas (só observações gerais, nota §9); release, tag, bump.

## Critérios de aceite

As classes de evidência ficam separadas: unitário, integração em PostgreSQL isolado com relógio injetado, Twurple falso, canal real. Todo comportamento começa com um teste que falha.

### Grupo A — catálogo versionado (FT-79)

1. **Dado** o catálogo, **então** ele é um arquivo versionado no repositório, com esquema (`game` com nomes em en/es/pt-BR, `server` com deslocamento UTC fixo em minutos, `mode`, `cycles[]` com `starts_at_utc`, `ends_at_utc`, `source_url`, `verified_at`, `confidence`), revisado em PR; um arquivo inválido reprova o teste de esquema (nota §3).
2. **Dada** uma linha, **então** os instantes são guardados em UTC e a lógica usa deslocamentos fixos (sem regra de horário de verão); zonas IANA servem só para **mostrar** o horário na zona do streamer com `Intl`, e a exibição é legível por tecnologia assistiva.
3. **Dada** uma linha de ciclo, **então** ela só serve a um reinício automático quando a confirmação do dono na contagem regressiva do jogo está registrada (`verified_at` e a referência da confirmação); linha não confirmada é sinalizada e nunca usada para reiniciar (nota §7 item 2).
4. **Dadas** as duas regras estáveis do Genshin (Abismo Espiral no dia 16, Teatro Imaginário no dia 1, às 04:00 do horário do servidor), **então** uma regra mensal opcional pode gerar linhas, mas cada linha gerada ainda precisa de `verified_at` ou de data de validade.
5. **Dado** o catálogo, **então** o painel mostra "calendário verificado em ..." com a versão dele, e um alarme de CI dispara quando a última linha confirmada está a menos de 14 dias à frente (os 14 dias e os 45 dias do CA 12 são parâmetros para o `@architect`).
6. **Dados** os nomes de jogos e modos, **então** só texto simples é usado (sem logos nem arte) e há um aviso claro de "sem afiliação com as publicadoras".

### Grupo B — seleção e presets (FT-80)

7. **Dadas** as configurações de uma fila, **quando** o streamer escolhe um jogo e um servidor (região) do catálogo, **então** só o servidor do streamer decide o ciclo; **dado** um jogo fora do catálogo, **então** ele pode ser digitado como "personalizado": sem presets e sem reinício automático.
8. **Dado** um jogo conhecido escolhido, **então** o painel mostra uma **prévia** das filas e recompensas sugeridas (nomes em pt-BR, en e es; ordem; custo e tempo de recarga tomados dos padrões que o streamer já tem, nunca desta story); as opcionais vêm desligadas; todo campo é editável.
9. **Dada** a prévia, **então** **nada é criado** (nenhuma fila e nenhuma chamada à API da Twitch) até o streamer confirmar; ao confirmar, a criação usa os fluxos existentes de fila e recompensa; se parte falhar, o painel diz exatamente o que foi criado e o que não foi; nada é criado em silêncio.
10. **Dados** os nomes dos presets, **então** eles ficam marcados como propostas até o dono confirmar os nomes oficiais em pt-BR e es no cliente de cada jogo; **dado** o texto da interface, **então** ele não afirma mecânicas do jogo (nota §4, ressalva do cooperativo).

### Grupo C — reinício automático e "calendário vencido" (FT-81)

11. **Dada** uma fila ligada a um jogo e modo conhecidos e uma linha futura confirmada, **quando** o ciclo termina (relógio injetado nos testes), **então** a fila ativa é fechada e arquivada de forma atômica (entradas, posições, estado, ids de resgate, estado de devolução), uma nova fila ativa começa com a mesma configuração (recompensa e ajustes da OPS-31), e o trabalho é idempotente por `(fila, ciclo)`.
12. **Dado** que não há linha futura confirmada, ou `confidence` abaixo de média, ou `verified_at` mais velho que o limite (45 dias, parâmetro), **então** o produto **recusa o reinício automático**, o painel mostra **"calendário vencido"** (com a data do catálogo) e a fila continua rodando; o produto nunca reinicia por palpite.
13. **Dado** um reinício perdido porque o serviço estava parado, **então** ele roda quando o serviço volta e é registrado como atrasado; **dado** o streamer offline no fim do ciclo, **então** o reinício ainda roda (chamadas remotas precisam só de token válido; teste real T2).
14. **Dadas** as entradas no reinício, **então** as que ainda esperam **não** são devolvidas nem cumpridas pelo reinício: vão com a fila para "Filas antigas" (decisões c e d do dono; a nota §5 sugeria aplicar a política padrão no reset, e esta story a aplica só no fim da retenção); entradas em atendimento não são tocadas (OPS-31: devolução só ao terminar o atendimento); [pergunta de desenho para o `@architect`: onde a entrada em atendimento é concluída].
15. **Dado** o reinício, **então** o streamer pode ligar um aviso no chat e um aviso no painel ("fila reiniciada para o novo ciclo"), usando os avisos da OPS-31 e a fila de envio limitada dela; nenhum texto leva identificador de usuário.

### Grupo D — guia "Filas antigas" e retenção (FT-82)

16. **Dadas** filas arquivadas, **então** a guia "Filas antigas" as lista somente leitura com contagens por estado, o total de pendentes e "faltam N dias"; por pessoa e em lote o streamer pode devolver, cumprir (com confirmação) ou manter.
17. **Dada** uma decisão ali, **então** ela é persistida antes da chamada à Twitch e usa a outbox da OPS-22 com uma intenção terminal por resgate (CA 18 da OPS-31); um segundo cancelamento (404) resolve como já feito.
18. **Dada** a exclusão de uma recompensa ou fila, **então** ela continua bloqueada enquanto uma fila arquivada ainda tiver resgates pendentes (excluir uma recompensa com resgates pendentes faz a Twitch marcá-los como cumpridos sem devolução; o bloqueio existente se estende às filas arquivadas).
19. **Dado** o dia 7 depois do arquivamento e a resolução dos itens pendentes, **então** os ids de usuário da Twitch são expurgados e só restam contagens agregadas; **dados** os ids guardados na retenção, **então** são dado pessoal: o texto de privacidade diz isso e os logs levam só contagens e códigos de motivo (sem id de usuário, login, chat nem corpo de resgate).

### Grupo E — política padrão nas Configurações e avisos (FT-83)

20. **Dadas** as Configurações, **então** o streamer define a **política padrão** para resgates ainda pendentes no dia 7 com os valores devolver, manter pendente, cumprir; o padrão recomendado é **devolver**; **cumprir** é irreversível e exige adesão explícita com texto de confirmação (resgate cumprido nunca pode ser devolvido). [Valores finais: ponto para o `@po`/`@architect`.]
21. **Dado** um reinício com o streamer offline, **então** a mesma política padrão vale no fim da retenção se o streamer não tiver decidido antes.
22. **Dada** uma fila arquivada com resgates pendentes, **então** o streamer é avisado nos dias 5 a 6 (faixa no painel e, se ligado, aviso no chat ou no overlay) e de novo 24 horas antes do fim, e cada aviso diz o que acontecerá com a política atual.
23. **Dado** que a política muda enquanto uma fila está arquivada, **então** a regra (cópia no arquivamento ou leitura no dia 7) é definida pelo `@architect` e mostrada no painel.

### Grupo F — cancelamentos em lote no fim da retenção (FT-84)

24. **Dado** o fim da retenção, **então** um trabalho aplica a política aos itens pendentes em blocos de até 50 ids por chamada e um `reward_id` por chamada, com espera crescente em 429 respeitando `Ratelimit-Reset`; uma fila com milhares de entradas são algumas dezenas de chamadas.
25. **Dados** token inválido, queda ou resposta ausente, **então** o item fica na outbox em estado seguro e o painel o mostra; resposta ausente nunca é confirmação; o trabalho é idempotente e retoma após a parada, com progresso parcial visível.
26. **Dado** o valor "cumprir" sem a adesão do CA 20, **então** ele nunca roda.

### Grupo G — testes reais (FT-85)

27. **Dado** o canal de testes exclusivo SubaruShogun, **então** o `@qa` executa as quatro verificações da lista abaixo com veredito, registrado por classe; nenhum resultado de plataforma fora do que foi executado é afirmado. As verificações que coincidem com a OPS-31 (expiração de resgate `UNFULFILLED`, limites restaurados) rodam uma vez só.

### Transversais

28. **Dados** logs e erros, **então** não aparece id de usuário, login, token, cabeçalho, corpo de chat nem de resgate; falhas inesperadas devolvem o texto genérico localizado com `referenceId`.
29. **Dada** a documentação, **então** guia, textos do painel, texto de privacidade e docs existem em português e inglês; testes de localização e de contrato de documentação passam.
30. **Dados** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` estão verdes.

## Dependências

- **Antes do `@dev`:** nota do `@analyst` (feita); pareceres do `@architect`, do `@data-engineer` e do `@ux-design-expert` (nota mínima 9,0); GO do `@po` e a issue; **OPS-31** (#115): avisos de chat (FT-71), o modelo de decisão e de devolução (FT-74..FT-76) e as intenções da outbox são reaproveitados; esta story só começa depois que o desenho da OPS-31 fechar.
- **Ordem sugerida:** FT-79 (catálogo, com a confirmação linha a linha do dono) -> FT-80 (seleção e presets) -> **FT-82** (arquivo e "Filas antigas": o reinício precisa de um lugar para mandar a fila) -> FT-81 (reinício e "calendário vencido") -> FT-83 (política e avisos) -> FT-84 (lote no fim) -> FT-85 (testes reais, depois de cada grupo). FT-79 e FT-80 podem ser planejadas em paralelo pelo `@ux-design-expert` e pelo `@architect`.
- **Ação do dono:** confirmar cada linha do catálogo na contagem regressiva do jogo (Genshin: Manual do Aventureiro/tela do Abismo Espiral; Honkai: Star Rail: telas de Memória/Endgame; Zenless Zone Zero: Compêndio; Wuthering Waves: Guia > Atividades diárias e a tela da Torre). Ordem sugerida dos jogos: Genshin Impact primeiro, depois Honkai: Star Rail, Zenless Zone Zero e Wuthering Waves. [AUTO-DECISION: lista e ordem iniciais seguem a nota §7 item 1 → Genshin primeiro (motivo: único jogo com regras mensais estáveis).]

## Riscos

1. **O catálogo envelhece a cada versão do jogo** (cerca de 6 semanas). Mitigação: CA 3, 5, 12 (recusar o reinício, "calendário vencido"); manutenção por versão (o `@analyst` pesquisa, o `@dev` edita o arquivo, o `@qa` roda o teste de esquema).
2. **Hora de reset errada** (ZZZ 04:00 ou 05:00; hora do Honkai: Star Rail não confirmada). Mitigação: o dono confirma na contagem regressiva do jogo.
3. **Confusão de fuso e de servidor.** Mitigação: deslocamentos UTC fixos na lógica, `Intl` só para exibir (CA 2); o servidor do streamer decide.
4. **Pontos retidos por até 7 dias** mais o tempo de aviso, e a **expiração de um resgate `UNFULFILLED`**, que é desconhecida: só um teste real fecha (T1). Mitigação: avisos (CA 22), política padrão (CA 20).
5. **Cancelamentos em lote no dia 7 e o limite de taxa da Helix.** Mitigação: CA 24 e 25 (blocos de 50, espera crescente, 404 como feito).
6. **Ids de usuário da Twitch guardados por até 7 dias são dado pessoal** (GDPR/LGPD, observação geral). Mitigação: expurgo (CA 19), texto de privacidade, logs sem UID.
7. **Nomes de jogos e modos são marcas das publicadoras.** Mitigação: só texto simples, aviso de "sem afiliação", jogos personalizados sem presets (CA 6, 7); não é parecer jurídico.
8. **Cumprir no dia 7 é irreversível.** Mitigação: adesão explícita com confirmação (CA 20).

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 4, integração 3, infraestrutura 3 (agendador), conhecimento 3, risco 4 = **17 → COMPLEXA** (6 fases mais ciclo de revisão). Dificuldade **GG**, prioridade **P2**.

## Pontos para o `@po` e o `@architect`

1. **Valores finais da política padrão** (devolver, manter pendente, cumprir; se "cumprir" é oferecido; o padrão recomendado é devolver com aviso nos dias 5 a 6).
2. Local do agendador (worker com trava consultiva do PostgreSQL ou temporizador no processo), chave de idempotência por `(fila, ciclo)`, comportamento na parada e como a fila arquivada se liga à outbox (nota §8).
3. Modelo de arquivo e o trabalho de expurgo (arquivo lógico ou cópia), índice em `(queue_id, cycle_id)`, retenção dos ids de usuário da Twitch, migração das filas existentes (`@data-engineer`).
4. Cópia da política no arquivamento ou leitura no dia 7 (CA 23) e o significado de "manter" (a entrada sai do produto e o resgate continua `UNFULFILLED` na Twitch; os ids são expurgados).
5. Onde é concluída uma entrada que está em atendimento no reinício (CA 14).
6. Parâmetros das proteções: confiança mínima (média), validade (45 dias), alarme de CI (14 dias).
7. Quais entradas continuam "pendentes" depois da OPS-31: resgates normais são cumpridos ao iniciar o atendimento, então os pendentes são as entradas que esperam e as de grupo especial em atendimento ou sem resolução.

## Plano de testes

1. **Unitário e Twurple falso:** esquema e regras do catálogo; proteções (recusar o reinício, "calendário vencido"); política por valor; cancelamento duplo com a classe real do Twurple; blocos e espera em 429.
2. **PostgreSQL isolado com migrations reais e relógio injetado:** arquivamento atômico e nova fila, idempotência por `(fila, ciclo)`, reinício atrasado após parada, expurgo no dia 7, restrição de uma intenção terminal.
3. **Painel:** testes de componente e scripts de navegador para o seletor de jogo, a prévia, a guia "Filas antigas" e os avisos; evidência visual separada da revisão estática.
4. **Canal real (canal de testes SubaruShogun):** o `@qa` cria filas e recompensas; o Orion faz as ações de resgate no Chrome; o `@qa` registra o veredito.
5. **Gates:** os sete gates do projeto; veredito do `@qa` antes do commit do `@devops`.

### O que só um teste real fecha (nota §6)

1. **T1:** se a Twitch expira ou devolve sozinha um resgate `UNFULFILLED`.
2. **T2:** se `Update Redemption Status` funciona com o broadcaster offline.
3. **T3:** se um cancelamento restaura os limites por usuário e por transmissão ou o tempo de recarga para o novo ciclo.
4. **T4:** se os resgates pendentes de uma fila arquivada aparecem na fila de pedidos de recompensa da Twitch misturados com os itens do novo ciclo.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] `@devops` cria a issue no GitHub.
- [ ] Desenho do `@architect`.
- [ ] Parecer de esquema do `@data-engineer`.
- [ ] Plano e revisão do `@ux-design-expert`, nota mínima 9,0.
- [ ] Plano de testes do `@qa`.
- [ ] O dono confirma cada linha do catálogo (antes de a FT-81 rodar de verdade).

## Definição de Pronto

- Os CAs 1 a 30 têm evidência registrada por classe; os quatro itens de teste real estão fechados ou registrados como pendentes.
- Quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e português.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-06)

1. Objetivo e contexto: claros (reinício e montagem manuais por jogo; pontos de quem ficou esperando). PASSA.
2. Orientação técnica: desenho a partir da nota; pontos abertos atribuídos a especialistas. PASSA.
3. Referências: seções da nota, OPS-31, OPS-22. PASSA.
4. Autocontenção: escopo, fora de escopo, decisões do dono (a a d) e o desvio em relação à nota §5 declarados. PASSA.
5. Testes: unitário, PostgreSQL com relógio injetado, canal real, quatro itens em aberto. PASSA.
6. Análise estática: `npm run review:static` nos gates. PASSA.
- Resultado: pronta para o `@po`. Perguntas ao dono: entra na 0.4.0-beta ou depois (pendente no texto da issue); ciclos próprios (futuro); confirmação de cada linha do catálogo (ação do dono). Prioridade e ordem são propostas.

## File List

- `docs/stories/OPS-32/story.md` (novo)
- `docs/pt-BR/stories/OPS-32/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada do índice)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` e pares pt-BR (ST-25, FT-79..FT-85; ST-24 alinhada)
- `docs/process/issue-body-changes-2026-11-06c.md` e par pt-BR (texto da issue)
- `docs/session-handoff.md` e par pt-BR (bloco de estado)

Os arquivos de implementação serão listados aqui pelo `@dev` depois dos gates.

## Change Log

- 2026-11-06 — `@sm` (River): story redigida a partir das decisões do dono e da nota do `@analyst`. Status Rascunho. Fatias FT-79..FT-85 registradas. [AUTO-DECISION] ID do item no inventário → ST-25 (motivo: próximo ID de story livre); todas as prioridades P2, ordem 9.0 no quadro (depois da OPS-31). [AUTO-DECISION] o reinício não aplica a política padrão; só arquiva (motivo: as decisões c e d do dono põem a decisão em "Filas antigas" e a política no fim da retenção; isso ajusta a nota §5). OPS-32 registrada como candidata à 0.4.0-beta (decisão pendente).
