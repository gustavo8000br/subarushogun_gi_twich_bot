# Story FND-7: Widgets configuráveis para overlay do OBS

[English](../../../stories/FND-7/story.md)

**Complexidade:** COMPLEX (17/25)
**Executor:** @dev
**Quality gate:** @architect
**Ferramentas do quality gate:** Vitest, testes de rotas Fastify, testes de integração de migrations PostgreSQL reais, E2E de navegador, ESLint, verificação TypeScript, OpenGrep, validação Prisma, validação do Docker Compose e `git diff --check`.
**Prioridade:** P0 para dados, estilo, ciclo de vida dos links e segurança; P1 para guias bilíngues.
**Issue:** [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)

## Status

**Draft.** As revisões do Spec Pipeline por PM, PO, Arquitetura e QA passaram. A implementação ainda não começou. FND-0 permanece como baseline histórico do MVP; FND-7 é uma extensão pós-MVP solicitada explicitamente.

## História do usuário

Como streamer que usa o bot local de filas de Genshin Impact, quero widgets independentes no OBS com dados e estilos escolhidos separadamente, para mostrar na transmissão somente as informações selecionadas, com aparência consistente.

## Escopo e dependências obrigatórias

OBS e bot rodam no mesmo computador. Cada widget corresponde a uma URL local de OBS Browser Source e mostra exatamente um campo atômico ou texto fixo:

- Rótulo atual da conta de Genshin.
- Nome, estado aberta/fechada ou quantidade aguardando de uma fila selecionada (um atributo por widget).
- Nome de exibição ou posição da pessoa chamada (um atributo por widget).
- Nome de exibição da pessoa em atendimento.
- Texto personalizado fixo.

FND-5 e FND-6 precisam estar totalmente concluídas antes de qualquer implementação FND-7. Mapear todas as projeções de origem e os recursos protegidos de painel/segurança. A UX Design Expert precisa aprovar jornada, padrões, estados e acessibilidade antes de qualquer código de UI.

## Critérios de aceite

1. **Criar widget e escolher fonte:** pessoas autenticadas no painel podem criar, editar e excluir widgets independentes e escolher um único campo atômico ou texto fixo. Cada atributo de fila exige a seleção de uma fila. A operação não altera filas, conta ou estado de viewers.
2. **Emitir link independente:** a resposta autenticada de criação/regeneração retorna a URL local com segredo uma única vez, para cópia imediata. Leituras posteriores não recuperam o segredo. A projeção OBS não o retorna. Somente o hash criptográfico é persistido.
3. **Personalizar aparência:** por widget, configurar cores de texto/fundo, opacidade, pilhas de fontes locais permitidas, tamanho, peso, alinhamento, contorno/sombra, dimensões, margens, overflow e texto fallback. Validar no servidor e cliente. Texto fixo/fallback aceita até 240 pontos de código Unicode, com contagem idêntica nos dois lados.
4. **Estados de disponibilidade:** fonte dinâmica vazia exibe fallback configurado. Falha transitória inicial sem valor anterior exibe estado neutro indisponível. Falha transitória depois de um valor válido mantém o último valor com marcador de desatualizado e tenta novamente. Capability inválida/revogada (401/403) ou widget desconhecido/excluído (404) limpa o conteúdo exibido.
5. **Projeção mínima:** retornar somente o campo selecionado e o contexto de fila estritamente necessário. Nunca projetar UID, credenciais Twitch, sessões, dados financeiros, segredo, outros widgets ou outras filas. Usar os serviços/projeções compartilhados; capability OBS não altera estado.
6. **Revogar, regenerar e excluir:** revogação invalida o token antigo sem emitir link substituto. Regeneração invalida o token anterior e retorna uma URL nova uma única vez. Exclusão do widget e invalidação da capability são atômicas; após a exclusão confirmar, nenhuma leitura concorrente com token antigo retorna dados. Excluir não emite URL nova.
7. **SLA de atualização:** com oito widgets dinâmicos mistos abertos, cada uma de dez mudanças consecutivas precisa chegar ao DOM em até dois segundos, medidos do commit à renderização, com polling nominal de um segundo. Registrar ambiente e duração observada.
8. **OBS e guias:** Browser Source no mesmo computador renderiza fundo transparente e sem barra de rolagem nas dimensões configuradas. Guias em inglês e pt-BR explicam setup, preview, cópia, atualização, revogação e regeneração. Alegar somente plataformas realmente testadas.

## Limites de estilo

Cores `#RRGGBB`; opacidade 0–100%; pilhas permitidas: `system-ui`, `Arial/sans-serif`, `Verdana/sans-serif`, `Georgia/serif`, `Courier New/monospace`; tamanho inteiro 8–128px; pesos 300/400/500/600/700/800/900; alinhamento left/center/right; efeito none/outline/shadow; contorno 1–8px; blur de sombra 0–32px e deslocamentos −32..32px; largura auto ou 1–3840px; altura auto ou 1–2160px; margens por lado 0–256px; overflow wrap/clip/ellipsis. Sem HTML/CSS/JS arbitrário ou assets remotos.

## Segurança e arquitetura

Usar um segredo aleatório no fragmento da URL e header Authorization nas leituras same-origin. O fragmento evita enviar segredo na requisição HTTP, mas permanece visível nas configurações do OBS e em URLs copiadas e deve ser tratado como credencial. Nunca colocar segredo em path/query HTTP, logs, cache ou referrer; nunca persistir o token bruto. Capability só leitura e limitada ao widget. Restringir host do overlay ao loopback e retornar apenas a projeção específica do widget pelos serviços existentes.

## Ordem de implementação

