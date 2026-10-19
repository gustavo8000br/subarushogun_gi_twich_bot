# Roteiro de conclusão do projeto — trabalho aprovado restante

[English](../project-completion-roadmap.md)

**Revisado:** 2026-10-19 contra as stories atuais, o handoff da sessão e `.release-stage` (`beta`).
**Objetivo:** visão entre stories do trabalho do projeto ainda aberto. Stories/issues existentes continuam sendo fonte dos critérios de aceite e status. Este roteiro não encerra stories, não autoriza release e não substitui seus gates de QA.

## Situação atual do projeto

A implementação ativa imediata é a migração do painel/OBS para Next.js em [OPS-15](../stories/OPS-15/story.md), que continua **In Progress**. Isso não significa que toda tarefa aberta do projeto pertence à OPS-15. O restante mantém suas próprias stories e aceites.

## Trabalho restante, ordenado por dependências

| Ordem | Story existente | Status registrado | Trabalho restante nos critérios de aceite | Dependência / evidência de saída |
|---|---|---|---|---|
| 1 | [OPS-15](../stories/OPS-15/story.md) | In Progress | Concluir verificação de sessão/banco dev local Windows; expandir matriz endpoint/ação/teste; fechar paridade do painel/overlay e evidência de catálogos runtime; concluir revisões de implementação arquitetura/UX/QA; validar Compose semelhante à produção e instalador Windows real; testar OBS/CEF nativo; ensaiar rollback; auditar testes legados; só então propor cutover. | Todos os critérios OPS-15 e evidências por ambiente. Vanilla permanece até paridade, auditorias, revisões, OBS/CEF e rollback passarem; cutover/remoção exige autorização explícita do proprietário. |
| 2 | [FND-9](../stories/FND-9/story.md) | Ready for Review; aceite do proprietário pendente | Proprietário executa aceite nativo do produto no Windows e aceite ao vivo Twitch de ciclo de vida/financeiro explicitamente autorizado; registra resultados sem inferir sucesso remoto a partir de mocks. | Evidência do proprietário para comportamento local e confirmação Twitch; depois status da story/issue pode ser atualizado pelo fluxo autorizado. |
| 3 | [OPS-13](../stories/OPS-13/story.md) | Ready for Review; aceite OBS nativo pendente | Proprietário verifica se o widget de conta atual sobrevive reload do OBS Browser Source/CEF nativo usando o fluxo de capability aceito; registra versões OBS/CEF e resultado. | Evidência OBS/CEF nativa; automação Chromium não substitui. |
| 4 | [OPS-14 / issue #65](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/65) | Aberta; Ready for Review; não iniciada | Após a OPS-13 ser corrigida e aceita pelo proprietário, implementar instruções localizadas de chamada usando o slug executável da fila e exatamente um anúncio público durável/recuperável no chat para cada transição bem-sucedida de início de atendimento, preservando mensagens customizadas e en/es/pt-BR. | A issue diz que a implementação vem após o aceite da OPS-13. Preservar como comportamento de chat separado; OPS-15 migra somente sua apresentação no painel. |
| 5 | [DOC-2](../stories/DOC-2/story.md) | Planned; refinamento de página de papéis e pré-flight visual registrados | Concluir revisão integrada da página de papéis/navegador, capturar screenshots somente do produto e GIF calmo página a página do README usando versão liberada e dados demo seguros, incluir alt text/legendas acessíveis e validar assets/posicionamento bilíngues. | Capturar somente depois que UI e estados demo estiverem estáveis; não usar segredos ou dados pessoais. |
| 6 | [DOC-3](../stories/DOC-3/story.md) | Planned; issue #48 | Após FND-9 e DOC-2, auditar documentação mantida de produto/contribuição contra implementação e evidências, corrigir contradições/links mortos, preservar alegações históricas e validar equivalência bilíngue com QA independente. | Dependências explícitas na DOC-3; registrar alegações que permanecerem sem verificação. |
| 7 | [OPS-12](../stories/OPS-12/story.md) | Ready for Review; adiada | Aguardar enquanto `.release-stage` for `beta`. Em `rc`, executar workflow AIOX planejado de discovery/UX/arquitetura/QA antes de definir detalhes da implementação. | `.release-stage` deve primeiro mudar para `rc`; valor atual é `beta`. Nenhum planejamento ou implementação começa antes desse gate. |

## Limites

- FND-9 continua aguardando aceite do proprietário; OPS-13 continua aguardando OBS nativo; OPS-15 continua In Progress. Este roteiro não altera nenhum desses status.
- Não remover o painel vanilla nem mover o ponteiro local fixo de recuperação `legacy` antes que paridade OPS-15, auditoria de testes legados, revisões de arquitetura/UX/QA, verificações OBS/CEF nativas, validação de implantação semelhante à produção e rollback isolado estejam concluídos.
- Não criar PR, fazer merge, publicar release, promover beta para RC ou realizar operações financeiras Twitch ao vivo sem a autorização exigida pelas stories e regras do repositório.
- Para mudanças visíveis ao usuário, usar `$aiox-ux-design-expert`; mudanças de banco/schema exigem `$aiox-data-engineer`; QA da implementação permanece independente.
- Registrar trabalho na story responsável em ambos idiomas. Este roteiro é um índice de navegação, não evidência de gate aprovado.

## Histórico de alterações

| Data | Alteração | Responsável |
|---|---|---|
| 2026-10-19 | Adicionada visão do trabalho aberto do projeto com dependências registradas e escopo explícito das evidências; nenhum status foi alterado. | `$aiox-sm` |
