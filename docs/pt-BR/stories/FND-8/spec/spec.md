# Especificação FND-8 — Internacionalização de todo o produto

[English](../../../../stories/FND-8/spec/spec.md)

**Story:** FND-8 / issue GitHub #18
**Status do planejamento:** baseline de planejamento da spec v3; a reavaliação independente retornou CONCERNS sem nova nota. As decisões do proprietário e correções editoriais estão registradas abaixo; a implementação TDD delimitada está em andamento. O acompanhamento independente de QA segue necessário para o aceite completo da story.
**Pesquisa consultada:** 2026-10-06.

## 1. Resultado do produto

Uma instalação local tem um único locale efetivo do produto. O instalador de primeira execução o seleciona; a seleção inicializa uma configuração persistida; o streamer pode alterá-la no painel. O locale controla textos escritos pelo produto no painel, no assistente/callback OAuth, na ajuda e respostas do bot de chat, nos textos de produto dos widgets OBS e nas ferramentas locais de iniciar/instalar/atualizar/desinstalar.

Idiomas iniciais: `pt-BR` (padrão/fonte), `en` e `es`. Outros idiomas da comunidade são recursos de contribuição e só ficam selecionáveis depois de passar validação e revisão dos catálogos.

## 2. Requisitos

- **FR-1 — Ciclo do locale:** selecionar idioma na primeira instalação, inicializá-lo somente se não houver configuração persistida, preservá-lo em reinícios/atualizações e alterá-lo por uma configuração protegida do painel.
- **FR-2 — Cobertura do produto:** localizar textos voltados ao usuário em configuração, callback, painel, chat, rótulos de produto do OBS e ferramentas locais de ciclo de vida. Preservar nomes, descrições, templates e textos fixos de widget escritos pelo streamer exatamente como foram inseridos; localizar somente textos próprios do produto. Decisão aprovada pelo proprietário em 2026-10-06.
- **FR-3 — Catálogos modulares:** manter um catálogo contribuível pela comunidade por módulo e idioma, no contrato de catálogo TSV UTF-8 descrito na arquitetura, consumível pelo browser ESM, Node ESM e ferramentas nativas sem novos pré-requisitos no host. A leitura cruzada ainda precisa de testes de contrato.
- **FR-4 — Idioma dos comandos:** IDs estáveis dirigem autorização e catálogo. O idioma selecionado fornece a única raiz global ativa (`fila`, `queue`, `cola`) e rótulos/ajuda de subcomandos traduzidos. Raízes de outros idiomas não são aceitas como aliases. Reservar as três raízes contra slugs/aliases de fila em todas as localidades. Colisões existentes devem ser detectadas; bloquear somente a raiz conflitante e exigir renomeação explícita pelo painel. Nunca renomear automaticamente. Decisão aprovada em 2026-10-06.
- **FR-5 — Limite seguro da API:** backend retorna códigos públicos allowlistados e estáveis de status/erro, nunca texto de exceção cru, payloads do SDK, enums técnicos ou segredos. A interface converte códigos públicos em mensagens localizadas. Adaptadores de chat não encaminham erros técnicos.
- **FR-6 — Fallback:** locale de instalação desconhecido e tradução comunitária opcional ausente usam `pt-BR`; nenhuma chave crua ou valor interno sem tradução aparece ao usuário. `pt-BR`, `en` e `es` só são publicados com catálogos obrigatórios completos.
- **FR-7 — Contribuição:** fornecer template módulo/idioma, idioma-fonte, convenção de nomes/placeholders/plurais, comando local de validação, expectativas de revisão e passos de teste sem serviço de tradução.
- **FR-8 — Ferramentas locais:** fornecer entrypoints e ações nativos por plataforma, internacionalizados, para install/start/update/uninstall. A convenção aprovada é `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update` e `subarushogun_twich_bot_uninstall`, com extensões/entrypoints específicos por plataforma. Detectar Docker/Compose; usar instalação suportada pela plataforma somente com aprovação explícita; caso contrário, exibir instruções manuais oficiais. Nunca executar script baixado sem revisão como root.
- **FR-9 — Desinstalação segura:** manter a escolha atual entre preservar e apagar dados. Remover dados/volumes deve ser explícito, explicar o efeito em histórico e credenciais e exigir confirmação digitada.
- **FR-10 — Formatação/segurança:** usar `Intl` com locale explícito para números/datas/plurais. Renderizar traduções como texto; placeholders não executam markup/código. Respostas continuam respeitando o limite de 500 caracteres do chat após expansão.
- **FR-11 — Testes/documentação:** TDD para cada comportamento; migrations reais/PostgreSQL para persistência do locale; matriz de locale/catálogo e testes de vazamento; story/documentação/changelogs bilíngues.