Seguir `spec/plan.json` e `plan/implementation.yaml`: primeiro concluir prontidão FND-5/FND-6 e gates UX; depois regras test-first de campos/estilo, modelo e migrations PostgreSQL, repository/serviço, rotas protegidas, renderer e painel; terminar com verificações reais de banco/E2E e validação manual no OBS. Cada incremento segue Red → Green → Refactor. Os planos JSON/YAML possuem 21 subtarefas alinhadas com serviço, arquivos, verificação e dependências explícitas.

## Tarefas / Subtarefas

Os IDs e o significado correspondem aos planos JSON/YAML canônicos em inglês.

- [ ] 0. Gates de prontidão
  - [ ] 0.1 Confirmar conclusão de FND-5/FND-6 e mapear cada campo dinâmico às projeções entregues e aos serviços protegidos de painel/segurança; bloquear a story se alguma dependência estiver incompleta.
  - [ ] 0.2 Concluir revisão UX e registrar fontes permitidas, aparência padrão, preview, estados vazio/desatualizado/indisponível, foco/rótulos acessíveis e consistência com o painel antes de codificar UI.
  - [ ] 0.3 Escrever e validar exemplos comuns de contagem de pontos de código Unicode para texto fixo/fallback de 240 caracteres.
- [ ] 1. Base de persistência de widget
  - [ ] 1.1 Escrever testes de contrato de migration PostgreSQL real para criação/edição/exclusão, hash de capability, escopo do widget, rotação, revogação e persistência após reinício.
  - [ ] 1.2 Adicionar modelo Prisma e migration SQL depois de os testes de banco falharem pelo comportamento ausente.
- [ ] 2. Política de campo e capability
  - [ ] 2.1 Escrever testes unitários de escopo do campo, seleção da fila, estados fallback, Unicode 240, allowlist de estilo e entrada maliciosa.
  - [ ] 2.2 Implementar validação pura de campos/estilo somente depois do Red comportamental.
  - [ ] 2.3 Escrever testes de geração aleatória de token, fronteira de persistência apenas do hash, escopo de widget único e rotação/revogação.
  - [ ] 2.4 Implementar emissão/verificação/revogação da capability e repetir testes após Refactor.
- [ ] 2B. Serviço/repositório de widget
  - [ ] 2B.1 Escrever testes PostgreSQL/serviço para criar/editar/excluir, emitir/verificar hash, link de uso único, rotacionar/revogar e atomicidade entre leitura concorrente e exclusão.
  - [ ] 2B.2 Implementar repository e serviço de aplicação de persistência/ciclo de capability após Red.
- [ ] 3. API de gestão e leitura OBS
  - [ ] 3.1 Escrever contratos HTTP de sessão/CSRF na gestão, Host/Origin, escopo do token, capability rejeitada/revogada, projeção exata, headers de cache/referrer e ausência de mutações.
  - [ ] 3.2 Implementar rotas de gestão de widget e leitura somente por token por meio de projeções compartilhadas de domínio/aplicação.
- [ ] 4. Página Browser Source
  - [ ] 4.1 Escrever testes de browser para texto seguro, transparência, estilo selecionado, atualização em até 2s, fallback vazio, marcador stale, recuperação e limpeza em 401/403. Executar oito widgets em paralelo com campos dinâmicos variados; medir commit→DOM em dez mudanças consecutivas e registrar o ambiente.
  - [ ] 4.2 Implementar renderer local de widget único e polling sem dependências/assets remotos.
- [ ] 5. Painel
  - [ ] 5.1 Concluir revisão UX de menu de fontes, aparência inicial, rótulos de estado vazio/desatualizado, preview e orientação de segredo antes de codificar UI do painel.
  - [ ] 5.2 Escrever testes de browser para criar/editar/excluir widget, selecionar campo/fila, preview de estilo, validação, copiar, revogar e regenerar.
  - [ ] 5.3 Implementar controles testados de gestão da overlay no painel local existente.
- [ ] 6. Verificação OBS e documentação
  - [ ] 6.1 Verificar o fluxo completo de criação à revogação e SLA de dois segundos contra app/banco locais reais.
  - [ ] 6.2 Testar manualmente dimensões, transparência, estado ao vivo, falhas, recuperação e rotação de link no OBS Browser Source.
  - [ ] 6.3 Publicar guias bilíngues e registrar evidência de implementação e gates efetivamente executados.
## Testes e limite de status

Ainda não executados: a story está em Draft e nenhum código FND-7 existe. Durante a implementação, executar todos os quality gates do projeto, atualizar checklist/file list e registrar saídas reais antes de alterar o status da story. Não declarar instalação ou compatibilidade OBS sem evidência do ambiente correspondente. Consulte `validation.md` e `spec/`.

## Lista de arquivos

Planejada; atualizar durante a implementação. Esta story não alterou arquivos da aplicação.

## Histórico de alterações

- 2026-10-05 — Draft criado após Spec Pipeline COMPLEX, elicitação, pesquisa e revisões PM/PO/Arquitetura/QA aprovadas.

## Registro do agente de desenvolvimento

### Modelo do agente

Pendente implementação.

### Referências de depuração

Nenhuma; implementação não iniciada.

### Notas de conclusão

Pendente implementação; não há código ou teste de produto executado.

## Resultados de QA

Aprovado nos gates de planejamento. Testes de implementação e verificação manual no OBS continuam pendentes.

## Evidências e limitações

- Spec Pipeline COMPLEX, 17/25; pesquisa oficial de OBS/RFC Editor em 2026-10-05.
- Revisão QA independente aprovada, 4,4/5; gates finais PM/PO/Arquitetura/QA aprovados. Não houve teste de implementação.
- Documentação oficial do OBS confirma Browser Source e transparência; o produto ainda não foi validado no OBS.
