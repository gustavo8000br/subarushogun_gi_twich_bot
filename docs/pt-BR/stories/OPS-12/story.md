# OPS-12 — Planejar uma experiência intuitiva para o instalador no release candidate ([issue #60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60))

[English](../../../stories/OPS-12/story.md)

**Status:** Ready for Review — planejamento adiado até `.release-stage` ser `rc`. O workflow de design ainda não começou.
**Prioridade:** Planejada para o estágio release candidate.
**Executor:** `$aiox-ux-design-expert` lidera o planejamento de UX; `$aiox-master` orquestra o workflow de planejamento AIOX. `$aiox-dev` implementa somente depois que o plano e os critérios de aceite forem aprovados.
**Gates de qualidade:** `$aiox-architect` revisa viabilidade técnica e limites; `$aiox-qa` faz revisão independente dos critérios e das evidências de implementação. A revisão de UX por `$aiox-ux-design-expert` é obrigatória para o design visual e de interação.

## História

Como streamer que instala o aplicativo,
quero uma experiência mais clara no instalador, com progresso visível,
para entender o que o instalador está fazendo e quando terminou.

## Gate de estágio e escopo

Esta story fica intencionalmente adiada enquanto o estágio do produto for beta. Não inicie descoberta, pesquisa de UX, planejamento de workflow, design visual ou implementação até `.release-stage` conter `rc`.

Depois que o gate for atendido, execute o workflow AIOX completo aplicável de planejamento. `$aiox-ux-design-expert` planeja o fluxo do usuário, a direção visual e o indicador de progresso acessível para todas as plataformas de instalador suportadas. Refine esta story com os resultados do planejamento e critérios de aceite aprovados antes de começar a implementação. Estados, texto, apresentação e comportamento da barra continuam decisões de design em aberto até esse workflow.

O ciclo de vida do instalador unificado existente está documentado na [OPS-5](../OPS-5/story.md) e é a referência a inspecionar quando esta story for ativada. Não presuma um novo framework, padrão de interação ou capacidade de plataforma antes da revisão de planejamento.

## Critérios de aceite

1. A story permanece adiada enquanto `.release-stage` for `beta`; nenhum planejamento de UX ou implementação desta story começa antes de o estágio configurado ser `rc`.
2. No RC, o workflow AIOX completo aplicável de planejamento é concluído e registrado, incluindo revisão do produto/fluxo, design de UX, revisão de viabilidade técnica e revisão independente de QA do plano.
3. `$aiox-ux-design-expert` documenta o fluxo do instalador e uma direção visual/de interação para todas as plataformas suportadas, com base no comportamento atual do instalador e nos artefatos do projeto.
4. O design aprovado inclui uma barra de progresso. Ele especifica nome/status acessíveis, anúncios e comportamento com teclado e leitor de tela, e como o progresso é representado em cada operação de instalação incluída. Estados e textos exatos são definidos durante o planejamento.
5. As versões em inglês e pt-BR da story contêm resultados de planejamento equivalentes e critérios de aceite de implementação refinados e verificáveis antes de iniciar a implementação.
6. O plano de implementação refinado identifica testes de regressão e gates de qualidade pertinentes ao projeto; o comportamento de banco ou financeiro não muda como parte da UX do instalador, salvo se for planejado e aprovado separadamente.

## Plano de gates de qualidade

- Planejamento: `$aiox-master` coordena o workflow AIOX completo aplicável; `$aiox-ux-design-expert` responde pelo fluxo de UX e pela especificação visual.
- Viabilidade: `$aiox-architect` revisa limites entre plataformas e viabilidade de implementação após o planejamento de UX.
- Revisão independente do plano: `$aiox-qa` verifica se os critérios são observáveis e testáveis e se cobrem todas as plataformas suportadas.
- Implementação (somente após o gate de planejamento no RC): `$aiox-dev` segue TDD, executa `npm run lint`, `npm run typecheck` e `npm test`, e atualiza a documentação equivalente em inglês/pt-BR. `$aiox-qa` valida a implementação de forma independente. Adicione verificações nativas por plataforma conforme o design aprovado e as capacidades atuais de CI.
- Alterações documentais deste rascunho: verificar equivalência bilíngue, links, `git diff --check` e validação da estrutura do repositório. Não há score de QA de implementação para uma story de planejamento adiada.

## Tarefas / subtarefas

- [ ] Aguardar `.release-stage` ser `rc`; registrar evidência do estágio/versão antes de ativar esta story.
- [ ] `$aiox-master`: selecionar e executar o workflow AIOX completo aplicável de planejamento; registrar artefatos e decisões do workflow.
- [ ] `$aiox-ux-design-expert`: inspecionar OPS-5 e os instaladores atuais por plataforma; planejar o fluxo, o design visual, a barra acessível e o comportamento específico por plataforma.
- [ ] `$aiox-architect`: revisar a proposta quanto à viabilidade técnica e às restrições das plataformas.
- [ ] `$aiox-qa`: revisar o plano e refinar critérios de aceite mensuráveis de forma independente.
- [ ] Atualizar as duas versões da story, tarefas de implementação, listas de arquivos e documentação de usuário afetada com conteúdo aprovado equivalente.
- [ ] Somente após aprovação das revisões de planejamento, encaminhar o escopo refinado para `$aiox-dev` implementar com testes antes do código e validação multiplataforma.

## Notas de desenvolvimento

- O `.release-stage` atual é `beta` (verificado em 2026-10-14). Esta story é um registro de backlog, não uma autorização para iniciar o workflow de planejamento agora.
- Requisito confirmado pelo proprietário: tornar o instalador mais intuitivo e incluir uma barra de progresso.
- Detalhes visuais, fases de progresso, terminologia, diferenças entre plataformas e critérios detalhados de aceite ficam intencionalmente para o planejamento no estágio RC.
- Referência do ciclo de vida do instalador atual: `docs/stories/OPS-5/story.md` e `docs/pt-BR/stories/OPS-5/story.md`.
- Mantenha as versões em inglês e pt-BR equivalentes.

## Lista de arquivos

- [x] `docs/stories/OPS-12/story.md`
- [x] `docs/pt-BR/stories/OPS-12/story.md`
- [x] `docs/stories.md`
- [x] `docs/pt-BR/stories.md`
- [x] `docs/session-handoff.md`
- [x] `docs/pt-BR/session-handoff.md`

## Histórico de alterações

| Data | Alteração | Autor |
| --- | --- | --- |
| 2026-10-14 | Criada story adiada para o estágio RC por orientação do proprietário; requisito da barra de progresso e gate de planejamento registrados sem iniciar planejamento de UX. | `$aiox-master` |