## 3. Arquitetura proposta

1. Persistir `product_locale` como configuração não secreta no PostgreSQL. Seleção validada do instalador é apenas uma semente de bootstrap; banco existente sempre prevalece em reinício/atualização. Alterações no painel exigem sessão local existente, CSRF, idempotência, validação de schema e regras transacionais/auditoria.
2. Projetar locale e revisão monotônica salvos para `.local/product-locale.state`, arquivo local limitado e não secreto montado para o bot. Mudança de locale grava configuração, auditoria e intenção durável de projeção na mesma transação PostgreSQL. Worker lê sempre o valor/revisão mais recentes, escreve arquivo temporário no mesmo diretório e substitui atomicamente o estado projetado. Operações fora de ordem não reduzem a revisão. Após commit e antes da projeção, app/painel usam o novo locale e informam que ferramentas locais podem ainda usar o anterior. Inicialização/retry recompõe a projeção a partir do banco. Sem PostgreSQL, ferramentas usam a última projeção válida; estado ausente/malformado cai para `pt-BR`. Esse estado stale offline é intencional e precisa ser informado. Variáveis de ambiente nunca sobrescrevem locale salvo.
3. Manter um TSV UTF-8 sem BOM por módulo e locale: chave pontuada estável, um TAB literal e valor traduzido literal por linha; aceitar LF e CRLF. Validador rejeita chaves vazias/duplicadas, linhas malformadas, tabs/quebras/controles em valores, UTF-8 inválido, placeholders desconhecidos e chaves desbalanceadas. Catálogo nunca é sourced, avaliado, tratado como HTML ou interpretado como shell. Placeholders são allowlist por chave e renderizados como texto; usar chaves separadas em vez de valores multilinha. Browser ESM, Node ESM, POSIX shell e PowerShell leem esse formato limitado sem runtime ou parser adicional pré-instalação.
4. Usar chaves modulares e códigos de máquina estáveis; manter um resolver de locale e helper de tradução estreito. Passar o locale efetivo explicitamente às projeções do painel/chat e ao texto de produto OBS. Usar `Intl` ECMAScript nativo para plural, número/data/hora no app; catálogos compartilhados contêm texto literal, não expressões executáveis de plural. Selecionar categorias plurais allowlistadas com `Intl.PluralRules`; textos de ferramentas do host evitam frases plurais dinâmicas. A arquitetura não seleciona i18next para esta stack sem bundler.
5. Separar IDs de comandos da apresentação traduzida. Autorização continua associada a IDs/políticas estáveis. Parser reconhece somente a raiz e subcomandos catalogados do locale ativo; slugs de fila continuam configuração ASCII do operador.
6. Scripts do host usam entrypoints nativos POSIX shell/PowerShell e leem a projeção `.local/product-locale.state` e os mesmos catálogos TSV módulo/locale. Os nomes genéricos aprovados são `subarushogun_twich_bot_setup`, `subarushogun_twich_bot_update` e `subarushogun_twich_bot_uninstall`; extensões e entrypoints variam por plataforma. Primeira instalação usa `pt-BR` quando não há escolha válida; ferramentas exibem prompts sem depender do app/banco.
7. Adicionar validação de catálogo no CI: locale/módulo válido, paridade das chaves de primeira parte, placeholders e chaves plurais do app, restrições de texto literal seguro e fallback de idioma comunitário.

