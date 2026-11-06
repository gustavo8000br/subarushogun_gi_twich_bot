# Nota de pesquisa: calendário da fila (ciclos dos jogos), presets por jogo e a guia "Filas antigas"

[English](../../../research/2026-11-06-queue-calendar/README.md)

- Autor: `@analyst` (Atlas). Consulta: 05/11/2026. Pesquisa de mesa; não substitui teste no ambiente do projeto.
- Rótulos: **VERIFIED** (fonte oficial ou código do repositório), **PARTIAL** (fonte secundária, consistente), **UNVERIFIED** (conflitante ou inferido), **TEST** (só um teste real fecha).
- Índice consultado antes (`docs/research-index.md`): nenhuma linha cobria ciclos de jogos. A linha #27 já diz que a expiração de resgates `UNFULFILLED` é UNVERIFIED; esta nota fez mais uma busca em 05/11/2026 e não achou nada (seção 6).

## 1. Resumo executivo

1. **Dois tipos de ciclo.** (a) *Regras de calendário* estáveis e calculáveis: Abismo Espiral do Genshin no dia 16 e Teatro Imaginário no dia 1 de cada mês, sempre no reset diário das 04:00 do servidor da pessoa jogadora. (b) *Ciclos por versão*, que se deslocam com patches: Ataque Estígio (Stygian Onslaught) do Genshin e os modos de Honkai: Star Rail, Zenless Zone Zero e Wuthering Waves. Estes não saem de uma regra; precisam de linhas com data.
2. **Modelo recomendado: catálogo versionado de linhas de ciclo com data, mais regras mensais opcionais.** Os deslocamentos dos servidores são **offsets UTC fixos** (América UTC-5, Europa UTC+1, Ásia e TW/HK/MO UTC+8), então a lógica do jogo não precisa de horário de verão. O horário de verão só importa ao *exibir* a hora no fuso do streamer (use `Intl`/IANA apenas para exibição).
3. **Envelhecimento do catálogo é o maior risco.** Ciclos por versão duram cerca de 6 semanas (Genshin 7.2 sai em 04/11/2026; HSR 4.6 saiu em 28/09/2026). O produto deve recusar o reinício automático quando o catálogo não tem uma linha futura confirmada e avisar o streamer (nunca reiniciar "por palpite").
4. **A confiança é média para a tabela da seção 2.** As páginas oficiais da HoYoverse (hoyolab, genshin.hoyoverse.com, wiki) são renderizadas por JavaScript e não devolveram texto à ferramenta de leitura; o Fandom respondeu HTTP 402. A tabela se apoia em sites de guias e em trechos de busca de páginas oficiais; cada linha diz isso. Por isso o desenho manda o dono confirmar cada linha na **contagem regressiva dentro do jogo** antes de ela entrar no catálogo.
5. **Retenção (7 dias):** guardar as entradas arquivadas e os resgates pendentes no produto; a política padrão para o que continuar pendente é escolhida nas Configurações. Padrão recomendado: **devolver no dia 7, após aviso no dia 5-6**, com "manter" e "cumprir" como alternativas explícitas. O volume de devoluções não é problema de rate limit (50 ids por chamada). As incógnitas reais são itens de **TEST** (seção 6).

## 2. Tabela de ciclos (consulta em 05/11/2026)

Fatos comuns de servidor (PARTIAL): reset diário às 04:00 do servidor no Genshin; servidores América UTC-5 (09:00 UTC), Europa UTC+1 (03:00 UTC), Ásia UTC+8 (20:00 UTC do dia anterior), TW/HK/MO também UTC+8 mas servidor separado. Os guias dizem que os offsets não seguem horário de verão (os "5h" para espectadores dos EUA são efeito de exibição); um guia afirma que o reset passou para 5h, então isto continua PARTIAL.

