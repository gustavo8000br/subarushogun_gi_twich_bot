# FND-8 — Internacionalização de todo o produto

[English](../../../stories/FND-8/story.md)

**Status:** Fundação de locale/catálogos, persistência PostgreSQL, raízes/respostas de chat, textos gerados pelo OBS e localização dos scripts POSIX estão implementados. O executor Windows PowerShell tem somente cobertura estática. Localização restante do painel/API, validação nativa Windows e QA independente final mantêm a story em andamento. Reavaliação QA da spec v3: CONCERNS, sem nova nota.
**Complexidade:** COMPLEX (22/25).
**Issue GitHub:** [#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)

## História

Como streamer, quero selecionar o idioma do produto durante a instalação e alterá-lo depois no painel, para que o painel, o bot de chat, os widgets do OBS e as ferramentas locais de operação usem um idioma consistente.

## Decisões de planejamento aprovadas

- Idiomas iniciais: português brasileiro (`pt-BR`), inglês (`en`) e espanhol (`es`); `pt-BR` é o padrão seguro.
- O idioma selecionado na instalação inicializa o locale de toda a instalação. O streamer pode alterá-lo no painel, com persistência.
- Os recursos da comunidade são separados em um arquivo de catálogo por módulo do produto e idioma. Novos locales canônicos completos são descobertos pelos arquivos, sem cadastro em uma lista JavaScript.
- As raízes globais dos comandos são `!fila` (`pt-BR`), `!queue` (`en`) e `!cola` (`es`). Não manter alias legado. Reservar as três raízes contra slugs de fila em todos os idiomas.
- IDs internos estáveis de comandos, campos do contrato da API, identificadores de banco e logs técnicos continuam neutros quanto a idioma/em inglês.
- As ferramentas locais usam os nomes genéricos aprovados `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update` e `subarushogun_twich_bot_uninstall`; entrypoints específicos podem variar por plataforma.
- Colisões existentes de chaves de fila com `fila`, `queue` ou `cola` bloqueiam somente a raiz conflitante até renomeação explícita no painel; renomeação automática é proibida.
- Superfícies-alvo: painel e assistente/callback; sintaxe, ajuda e respostas dos comandos de chat; editor de widget OBS e rótulos/fallbacks gerados pelo produto; ferramentas de iniciar/instalar, atualizar e desinstalar.
- A implementação continua local-first e em JavaScript ESM vanilla, sem serviço de tradução em runtime, framework de frontend, TypeScript ou bundler.
- PostgreSQL é a autoridade escolhida para o locale; `.local/product-locale.state` é uma projeção local legível pelo host, atômica, com revisão monotônica e fallback para o último valor válido offline. A arquitetura ainda requer testes de contrato.
- Catálogos compartilhados usam TSV UTF-8 sem BOM, texto literal e placeholders allowlistados. Um decoder ESM compartilhado já rejeita BOM/UTF-8 inválido em testes Node; ainda faltam testes de paridade para browser ESM, shell POSIX e PowerShell.

## Políticas aprovadas pelo proprietário

- Textos escritos pelo streamer permanecem exatamente como inseridos ao mudar locale; localizar somente texto próprio do produto.
- A convenção genérica das ferramentas é `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update` e `subarushogun_twich_bot_uninstall`; entrypoints variam por plataforma.
- Colisões existentes de slug/alias com `fila`, `queue` ou `cola` bloqueiam somente a raiz conflitante até renomeação explícita no painel; nunca renomear automaticamente.


## Critérios de aceitação para implementação

1. A escolha de idioma na primeira execução inicializa um único locale persistente; reinício/atualização o preserva, e uma configuração protegida do painel permite alterá-lo sem reiniciar o bot.
2. `pt-BR`, `en` e `es` têm catálogos de primeira parte completos para cada módulo suportado. Valores ausentes ou desconhecidos usam fallback `pt-BR`, sem exibir chaves cruas, enums, erros de provider ou detalhes técnicos.
3. Catálogos são organizados por módulo e idioma, com template de contribuição, idioma-fonte, processo de revisão e validação automatizada de schema, paridade de chaves e placeholders, pluralização, IDs de locale inválidos e marcação insegura.
4. Textos gerados pelo produto nas superfícies listadas seguem o locale persistido. A política aprovada preserva o conteúdo escrito pelo streamer sem tradução/reescrita automática.
5. O chat usa as raízes globais por idioma acima, traduz subcomandos/ajuda/respostas incluídos e não aceita as raízes de outros idiomas como alias. Slugs/aliases de fila e permissões vinculam-se a IDs estáveis de comando, não a rótulos traduzidos.
6. Respostas da API expõem códigos públicos estáveis de estado/erro e somente dados de apresentação allowlistados; mensagens do frontend mapeiam os códigos a entradas locais de catálogo. Mensagens cruas do backend/provider e segredos nunca chegam ao painel ou chat.
7. Painel e OBS renderizam texto com segurança; interpolação não injeta HTML, código executável ou sintaxe de comando. Respostas de chat continuam respeitando o limite existente de 500 caracteres.
8. Plurais, datas, horários e números usam as APIs ECMAScript `Intl` compatíveis; a formatação recebe locale explícito e não altera timestamps UTC persistidos.
9. Ferramentas locais de instalar/atualizar/desinstalar usam o idioma escolhido, detectam dependências de host, oferecem caminhos suportados de instalação/ajuda, preservam o fluxo de imagem `main` padrão e mantêm a escolha explícita entre preservar ou apagar dados.
10. TDD cobre carregamento/fallback de catálogos, persistência/troca de locale, as três raízes e aliases, scripts, segurança de XSS/placeholders, paridade módulo/chaves e ausência de vazamento de detalhes internos. Garantias de persistência usam migrations reais e PostgreSQL.
11. Requisitos, stories, instruções de contribuição, changelogs e evidências de validação em inglês e pt-BR permanecem equivalentes.

## Artefatos do Spec Pipeline

- Requisitos: `spec/requirements.json`
- Pesquisa: `spec/research.json`
- Complexidade: `spec/complexity.json`
- Especificação: `spec/spec.md`
- Crítica: `spec/critique.json`
- Plano de implementação: `spec/plan.json`

## Progresso TDD

### Incremento 1 — Status de elegibilidade Twitch localizado

- **Comportamento:** `twitchStatusLabel` aceita locale para o estado inelegível; inglês e espanhol mostram seus rótulos localizados, enquanto pt-BR continua sendo o padrão/fallback.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — falharam 2 asserções porque os dois locales solicitados retornaram `Afiliado ou Parceiro necessário`.
- **Green:** mesmo comando — passou, 9/9 testes após adicionar os dois rótulos e o parâmetro opcional de locale.
- **Refactor:** não foi necessária mudança estrutural adicional neste incremento pequeno; a suíte focada passou após a implementação.
- **Escopo:** comportamento somente do helper. O locale salvo da instalação ainda não está ligado ao painel e o catálogo completo de status fica para incrementos futuros.


### Incremento 2 — Mapa completo de status Twitch por locale

- **Comportamento:** localizar todos os status conhecidos de integração/configuração Twitch para `en` e `es`; preservar pt-BR como padrão e o fallback para status desconhecido.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — falharam 15 asserções porque os demais status ainda eram exibidos em pt-BR.
- **Green:** mesmo comando — passou, 27/27 testes após adicionar os rótulos em inglês e espanhol.
- **Refactor:** manteve a seleção do estado separada da apresentação e agrupou rótulos por locale; a suíte focada passou novamente.
- **Escopo:** somente rótulos de status. Parágrafos explicativos do assistente e locale persistido da instalação ainda não estão conectados.

### Incremento 3 — Orientações de elegibilidade Twitch

- **Comportamento:** localizar em inglês e espanhol as explicações de canal inelegível e API de pontos indisponível; locale desconhecido/padrão continua em pt-BR.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — falharam 4 casos porque a função ignorava o locale e devolvia pt-BR.
- **Green:** mesmo comando — passou, 31/31 testes com mensagens localizadas por motivo.
- **Refactor:** mantidos os códigos de motivo internos separados dos textos exibidos; a suíte focada passou após a alteração.
- **Escopo:** duas orientações do assistente apenas; demais mensagens e integração do locale persistido continuam pendentes.

### Incremento 4 — Resumo de canal elegível

- **Comportamento:** localizar o resumo de canal elegível, disponibilidade de Channel Points, contagem de recompensas e aviso de proximidade do limite para inglês e espanhol, preservando a saída/fallback pt-BR.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 2 asserções falharam porque o resumo de canal elegível ignorava o locale solicitado e continuava em português.
- **Green:** mesmo comando — passou, 33/33 testes após adicionar os rótulos localizados.
- **Refactor:** consolidou a seleção de locale e interpolação do resumo em um único mapa, mantendo pt-BR como fallback; a suíte focada passou novamente.
- **Escopo:** o helper agora localiza os resumos de status/elegibilidade do assistente quando recebe um locale explícito. O locale persistido ainda não está conectado ao painel.

### Incremento 5 — Orientação durante configuração incompleta

- **Comportamento:** localizar as mensagens de conectado/verificando, aplicativo validado e conectar canal para `en` e `es`; manter pt-BR e fallback de locale desconhecido.
- **Red:** `npm exec vitest run tests/unit/setup-messages.test.js` — 6 asserções falharam porque esses estados incompletos retornavam pt-BR para qualquer locale.
- **Green:** mesmo comando — passou, 39/39 testes após adicionar as mensagens localizadas.
- **Refactor:** reuniu as três mensagens de fallback no mesmo mapa de locales e resolveu locale desconhecido para pt-BR; a suíte focada passou novamente.
- **Escopo:** somente helpers das mensagens de configuração. Não se afirma locale salvo, escolha do usuário ou localização do painel inteiro.

### Incremento 6 — Fundação do parser de catálogo TSV literal

- **Comportamento:** analisar chaves pontuadas estáveis e valores literais não vazios de texto UTF-8 fornecido ao parser; aceitar LF/CRLF e rejeitar BOM, chaves duplicadas/inválidas, linhas malformadas, valores vazios, tabs extras e caracteres de controle.
- **Red:** `npm exec vitest run tests/unit/localization-catalog.test.js` — a suíte não conseguiu importar `apps/shared/localization/tsv-catalog.mjs` porque o módulo/comportamento ainda não existia.
- **Green:** mesmo comando — passou, 9/9 casos contratuais após implementar o parser.
- **Refactor:** isolou o parsing em módulo ESM compartilhado sem dependências, retornando registro congelado sem protótipo; decodificação dos bytes permanece explicitamente a cargo do chamador. A suíte focada passou novamente.
- **Escopo:** contrato do parser Node/Vitest apenas. Decodificação de bytes UTF-8, integração browser, paridade/placeholders, equivalência shell/PowerShell e carregamento de catálogos nos fluxos do produto continuam não implementados.

### Incremento 7 — Busca segura e interpolação de catálogo

- **Comportamento:** resolver locale solicitado, usar pt-BR para locale não suportado ou chave ausente, mostrar mensagem segura localizada em vez de expor uma chave e interpolar somente placeholders escalares declarados como texto literal.
- **Red:** `npm exec -- vitest run tests/unit/localization-translation.test.js` — a importação falhou porque o módulo/comportamento de resolução de tradução ainda não existia.
- **Green:** mesmo comando — passou, 7/7 testes de seleção/fallback de locale, chaves ausentes, valores literais e rejeição de valores/objetos não allowlistados.
- **Refactor:** centralizou a seleção da mensagem localizada indisponível e manteve o resolvedor ESM compartilhado sem dependências; a suíte focada passou novamente.
- **Escopo:** somente busca ESM pura e compartilhada. Chamadores precisam renderizar o resultado como texto; catálogos ainda não são carregados no browser nem conectados ao estado do produto.

### Incremento 8 — Decodificação estrita de bytes UTF-8

- **Comportamento:** decodificar bytes de catálogo como UTF-8 sem alterar textos localizados; rejeitar BOM UTF-8 inicial, sequências de bytes malformadas e entrada que não seja bytes.
- **Red:** `npm exec vitest run tests/unit/localization-decoding.test.js` — a suíte não conseguiu importar `apps/shared/localization/decode-catalog-bytes.mjs` porque o módulo/comportamento ainda não existia.
- **Green:** o mesmo comando passou 4/4 após adicionar um decoder compartilhado com `TextDecoder` em modo fatal e verificação explícita de BOM.
- **Refactor:** `npm exec vitest run tests/unit/localization-decoding.test.js tests/unit/localization-catalog.test.js tests/unit/localization-translation.test.js` passou 20/20, confirmando composição com os contratos do parser e tradutor.
- **Escopo:** Node/Vitest verifica bytes com acentos pt-BR, rejeição de BOM, UTF-8 malformado sem caractere de substituição e tipo do argumento. Carregamento no browser, paridade shell/PowerShell e conexão dos catálogos ao produto continuam pendentes.

### Incremento 9 — Decodificar e analisar bytes de catálogo em um único contrato

- **Comportamento:** oferecer uma entrada compartilhada que decodifica bytes UTF-8 estritamente e valida o TSV em seguida, para que chamadores não pulem nem invertam essas etapas.
- **Red:** `npm exec vitest run tests/unit/localization-byte-catalog.test.js` — a importação falhou porque `apps/shared/localization/parse-catalog-bytes.mjs` e o comportamento não existiam.
- **Green:** a suíte focada passou 3/3 após compor o decoder estrito com `parseTsvCatalog`.
- **Refactor:** `npm exec vitest run tests/unit/localization-byte-catalog.test.js tests/unit/localization-decoding.test.js tests/unit/localization-catalog.test.js tests/unit/localization-translation.test.js` passou 23/23; ESLint passou nos módulos compartilhados e nos dois novos testes.
- **Escopo:** composição validada somente em Node/Vitest. Carregamento de recursos pelo browser, paridade/placeholders de módulos, scripts de host e locale persistido continuam pendentes.

### Incremento 10 — Validação e tradução de locales descobertos

- **Comportamento:** manter `pt-BR`, `en` e `es` obrigatórios e aceitar IDs canônicos adicionais vindos dos catálogos; validar paridade exata de chaves e placeholders declarados entre todos os locales descobertos; a tradução usa qualquer locale disponível, sem lista fixa no código.
- **Red:** `npm exec vitest run tests/unit/localization-parity.test.js tests/unit/localization-translation.test.js` — 3 testes falharam: o catálogo completo `de` foi rejeitado, o tradutor retornou pt-BR em vez do texto alemão fornecido e um ID inválido não foi identificado antes do erro de locale obrigatório ausente.
- **Green:** o mesmo comando passou 16/16 após validar IDs canônicos, exigir os locales iniciais permitindo novas adições completas e selecionar no tradutor qualquer catálogo próprio disponível.
- **Refactor:** as suítes combinadas de catálogo/decoder/tradução/paridade passaram 32/32; ESLint passou nos módulos compartilhados e testes focados.
- **Escopo:** catálogos dinâmicos são aceitos quando fornecidos ao validador/tradutor. Varredura de arquivos em disco, exposição ao painel somente de locales completos e integração com setup/chat/widgets/ferramentas ainda estão pendentes.

### Incremento 11 — Descoberta de arquivos de tradução por módulo

- **Comportamento:** varrer o diretório de catálogos do módulo por arquivos `*.tsv` com locale canônico, exigir catálogos válidos para `pt-BR`, `en` e `es`, e expor locale adicional somente se o arquivo for válido e cumprir o contrato de chaves/placeholders. Rejeitar nomes inseguros de módulo e não retornar caminhos locais nem textos de tradução nos metadados de rejeição.
- **Red:** `npm exec vitest run tests/integration/localization-catalog-discovery.test.js` — a importação falhou porque o módulo de descoberta no filesystem não existia.
- **Green/Refactor:** a primeira implementação expôs um catálogo `de` incompleto porque a validação de paridade ignorava locales opcionais; o teste de integração detectou isso. Após validar todos os locales descobertos, `npm exec vitest run tests/integration/localization-catalog-discovery.test.js tests/unit/localization-parity.test.js tests/unit/localization-byte-catalog.test.js` passou 15/15; ESLint focado passou.
- **Escopo:** fixtures reais em diretório temporário comprovam que um novo arquivo de locale completo é encontrado sem cadastro no código e catálogos incompletos são excluídos por módulo. Completude global entre módulos, exposição ao browser/painel e descoberta pelas ferramentas host continuam pendentes.

### Incremento 12 — Servir catálogos descobertos dinamicamente ao painel local

- **Comportamento:** expor somente catálogos completos dos módulos em uma rota protegida pela sessão local; verificar novamente os arquivos a cada requisição para interpretar um novo locale comunitário completo sem reiniciar o processo. Desabilitar cache e retornar erro genérico seguro quando catálogos obrigatórios forem inválidos.
- **Red:** `npm exec vitest run tests/integration/localization-catalog-route.test.js` — a suíte não conseguiu importar `localization-routes.mjs` porque a rota e o comportamento não existiam.
- **Green:** a suíte focada passou 3/3, cobrindo bloqueio sem sessão, projeção segura dos catálogos, descoberta ao vivo de novos arquivos `de` em todos os módulos e erro sanitizado para catálogos inválidos.
- **Refactor:** `npm exec vitest run tests/integration/localization-catalog-route.test.js tests/integration/localization-catalog-bundle.test.js tests/integration/localization-catalog-discovery.test.js tests/unit/localization-parity.test.js tests/unit/localization-byte-catalog.test.js` passou 21/21; `npm run typecheck` e `npm run lint` passaram. A rota foi registrada na composição Fastify de produção.
- **Escopo:** arquivos são descobertos dinamicamente e servidos a clientes autenticados da API local. Atualização/renderização no browser, locale persistido, outras superfícies e equivalência das ferramentas de host continuam pendentes.

### Incremento 13 — Validar catálogos de tradução pela CLI

- **Comportamento:** oferecer `npm run validate:localization [-- <catalog-root>]` para validar a árvore de catálogos e imprimir somente estado válido, nomes dos módulos e locales disponíveis; falhas retornam código 1 sem imprimir textos traduzidos nem caminhos locais.
- **Red:** `npm exec vitest run tests/integration/localization-validator-cli.test.js` — os dois testes de contrato CLI falharam porque `apps/infra/scripts/validate-localization.mjs` não existia; o processo filho retornou `MODULE_NOT_FOUND` em vez do contrato esperado.
- **Green:** a suíte focada passou 2/2 após adicionar o validador executável e o script do pacote. Os catálogos padrão do repositório retornaram cobertura válida de `setup` para `en`, `es` e `pt-BR`.
- **Refactor:** o validador resolve caminhos opcionais de forma portável e emite somente um resumo estável; as suítes combinadas de catálogo passaram 44/44, seguidas por `npm run validate:localization`, `npm run typecheck` e `npm run lint`, todos aprovados.
- **Escopo:** validação CLI e resumo seguro estão disponíveis. Modelo/documentação de contribuição, consumo pelo browser, locale persistido, paridade entre plataformas host e localização ampliada do produto seguem pendentes.

### Incremento 14 — Montar arquivos de tradução para descoberta comunitária ao vivo

- **Comportamento:** montar o diretório de catálogos do projeto no contêiner do bot como somente leitura, para que um locale validado adicionado no host seja reconhecido sem reconstruir a imagem ou reiniciar o processo.
- **Red:** `npm exec vitest run tests/integration/compose-contract.test.js -t 'mounts product translation catalogs'` — o Compose não tinha a montagem necessária dos catálogos do host para o contêiner.
- **Green/Refactor:** após adicionar a montagem somente leitura ao serviço `bot` e normalizar o caminho da origem no assert, `npm exec -- vitest run tests/integration/compose-contract.test.js tests/integration/localization-catalog-route.test.js` passou 14/14; `npm run validate:localization`, typecheck, lint e `git diff --check` passaram.
- **Escopo:** Compose expõe os catálogos do repositório ao runtime. O contêiner só lê as alterações do host; instruções comunitárias e aceite nativo em Windows/macOS seguem pendentes.

### Incremento 15 — Persistir e auditar o locale da instalação no PostgreSQL

- **Comportamento:** definir `pt-BR` revisão 1 como padrão de uma instalação nova; persistir mudanças para IDs canônicos de locale na tabela `settings` existente, com controle otimista de revisão e registro de auditoria `product.locale_changed`.
- **Red:** `npm exec -- vitest run tests/integration/queue-repository.test.js -t 'installation locale|invalid locale identifiers|concurrent locale changes'` — os três casos PostgreSQL reais falharam porque o repositório não oferecia leitura nem escrita do locale.
- **Green/Refactor:** após implementar lock advisory transacional e checagem de revisão, dois asserts inicialmente contaram auditorias históricas de outros testes; isolar a consulta por ator gerado corrigiu o fixture. O mesmo comando passou 3/3 (70 ignorados). O teste usou o contêiner PostgreSQL isolado da suíte e migrations reais; não foi necessária migration de schema porque `settings` já armazena valores JSON.
- **Escopo:** persistência, concorrência e auditoria do repositório são verificadas no PostgreSQL. Rotas de seleção do locale e projeção host offline não pertenciam a este incremento.

### Incremento 16 — Selecionar locale no painel protegido e usar texto de configuração descoberto

- **Comportamento:** expor locale e revisão em `/api/state` protegido; aceitar alteração de locale protegida por CSRF e idempotência somente se existir um catálogo completo; popular seletor de configurações com catálogos dinâmicos; atualizar catálogos enquanto o painel está aberto; usar locale salvo nos rótulos e explicações de configuração Twitch.
- **Red:** testes de rota receberam 404 para alteração de locale, a projeção de estado não tinha `product_locale`, o browser não tinha seletor de idioma e as mensagens de configuração ignoravam catálogos comunitários fornecidos.
- **Green/Refactor:** `npm exec -- vitest run tests/unit/web-route.test.js tests/unit/setup-messages.test.js tests/integration/localization-catalog-route.test.js tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js` passou 161/161; `npm run validate:localization` passou para setup em `en`, `es` e `pt-BR`. Correções de JSDoc e narrowing do body fizeram `npm run typecheck`, `npm run lint` e `git diff --check` passarem.
- **Escopo:** o locale salvo sobrevive a reinícios e o painel descobre locales novos em atualização de 30 segundos; por enquanto, somente o texto de configuração Twitch usa catálogos. O restante do painel, chat, OBS, ferramentas instaladoras e projeção host offline continuam pendentes.

### Incremento 17 — Preservar uma escolha de locale não salva durante atualização do catálogo

- **Comportamento:** a atualização em segundo plano deve preservar uma escolha válida ainda não salva enquanto o operador decide confirmá-la; caso contrário, mostrar o locale persistido ou recorrer temporariamente a `pt-BR` quando o catálogo salvo estiver ausente.
- **Red:** `npm exec -- vitest run tests/unit/locale-picker-state.test.js` — a importação falhou porque o comportamento de resolução da seleção ainda não existia.
- **Green/Refactor:** o teste focado passou 3/3 após adicionar um helper puro de seleção e usá-lo no seletor. O browser continua lendo os catálogos a cada 30 segundos e renderizando os textos com segurança.
- **Verificação de regressão:** `npm test` passou em 79 arquivos / 566 testes; `git diff --check` passou. `npm run validate:localization`, `npm run typecheck` e `npm run lint` também passaram na validação focada deste incremento.
- **Escopo:** somente preservação da seleção; isso não declara a localização completa do painel.

### Incremento 18 — Projeção atômica do locale para o host e acesso no Compose

- **Comportamento:** espelhar o locale do produto, cuja autoridade é o PostgreSQL, em um arquivo legível pelo host e atualizado atomicamente; manter uma cópia válida anterior, rejeitar locale/revisão inválidos e permitir que o bot sem root acesse o diretório montado.
- **Red:** `npm exec vitest run tests/integration/product-locale-projection.test.js` não conseguiu importar o módulo de projeção porque ele ainda não existia. Os contratos Compose também mostraram a ausência da montagem `.local`/grupo; a asserção de permissões do bootstrap mostrou que o diretório de exportação não era gravável pelo grupo.
- **Green/Refactor:** a integração da projeção passou 3/3 com estados válido, inválido e fallback; as verificações focadas de Compose/bootstrap passaram após incluir montagem gravável, associação ao grupo e permissões setgid. `npm run validate:localization`, `npm run typecheck`, `npm run lint` e `git diff --check` passaram na execução focada associada.
- **Escopo:** comportamento da projeção host em Linux e contratos de permissões do Compose estão cobertos. Comportamento nativo em Windows/macOS continua pendente de validação por plataforma.

### Incremento 19 — Localizar ferramentas shell de ciclo de vida pelo catálogo salvo

- **Comportamento:** updater e desinstalador POSIX leem o locale selecionado em `.local/product-locale.state`, exibem os textos do catálogo com fallback seguro, usam a palavra de confirmação localizada e preservam dados por padrão.
- **Red:** `npm exec vitest run tests/unit/host-lifecycle-localization.test.js` falhou 2/2: instalação em inglês ainda mostrava em português o aviso de branch inválida e as mensagens do desinstalador.
- **Green/Refactor:** o mesmo teste passou 2/2 após conectar a consulta compartilhada do host; testes combinados de ciclo de vida/inicialização/manutenção passaram 10/10, e `sh -n` passou nos scripts POSIX e helper. Entrypoints Windows agora usam um executor PowerShell, mas PowerShell não está instalado neste ambiente Linux e ainda não observamos execução nativa no Windows.
- **Escopo:** localização POSIX foi validada por comportamento. O executor Windows tem apenas cobertura estática; não deve ser considerado validado em runtime.

### Incremento 20 — Mapear falhas do painel para mensagens seguras localizadas

- **Comportamento:** o painel mapeia códigos estáveis conhecidos da API para mensagens do catálogo e usa texto genérico localizado para falhas desconhecidas/de rede; nunca renderiza mensagens do backend, inclusive detalhes de Twitch/provedor.
- **Red:** `npm exec vitest run tests/unit/web-application-setup.test.js -t 'renders a localized safe error'` falhou na asserção porque o formulário de credenciais exibiu literalmente `provider body contains token=secret`.
- **Green/Refactor:** `npm exec vitest run tests/unit/web-application-setup.test.js tests/unit/panel-error-presentation.test.js` passou 4/4 depois de injetar o apresentador de erros baseado no catálogo e usá-lo nos catches do painel. `npm run lint` e `npm run typecheck` passaram.
- **Escopo:** mensagens do backend não chegam aos avisos/toasts pelo helper de requisição do app ou pelo formulário do aplicativo Twitch. A localização de textos de validação em todas as ações dinâmicas do painel continua no trabalho maior da interface.

## Gates de implementação pendentes

- QA independente avaliou a spec v1 como CONCERNS, 8,1/10. A reavaliação da spec v3 retornou CONCERNS sem atribuir nova nota; os achados editoriais corrigidos devem entrar na próxima revisão independente.
- Os contratos da ponte do locale do host e do catálogo TSV foram escolhidos; sua validação runtime segue em implementação test-first. O QA autorizou iniciar incrementos técnicos isolados.
- Registrar evidências TDD de cada incremento e continuar a implementação dos contratos independentes.

## Checklist incremental

- [x] TDD dos status e orientações do assistente Twitch.
- [x] TDD do parsing TSV literal, decodificação estrita de UTF-8, composição bytes→catálogo, busca/interpolação segura e validação de locale adicional/paridade de chaves/placeholders.
- [x] Descobrir arquivos de locale por módulo e excluir adições inválidas; testar com fixtures reais de filesystem temporário.
- [x] Agregar catálogos, expor somente locales completos do produto por API protegida e descobrir novos arquivos sem reiniciar o servidor.
- [x] Disponibilizar validador CLI de catálogos com saída segura e resultado de falha não zero.
- [x] Conectar catálogos descobertos ao seletor de idioma e ao texto de configuração Twitch; persistir locale no PostgreSQL e expô-lo pela projeção de estado protegida.
- [x] Criar projeção host offline atômica; adicionar suporte de locale ao chat, OBS e ferramentas de ciclo de vida; testar políticas aprovadas de colisão/texto autoral nas partes implementadas.
- [ ] Localizar todas as telas e mensagens dinâmicas restantes do painel; ampliar a apresentação localizada de erros por código além do conflito de locale atualmente mapeado; comprovar equivalência do browser e execução PowerShell nativa.
- [ ] Finalizar docs de contribuição bilíngues, gates, aceite nativo por plataforma e QA independente.

## Arquivos alterados neste recorte

- Runtime: montagem de catálogos no Compose; `apps/api/src/http/localization-routes.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/server.mjs`, `apps/api/src/web-route.mjs`; catálogos de configuração e seletor em `apps/web/`; módulos de localização compartilhados para browser/servidor.
- Testes: parser/descoberta/CLI/API de catálogos, persistência e concorrência PostgreSQL reais, projeção protegida e rotas, módulos/seletor web e mensagens de configuração.
- Evidências/spec/docs: esta story e seu par em inglês, artefatos Spec Pipeline da FND-8, planejamento OPS-5, índices bilíngues de stories e changelogs internos.

## Limites do planejamento

A implementação continua em andamento: persistência de locale, descoberta de catálogos, textos principais de chat/OBS e localização POSIX estão implementados; cobertura completa do painel/API, validação nativa Windows e QA independente final seguem pendentes. Esta PR atualiza a MINOR alpha para `0.6.0`, mas não promove o estágio, cria release nem tag. A primeira MINOR beta pretendida da FND-8 continua `v1.1.0-HHHHHHH-beta`; promoção é decisão do proprietário.

## Registro de alterações

| Data | Versão | Alteração | Agente |
| --- | --- | --- | --- |
| 2026-10-06 | 0.6.0 | Implementa fundação do locale e localização suportada de chat/OBS/host; cobertura do painel e QA por plataforma continuam pendentes | @aiox-master |
| 2026-10-06 | 0.5.2 | Spec v3 registra contratos técnicos e decisões aprovadas; implementação TDD P0 iniciou; gates restantes e QA final pendentes | @aiox-master |