## 4. Contrato de erro e fallback

- Exemplos estáveis: `channel_ineligible`, `reconnect_required`, `reward_sync_pending` e `invalid_command`; são identificadores, nunca textos exibidos diretamente.
- Código público desconhecido mapeia para mensagem localizada genérica, com orientação segura quando possível.
- Módulo/chave ausente usa fallback `pt-BR`; strings de primeira parte ausentes falham no CI, não são aceitas em runtime.
- Mensagem interna de exceção, stack, resposta de provider, access/refresh tokens, client secret, código OAuth, URL do banco e credenciais são proibidos em interpolação de catálogo, resposta API, chat, console do navegador e logs.

## 5. Compatibilidade e migração

- Bancos existentes sem `product_locale` iniciam pela semente válida do instalador ou `pt-BR`; nenhuma fila/reward/entrada/histórico é regravado. O banco é autoridade após inicialização e o arquivo local é projeção recuperável. Chaves existentes não serão renomeadas automaticamente. Se houver colisão com raiz reservada, bloquear somente a raiz conflitante até renomeação explícita pelo painel; nunca renomear automaticamente. O comportamento ainda exige teste de upgrade.
- O comando global atual `!queue` passa a `!fila` no pt-BR quando o contrato de comandos localizados for ativado; não haverá alias legado por decisão explícita do proprietário. Slugs/aliases existentes permanecem, exceto as três raízes globais, sempre reservadas.
- Durante o planejamento o produto continua na linha alpha atual. O proprietário pretende que a FND-8 concluída seja a primeira MINOR beta `v1.1.0-HHHHHHH-beta`; esta spec não promove versão ou release.
- Conteúdo escrito pelo operador não é traduzido nem sobrescrito. Por decisão do proprietário, preservar exatamente o texto autoral e localizar apenas o conteúdo do produto. Migração/atualização não renomeia filas nem aliases já configurados.

## 6. Matriz de aceite e testes

| Dado | Quando | Então |
| --- | --- | --- |
| Instalação nova | Instalador escolhe `en` | Primeira inicialização usa texto em inglês e persiste `en` como locale. |
| Instalação existente sem chave de locale | Aplicação inicia após atualização | Nenhum dado é perdido; locale assume `pt-BR` uma única vez. |
| Locale salvo `es` | Aplicação reinicia ou imagem atualiza | Chat, painel, callback, rótulos OBS e ferramentas resolvem espanhol. |
| Streamer altera locale | Mutação protegida do painel conclui | Configuração e intenção de projeção são auditadas na mesma transação; projeção local recebe a revisão mais recente sem reiniciar API. Valores escritos pelo streamer permanecem exatamente como inseridos, conforme a política aprovada. |
| Locale `es` ativo | Usuário envia `!cola comandos` | Ajuda em espanhol é retornada; `!fila` e `!queue` não são aceitos como aliases. |
| Texto de viewer contém HTML ou placeholder parecido com comando | O texto é interpolado/renderizado | Continua texto e não executa markup nem cria comando. |
| Provider retorna status/erro desconhecido | API/interface/chat renderizam | Só mensagem pública localizada genérica aparece; código/mensagem crua não aparece. |
| Catálogo comunitário omite chave | Locale carrega | Fallback `pt-BR` aparece; chave não aparece crua; validador detecta ausência. |
| Locale muda com fonte OBS ativa | Renderer consulta projeção seguinte | Rótulos do produto mudam; dados escritos pelo streamer permanecem armazenados e exibidos sem tradução automática. |
| Ferramenta de update/uninstall tem locale salvo | Comando executa | Usa o idioma salvo; desinstalador pergunta se preserva/apaga e nunca apaga sem confirmação explícita. |

## 7. Riscos e gates