| Jogo / modo | Ciclo | Momento do reset | Estável ou por patch | Fonte (tipo) | Confiança |
|---|---|---|---|---|---|
| Genshin: Abismo Espiral (andares 9-12; 1-8 permanentes) | Mensal, **dia 16** (ex.: 16/09 a 16/10/2026; próximo 16/11/2026 pelo padrão) | 04:00 do servidor | Regra estável desde que o Teatro Imaginário foi criado (antes era dias 1 e 16; guias antigos ainda dizem isso) | HoYoWiki e página de ciclo da HoYoLAB 2026/09/16-10/16, e "nova temporada em 16 de outubro" nas notas da 7.1, como trechos de busca (oficiais, não lidos por inteiro); Sportskeeda, bittopup (secundárias) | Média-alta |
| Genshin: Teatro Imaginário | Mensal, **dia 1** até 03:59 do dia 1 do mês seguinte (Temporada 29: 01/11/2026 04:00 a 01/12/2026 03:59) | 04:00 do servidor | Regra estável | gamemarket.gg (secundária); a timeline do GenshinBuilds mostra outras janelas (rótulo pouco claro) | Média |
| Genshin: Ataque Estígio (Stygian Onslaught) | Cerca de **42 dias**, alinhado às fases da versão (inícios vistos: 15/04, 27/05, 08/07, 19/08, 30/09/2026; próximo por volta de 11/11 por aritmética) | Listado por volta das 10:00 do servidor (provavelmente após a manutenção) | **Por patch** | Timeline do GenshinBuilds (secundária); o Timesaver diverge | Baixa-média |
| Honkai: Star Rail: Memória do Caos, Ficção Pura, Sombra Apocalíptica, Arbitragem de Anomalias | Cada um com ~**5-6 semanas**, deslocados dentro da versão. Versão 4.6: Arbitragem 28/09 (termina 11/11), Memória do Caos 28/09 e de novo 02/11, Sombra Apocalíptica 05/10, Ficção Pura 19/10 | No reset diário de cada servidor (a página não informa a hora; o HSR também usa reset de servidor às 04:00, UNVERIFIED aqui) | **Por patch** | allthings.how (secundária); a América começa um dia antes de Europa/Ásia na página | Média para as datas da 4.6, baixa para a hora |
| Zenless Zone Zero: Assalto Letal (Deadly Assault) | **2 semanas** (ex.: 16/01 a 30/01/2026) | Reset diário do servidor; fontes divergem entre 04:00 e 05:00 | Razoavelmente estável; mudança de versão pode deslocar | Game8, Gfinity, GameWith (secundárias) | Média (dias), baixa (hora) |
| Zenless Zone Zero: Defesa Shiyu (Nó Crítico) | Fontes divergem: **4 semanas** (antiga) ou **2 semanas** (cronograma da versão 2.5 no Game8) | Igual ao acima | Mudou no patch 2.5 | Game8 (secundária) | Baixa |
| Wuthering Waves: Torre da Adversidade (Zona de Perigo) | Cerca de **28 dias** (antes 14 dias, mudou na 2.1) | O horário do servidor tem base na China, UTC+8; reset diário 04:00; as conversões regionais variam entre guias | Por patch | Guia 3.7 do TOPUPLive (20/10/2026), Game8, iQOO (secundárias) | Baixa-média |
| Wuthering Waves: Ermos Lamuriosos (Whimpering Wastes) | Mensal | Igual | Por patch | Game8 (secundária) | Baixa |

O que é **estável**: Abismo Espiral do Genshin (dia 16) e Teatro (dia 1), ambos às 04:00 do servidor; a existência dos três offsets regionais. O que **muda por patch**: todo o resto, incluindo o dia em que um modo começa dentro da versão, a duração do ciclo da Defesa Shiyu e a diferença de um dia entre os lançamentos de NA e EU/Ásia.

Fonte oficial a citar em cada linha depois de confirmada: a contagem regressiva dentro do jogo (Genshin: Manual do Aventureiro/tela do Abismo Espiral; HSR: telas de Memória/Endgame; ZZZ: Compêndio; WuWa: Guia > Atividades Diárias e a tela da Torre), mais o aviso oficial de cada versão. Os nomes localizados dos modos são propostas (seção 4).

## 3. Modelo recomendado

**Catálogo = arquivo versionado no repositório (JSON/YAML com schema), não uma tabela de banco editada à mão.** Revisão em PR, validação no CI.

