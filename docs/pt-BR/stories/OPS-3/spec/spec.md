# Especificação: catálogo local de comandos e permissões por cargo

[English](../../../../stories/OPS-3/spec/spec.md)

> **Story:** OPS-3 (issue GitHub #17)
> **Complexidade:** COMPLEXA (18/25)
> **Data:** 2026-10-06
> **Status:** Aprovada para implementação após crítica; a persona de UX não foi ativada.

## 1. Visão geral

Adicionar ao painel local do streamer a página **Comandos**, com todos os comandos de chat, sintaxe, finalidade e política efetiva de cargos. Permitir editar listas explícitas nos comandos configuráveis e adicionar `!<fila> comandos` para mostrar os comandos que o emissor atual pode executar.

### Objetivos

- Exibir ao streamer toda a superfície de comandos.
- Usar uma única política persistida na ajuda e na autorização do backend.
- Preservar permissões iniciais, exceto `!conta <nome>` e `!conta reset`, exclusivos do streamer.
- Evitar efeitos colaterais e exposição de comandos protegidos em acessos negados.

### Fora de escopo

- Cargo de seguidor, escopos Twitch adicionais, cache externo de cargos ou sincronização de papéis.
- Redesign visual ou pesquisa UX; `$aiox-ux-design-expert` só poderá ser ativado após a implementação desta issue e o planejamento da FND-7.
- Novos comportamentos de fila além da descoberta de ajuda e uma resposta de status somente leitura.

## 2. Requisitos e aceite

| ID | Contrato |
| --- | --- |
| FR-1 | Catalogar todos os comandos globais e de fila implementados, com texto pt-BR, sintaxe, finalidade, escopo e regra fixa/configurável. |
| FR-2 | Persistir listas explícitas por comando e usar a mesma política efetiva na tela, ajuda e autorização. |
| FR-3 | Preservar o acesso inicial; VIP sempre depende do toggle `allowVipManagement`. |
| FR-4 | `!conta <nome>` e `!conta reset` são fixos para o streamer, rejeitando tentativas de ampliá-los. |
| FR-5 | `!<fila> comandos` mostra somente os comandos permitidos à identidade e aos badges atuais; streamer recebe orientação para consultar o painel. |
| FR-6 | Cargos: streamer, moderador, VIP, inscrito e todos. Listas usam OU explícito, sem herança; o toggle VIP é obrigatório. |
| FR-7 | Negações não consultam ou alteram entradas, leem conta ou chamam Twitch sem necessidade. |
| FR-8 | A ajuda segue cooldown e limite de 500 caracteres e responde em português conciso. |

### Critérios de aceite

1. Catálogo completo no painel, com conteúdo pt-BR e comandos streamer-only marcados como bloqueados.
2. Leitura de API protegida por sessão local; mutação usa CSRF, idempotência, versão e validação, recusando cargos/códigos inválidos e alterações a regras fixas.
3. Política persiste no PostgreSQL após reinício; tela, ajuda e autorização exibem/usam a mesma configuração.
4. Matriz padrão igual à atual, salvo as duas alterações de conta exclusivas do streamer.
5. Cargos usam identidade e badges do evento atual `channel.chat.message`; não se armazenam papéis antigos nem se herda privilégio da origem Shared Chat. VIP depende do toggle.
6. Ajuda `!<fila> comandos` só revela comandos disponíveis e tem resposta limitada; streamer é direcionado ao painel.
7. Testes provam ausência de lookup de fila/conta/Twitch, mutação ou efeito financeiro em ações negadas.
8. Comportamentos seguem Red → Green → Refactor, com integração PostgreSQL real e migrations.
9. Documentação e changelogs afetados ficam equivalentes em inglês e pt-BR; FND-7 e UX continuam adiados.

## 3. Abordagem técnica

- Manter um registro canônico de comandos com ID, sintaxe, descrição, escopo, defaults e regras imutáveis, compartilhado por parser, autorização e catálogo.
- Resolver permissões em função pura com registro, política persistida e conjunto confiável de cargos da mensagem atual.
- Persistir política no PostgreSQL e auditar a mudança na mesma transação. Política ausente usa padrão fixo; malformada falha de forma fechada.
- Usar rotas protegidas existentes, sessão local, CSRF, chave de operação e versão otimista.
- Renderizar página vanilla com projeções explícitas e `textContent`.
- `comandos` é somente descoberta; resolve a fila/política sem executar outra ação nem revelar comandos indisponíveis.
- `!queue comandos` lista globalmente a sintaxe permitida ao emissor atual, e `!<fila> comandos` continua mostrando somente a fila. O streamer é direcionado à página Comandos do painel.
- `!queue ping` é fixo para streamer/moderador, responde `Pong 🏓`, versão em execução e a última latência Twitch em cache; o handler não inicia chamadas Helix. O nome `queue` fica reservado como slug/alias.
- `todos` permite qualquer emissor. Moderador/VIP/inscrito exige badge confiável atual. Qualquer papel elegível marcado permite acesso. VIP também depende do toggle. Streamer é identificado pelo ID e regras fixas continuam restritas a ele.

## 4. Pesquisa Twitch

Documentação oficial consultada em 2026-10-06:

| Operação | Evento/endpoint | Escopo | Adaptação |
| --- | --- | --- | --- |
| Identificar emissor e cargos atuais | EventSub `channel.chat.message` v1 | Autorização atual `user:read:chat` | Adaptador Twurple já normaliza identidade, canal, canal de origem e badges; usar badges somente nesta decisão. |
| Conferir seguidores (fora desta story) | `GET /helix/channels/followers` | `moderator:read:followers` e token broadcaster/mod | Não incluído; nenhum escopo novo. |

Fontes: [EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [Chat Twitch](https://dev.twitch.tv/docs/chat/send-receive-messages/), [Referência Helix](https://dev.twitch.tv/docs/api/reference/).

## 5. Contratos de dados, API e interface

- Projeção de catálogo retorna apenas IDs conhecidos, descrições/sintaxes seguras, lista efetiva, indicador imutável e versão da política; não serializar entidades Prisma.
- Alteração aceita somente comandos configuráveis conhecidos, cargos `moderator`, `vip`, `subscriber`, `everyone` e versão esperada; o acesso do streamer não é uma permissão editável.
- Ajuda resolve apenas a chave da fila e política. Não procura entrada do viewer, conta atual nem usuário Twitch.
- Ajuda segue cooldown normal de viewer; deduplicação e cooldown existentes continuam valendo para os comandos atuais.

## 6. Estratégia de testes

1. Parser: `comandos`, caixa, espaços, acentos, quantidade de argumentos e sintaxe inválida.
2. Domínio: cargos, OU explícito, todos, toggle VIP, override streamer, comandos fixos, defaults e política malformada.
3. Handler: resposta por cargo, orientação ao painel, vazio/limite, nenhum efeito após negação e Shared Chat inválido.
4. Rotas: sessão/CSRF, validação, comando fixo, idempotência e versão conflitante.
5. PostgreSQL real com migrations: leitura padrão, alteração/auditoria transacional, reload e concorrência.
6. Painel: navegação, catálogo completo, rótulos, itens travados, `textContent` e atualização.
7. Suíte focada por incremento; gates finais de lint, typecheck, testes, OpenGrep, versão, Compose e paridade dos idiomas.

## 7. Riscos

- Padrão divergente pode ampliar/revogar acesso: testar a matriz atual e falhar de forma fechada.
- Catálogo separado pode divergir: registro único compartilhado.
- Badges sobrepostos: OU explícito; toggle VIP permanece obrigatório.
- Shared Chat: origem não concede permissão no canal-alvo.
- Ajuda longa: resposta única compacta até 500 caracteres.

## 8. Questões abertas

Nenhuma. Cargos, lista explícita, padrão, comandos fixos, exclusão de seguidores e a ordem FND-7/UX foram definidos pelo responsável pelo produto.