- **Ponte de locale das ferramentas locais (alto):** arquitetura escolhida para esta spec: PostgreSQL autoritativo e projeção atômica versionada em `.local/product-locale.state`, com fallback para último estado válido offline. Gate fecha somente após testes de contrato para falha entre commit e projeção, erro de escrita, corrupção, leitura stale/offline, recuperação, permissões e persistência Compose.
- **Formato do catálogo (alto):** contrato escolhido para esta spec: TSV UTF-8 sem BOM, texto literal e placeholders allowlistados, sem avaliação, consumível nos quatro runtimes. Gate fecha somente após testes de parser/encoding cruzados.
- **Parser de comandos (médio):** reservar `fila`, `queue` e `cola`. O proprietário aprovou bloquear somente a raiz em conflito até o streamer renomear explicitamente a chave pelo painel; nunca renomear automaticamente. O teste de upgrade continua necessário.
- **Valores escritos pelo operador (médio):** a preservação de nomes/descrições/templates do streamer e textos fixos dos widgets foi aprovada; testes devem garantir que a troca de locale nunca reescreve esses campos.
- **Ferramentas de ciclo de vida (médio):** os nomes genéricos das ações foram aprovados. A consolidação dos entrypoints multiplataforma e o empacotamento de artefatos Actions estão planejados separadamente em OPS-5; coordenar o escopo para FND-8 localizar os textos sem duplicar a arquitetura do instalador.
- **Segurança de catálogos comunitários:** traduzir texto somente; não permitir HTML, código, tokens de comando ou URLs que virem instrução executável.
- **Limites do chat:** contar texto Unicode após interpolação conforme limite existente, sem dividir/duplicar mensagens para caber.
- **OBS offline:** preservar semântica de projeção conhecida sem expor catálogos inteiros ou estado interno pela capability URL.
- **Instalação de credenciais:** não instalar Docker silenciosamente como administrador; instalação de dependência precisa ser explícita, suportada e reversível.

## 8. Decisões das revisões especializadas

- **Revisão PM:** inventariar todas as superfícies de texto do produto e dividir a funcionalidade ampla em incrementos testáveis; artefatos de planejamento não significam catálogos/ferramentas implementados.
- **Revisão de arquitetura da spec v3:** seleciona PostgreSQL como autoridade do locale e uma projeção local atômica com revisão monotônica e fallback offline para o último valor válido; seleciona TSV literal UTF-8 compartilhado, legível pelos runtimes-alvo sem parser pré-instalação. Testes de implementação ainda são gate de conclusão. i18next não foi selecionado para a stack vanilla/sem bundler. IDs estáveis de comandos e códigos API permanecem separados dos rótulos.
- **QA AIOX independente (2026-10-06):** spec v1 recebeu CONCERNS, 8,1/10. A reavaliação somente leitura da v2 retornou CONCERNS sem nova nota. A spec v3 resolveu os contratos técnicos e achados de paridade bilíngue; sua reavaliação independente continuou CONCERNS sem nova nota, mas permitiu incrementos TDD isolados. Os três achados editoriais foram corrigidos e as decisões do proprietário OQ-4/OQ-6 foram resolvidas depois. O acompanhamento independente de QA segue necessário para o aceite completo da story; não há nota atribuída à v3.
- **Política aprovada pelo proprietário:** preservar exatamente como inseridos os textos de fila, reward, template de chat e widget escritos pelo streamer; a mudança de idioma afeta somente textos e rótulos próprios do produto.

## 9. Fora do escopo

Tradução automática de texto escrito pelo streamer; chat com locale por viewer; locale por fila; localização de IDs/logs/versão do contrato API; serviço de tradução externo; redesign do overlay; novas integrações de pagamento; promoção de versão/stage; implementação da FND-8 nesta mudança de planejamento.

## 10. Referências de pesquisa

Consulte a matriz datada em `research.json`. A documentação i18next de namespaces/interpolação demonstra catálogos por módulo e alerta contra desativar escaping; ECMA-402 fornece APIs explícitas de locale/plural/número/data. Regras de interpolação do Docker Compose fundamentam por que variáveis de ambiente devem ser somente dica de bootstrap, nunca sobrescrita da configuração persistida.