- `game` (id, nomes localizados en/es/pt-BR), `server` (id, offset UTC fixo em minutos, ex.: América -300, Europa +60, Ásia +480, TW-HK-MO +480), `mode` (id, nomes localizados), `cycles[]` com `starts_at_utc`, `ends_at_utc`, `source_url`, `verified_at`, `confidence`.
- Para os dois modos mensais do Genshin, uma **regra** opcional (`monthly`, dia, hora local 04:00, offset) pode *gerar* linhas para os próximos N meses, mas cada linha gerada ainda precisa de `verified_at` ou de validade.
- Guardar instantes em UTC; calcular com offsets fixos (aritmética simples, sem biblioteca). Zonas `IANA` (`Etc/GMT+5` tem o sinal invertido, evitar; `Asia/Shanghai` não tem horário de verão) só são necessárias para **exibir** a hora no fuso do streamer com `Intl.DateTimeFormat` (ECMA-402, já no projeto pela FND-8).
- **O streamer escolhe o jogo e o servidor (região).** Espectadores de outros servidores não mudam a fila; só o servidor do streamer define o ciclo.
- **Salvaguardas:** (1) reinício automático só para linha com `confidence >= média` e `verified_at` de no máximo 45 dias; (2) sem linha futura no catálogo, o painel mostra "calendário vencido" e a fila continua funcionando; (3) o job do agendador é idempotente por `(fila, ciclo)`; um reinício perdido (serviço fora do ar) roda na reinicialização e é registrado como atrasado; (4) a versão do catálogo aparece no painel ("calendário verificado em ...").
- **Manutenção:** uma atualização por versão de jogo (cerca de a cada 6 semanas). Sugestão: `@analyst` pesquisa, `@dev` edita o arquivo, `@qa` roda o teste de schema. Alarme no CI quando a última linha estiver a menos de 14 dias à frente.
- **Prática de outras ferramentas (PARTIAL):** rastreadores de eventos e calendários de fãs desses jogos (por exemplo a timeline do GenshinBuilds) publicam janelas com data por versão em vez de calculá-las, o que apoia o modelo de linhas com data. Não achei bot de fila da Twitch que reinicie por ciclo de jogo; trate a funcionalidade como nova (a ausência é UNVERIFIED).

## 4. Presets sugeridos (editáveis, criados só após confirmação)

Os rótulos localizados abaixo são **propostas**; confirme os nomes oficiais em pt-BR e es no cliente de cada jogo antes de publicar (UNVERIFIED).

| Jogo | Modo (en / es / pt-BR) | Ciclo | Fila sugerida | Recompensa sugerida |
|---|---|---|---|---|
| Genshin Impact | Imaginarium Theater / Teatro Imaginario / Teatro Imaginário | Mensal, dia 1 | "Teatro: partida em co-op" (1 vaga por vez) | "Entrar na fila do Teatro" |
| Genshin Impact | Spiral Abyss / Abismo Espiral / Abismo Espiral | Mensal, dia 16 | "Abismo: ajuda nos andares 9-12" | "Entrar na fila do Abismo" |
| Genshin Impact | Stygian Onslaught / (a confirmar) / (a confirmar) | ~6 semanas | opcional | opcional |
| Honkai: Star Rail | Memory of Chaos / Memoria del Caos / Memória do Caos; Pure Fiction / Ficción Pura / Ficção Pura; Apocalyptic Shadow / Sombra Apocalíptica / Sombra Apocalíptica | ~5-6 semanas | uma fila por modo, desligada por padrão | uma recompensa por fila |
| Zenless Zone Zero | Deadly Assault / (a confirmar) / (a confirmar); Shiyu Defense | 2 semanas | opcional | opcional |
| Wuthering Waves | Tower of Adversity / Torre de la Adversidad / Torre da Adversidade | ~28 dias | opcional | opcional |

Regras: o preset só *propõe* nomes, ordem e custo; o streamer edita tudo e confirma antes de qualquer fila ou recompensa ser criada (chamada à API da Twitch). Nunca criar recompensas em silêncio. Custo e tempo de espera padrão vêm dos padrões já existentes do streamer, não desta nota (sem invenção).

Ressalva sobre o co-op do Genshin, a confirmar com o dono: Teatro Imaginário e Abismo Espiral são, em grande parte, conteúdo solo; a fila serve para "ajuda", assistir ou papéis de co-op definidos pelo streamer. Não afirmar mecânicas do jogo no texto da interface.

## 5. Reinício e retenção (7 dias)

- **No reinício (fim do ciclo):** a fila ativa é fechada e arquivada de forma atômica (uma transação): entradas, posições, status, ids de resgate, estado de devolução. Uma nova fila ativa começa para o novo ciclo com a mesma configuração (recompensa, regras de devolução por grupo da OPS-31).
- **Interação com a OPS-31:** entradas ainda *em espera* no reinício seguem a mesma regra de um cancelar/pular decidido pelo streamer: o reinício aplica a **política padrão**, porque o streamer não está lá para decidir. Entradas *em atendimento* no reinício não são tocadas (OPS-31: devolução só ao terminar o atendimento).
- **Guia "Filas antigas" (7 dias):** lista somente leitura com contagem por status, quantidade de pendentes e ações por entrada (devolver, cumprir, manter). Contagem "faltam N dias". Aviso ao streamer no dia 5-6 (faixa no painel e, se ativado, aviso no chat ou overlay); segundo aviso 24 h antes.
- **Política padrão nas Configurações para pendentes no dia 7 (ordem recomendada):**
  1. **Devolver** (padrão): cancelar o resgate, os pontos voltam para a pessoa. Reversível do ponto de vista dela, sem prejuízo à confiança no streamer.
  2. **Manter**: deixar `UNFULFILLED` na Twitch e tirar a entrada do produto. Risco: pontos retidos por tempo indeterminado; a expiração é desconhecida (TEST).
  3. **Cumprir**: irreversível; consome os pontos sem atendimento. Só como opção explícita com confirmação, porque FULFILLED nunca pode ser devolvido (linha #27).
  A mesma política vale quando o reinício acontece com o streamer offline. As chamadas remotas precisam só de token válido (nenhuma fonte diz que a live precisa estar ativa; **TEST**); com token inválido, o item fica na outbox em estado seguro e o painel mostra.
- **Lote no dia 7:** `Update Redemption Status` aceita até 50 ids por chamada e um `reward_id` por chamada; a Helix usa token bucket (custo padrão de 1 ponto por requisição, 429 quando o balde acaba em um minuto, o cabeçalho `Ratelimit-Reset` diz quando tentar de novo). Uma fila com milhares de entradas são algumas dezenas de chamadas, então o limite não bloqueia na prática; ainda assim, rode em blocos com espera no 429 e trate 404 num segundo cancelamento como "já feito" (linha #27, seção de cancelamento duplo).
- **Não apagar recompensa com resgates pendentes:** a Twitch os marca FULFILLED sem devolução (linha #27). O bloqueio atual de exclusão de fila também deve cobrir filas arquivadas que ainda tenham itens pendentes.
- **Privacidade (observação geral, não é aconselhamento jurídico):** IDs de usuário da Twitch são pseudônimos, mas continuam sendo dado pessoal na LGPD/GDPR. Guardar só durante a janela de retenção, apagar ou reduzir a contagens agregadas depois do dia 7 e da liquidação dos pendentes, citar isso no texto de privacidade e manter os logs sem UID, texto de chat e corpo de resgate (regra do projeto). Conferir as cláusulas de retenção de dados do Developer Services Agreement da Twitch (página ilegível na rodada anterior, linha #27).

## 6. Riscos e itens que exigem teste real

| # | Item | Estado |
|---|---|---|
| T1 | Um resgate `UNFULFILLED` expira ou é devolvido sozinho? A referência oficial só diz "processo normal da fila de pedidos". Nova busca em 05/11/2026 (docs da Twitch, fórum, docs de terceiros) não achou nada; o único "30 dias" encontrado trata do encerramento dos Pontos de Canal pela Twitch, não de resgates | **TEST** |
| T2 | `Update Redemption Status` funciona com o broadcaster offline? | **TEST** |
| T3 | Cancelar restaura o limite por usuário e por transmissão ou o tempo de espera para o novo ciclo? | **TEST** (igual à linha #27) |
| T4 | Resgates pendentes de uma fila arquivada aparecem na fila de pedidos da Twitch misturados com os do novo ciclo (confusão no painel da Twitch)? | **TEST** |
| R1 | O catálogo envelhece: mitigado pelas salvaguardas da seção 3 | desenho |
| R2 | Hora de reset errada (ZZZ 04:00 ou 05:00; hora do HSR não confirmada) | o dono confirma pela contagem no jogo |
| R3 | Confusão de horário de verão na exibição | `Intl` só para exibir; offsets fixos na lógica |
| R4 | Pontos retidos por até 7 dias mais o tempo dos avisos | decisão do dono/UX (seção 7) |

## 7. O que depende do dono

1. **Lista inicial de jogos** (sugestão: Genshin primeiro, depois HSR, ZZZ, WuWa) e quais modos entram no catálogo.
2. Confirmar cada linha de ciclo na contagem regressiva dentro do jogo antes de entrar no catálogo (o `@analyst` não consegue abrir os jogos).
3. Política padrão no dia 7 (recomendado: devolver) e se "cumprir" será oferecido.
4. Se o produto pode reiniciar com o streamer offline (recomendado: sim, aplicando a política padrão).
5. Textos dos avisos e do aviso de privacidade.
6. Nomes dos presets em pt-BR/es após conferir os clientes dos jogos.

## 8. Perguntas abertas para outros agentes

- `@architect`: onde fica o agendador (worker com advisory lock do PostgreSQL ou temporizador em processo), chave de idempotência por `(fila, ciclo)`, comportamento em caso de indisponibilidade, como a fila arquivada se liga à outbox.
- `@data-engineer`: schema das filas arquivadas e job de limpeza dos 7 dias (arquivo lógico ou cópia), índice em `(queue_id, cycle_id)`, retenção dos ids de usuário da Twitch, migration das filas existentes.
- `@ux-design-expert`: guia "Filas antigas", contagem de expiração e aviso do dia 5-6, seletor de jogo com prévia do que será criado, estado "calendário vencido", texto do seletor de região, exibição acessível da hora no fuso do streamer.
- `@dev` (depois): teste de schema do catálogo e alarme no CI.

## 9. Direitos e marcas (observações gerais, não é aconselhamento jurídico)

- Nomes de jogos e modos pertencem às publicadoras (HoYoverse para Genshin, HSR e ZZZ; Kuro Games para Wuthering Waves). Citar o nome de um jogo numa ferramenta de terceiros para dizer a que ela serve é prática comum (uso nominativo), mas conferir: diretrizes de conteúdo de fãs ou de marca de cada publicadora, se os nomes aparecem em material de divulgação ou só no painel do streamer, nada de logos ou arte do jogo e um aviso claro de "sem afiliação". Não localizei as páginas de diretrizes atuais das publicadoras nesta rodada (UNVERIFIED).
- Usar apenas nomes em texto simples; deixar o streamer digitar qualquer outro jogo como "personalizado", sem presets.

## 10. Limitações

- As páginas oficiais dos jogos não puderam ser lidas (JavaScript ou HTTP 402); a tabela de ciclos depende de sites de guias e de trechos de busca de páginas oficiais.
- Várias datas são "futuras" em relação a guias mais antigos e só foram cruzadas entre fontes secundárias.
- Os nomes localizados dos modos são propostas.
- Nada foi testado em PostgreSQL, Twitch ou navegador.
- Autoavaliação: fontes 8,0 (oficiais ilegíveis), evidência 8,5, aderência ao caso 9,5, riscos 9,5, mensurabilidade 9,0 (confirmável pela contagem no jogo e por quatro itens TEST); **nota geral 8,9**. Fica abaixo da meta de 9,0 só pela lacuna de fontes oficiais; o desenho impede que essa lacuna cause um reinício automático errado (salvaguardas e confirmação do dono por linha).

## Fontes

- Rate limits da Helix: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Update Redemption Status da Twitch (via linha #27): https://dev.twitch.tv/docs/api/reference/#update-redemption-status
- Página de ciclo da HoYoLAB: https://www.hoyolab.com/article/46724671
- HoYoWiki Abismo Espiral: https://wiki.hoyolab.com/pc/genshin/entry/5669?lang=en-us
- Notas do Genshin 7.1: https://genshin.hoyoverse.com/en/news/detail/166383
- Datas da temporada do Teatro: https://gamemarket.gg/news/genshin-impact/how-to-clear-imaginarium-theater-in-genshin-impact-7-2
- Horários dos servidores do Genshin: https://www.rpgsite.net/feature/10336-genshin-impact-daily-reset-when-the-server-reset-time-is-in-your-region e https://progameguides.com/genshin-impact/did-the-server-reset-time-change-in-the-america-server-in-genshin-impact
- Timeline do Ataque Estígio: https://genshin-builds.com/timeline
- Datas de endgame do HSR 4.6: https://allthings.how/honkai-star-rail-4-6-endgame-mode-release-dates/
- ZZZ: https://game8.co/games/Zenless-Zone-Zero/archives/460247 e https://allthings.how/zenless-zone-zero-deadly-assault-reset-explained/
- WuWa: https://www.topuplive.com/news/wuthering-waves-3-7-tower-of-adversity-guide.html e https://dexerto.com/wuthering-waves/wuthering-waves-daily-and-weekly-reset-time-2743101
- Nota anterior: `docs/research/2026-11-06-queue-group-refund/README.md`
