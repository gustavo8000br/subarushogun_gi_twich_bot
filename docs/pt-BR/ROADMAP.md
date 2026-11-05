# Roadmap do projeto

[Read in English](../ROADMAP.md) · [Voltar ao README](../../README.pt-BR.md)

Estado conferido com os arquivos das stories em 2026-10-21. O estágio do produto é `beta` (`.release-stage`); nenhuma release pública foi publicada ainda. Issues abertas indicam planejamento/aceite pendente, não promessa de prazo de lançamento. A ordem de dependências do trabalho restante fica no [roteiro de conclusão do projeto](project-completion-roadmap.md); esta tabela apenas resume o estado registrado de cada story.

| Story | Estado |
| --- | --- |
| FND-1 — Identidade de versão e runtime local ([#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3)) | Concluída |
| FND-2 — Domínio de filas e ordenação PostgreSQL ([#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2)) | Concluída |
| FND-3 — Outbox financeira durável e recuperação ([#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5)) | Concluída; operações reais de pontos não verificadas |
| FND-4 — OAuth Twitch, recompensas, EventSub e reconciliação ([#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4)) | Concluída; aceite autorizado de recompensa real não verificado |
| FND-5 — Comandos, atendimento, timeout e conta ([#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Concluída; operações reais de pontos não verificadas |
| FND-6 — Painel do streamer e segurança local ([#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Concluída; escritas reais na Twitch não verificadas |
| FND-7 — Widgets locais para OBS ([#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)) | Concluída; QA PASS 9,2/10. Certificado OBS no Windows/macOS e escritas reais Twitch não verificados |
| FND-8 — Localização do produto ([#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)) | Concluída; mesclada na PR #31; QA PASS 9,2/10 |
| FND-9 — Filas locais/com reward conforme capacidade Twitch ([#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)) | Pronta para revisão; regressão crítica de exclusão corrigida. Aceite nativo no Windows pelo proprietário e aceite autorizado do ciclo de vida/financeiro real na Twitch continuam pendentes |
| OPS-1 — CI para API, infra e web ([#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)) | Concluída; mesclada na PR #12 |
| OPS-2 — Status Twitch localizado com segurança ([#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)) | Concluída; mapa inicial na PR #13 e precedência/localização na PR #31 da FND-8 |
| OPS-3 — Catálogo de comandos e permissões por cargo ([#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17)) | Concluída; mesclada na PR #24 |
| OPS-4 — Licença MIT ([#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29)) | Concluída; mesclada na PR #25 |
| OPS-5 — Instalador de ciclo de vida multiplataforma ([#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30)) | Concluída; mesclada na PR #37; QA AIOX independente PASS 100/100. Ciclo real Compose no Linux passou; aceitação física em Windows/macOS continua sem validação |
| OPS-6 — Status de runtime claro e orientações no painel ([#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32)) | Concluída; mesclada na PR #33; QA independente PASS 100/100 |
| OPS-7 — Permissões hierárquicas e cargo follower ([#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39)) | Done; QA 10/10; mesclada na PR #42 |
| OPS-8 — Reconexão automática com Twitch ([#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)) | Concluída; mesclada na PR #43; QA PASS 9,5/10 |
| OPS-9 — Regras unificadas de acesso a comandos | Concluída; mesclada na PR #44; AIOX-QA PASS |
| OPS-10 — Separar CI de PR da entrega de imagem na main ([#45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45)) | Concluída; mesclada na PR #46 (`01c63d9`); QA PASS 9,4/10 |
| OPS-11 — Chamadas, permissões, presença e rewards removidas da Twitch ([#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57)) | Concluída; QA independente PASS 10/10 |
| OPS-12 — Experiência intuitiva do instalador para release candidate ([#60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60)) | Pronta para revisão; planejamento adiado até `.release-stage` ser `rc` |
| OPS-13 — Widget de conta do OBS utilizável após recarregar | Pronta para revisão; aceite OBS/CEF nativo do proprietário pendente |
| OPS-14 — Instruções localizadas de chamada e anúncio de início de atendimento ([#65](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/65)) | Aberta; começa depois do aceite da OPS-13 |
| OPS-15 — Painel e overlay OBS modulares em Next.js ([#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69)) | Em andamento; paridade, revisões, validação semelhante à produção e cutover autorizado pelo proprietário continuam abertos |
| OPS-16 — Explicar variáveis da mensagem personalizada de chamada ([#72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72)) | Backlog; não iniciada |
| OPS-17 — Comandos de chat multilíngues para viewers ([#73](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73)) | Backlog; requer refinamento |
| OPS-18 — Conta atual como único overlay de identidade do jogador ([#77](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/77)) | Em andamento |
| OPS-19 — Confirmar reward da Twitch ao iniciar atendimento ([#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78)) | Em andamento |
| OPS-20 — Escolher quem pode receber devolução de pontos ([#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76)) | Rascunho; começa depois da migração do painel na OPS-15 |
| DOC-2 — Capturas bilíngues corretas do produto ([#40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40)) | Aberta; capturas/GIF planejados depois da FND-9; revisão visual registrada |
| DOC-3 — Auditoria completa de consistência documental e padrão UX ([#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48)) | Planejada após FND-9 e DOC-2; issue e story bilíngue publicadas |

Consulte critérios de aceite e evidências detalhadas no [índice de stories](stories.md) e na [versão em inglês](../stories.md).

## Candidatas a stories para planejamento futuro

Estas ideias solicitadas pelo proprietário são candidatas ao backlog; ainda não são stories ou issues refinadas:

- Incluir capturas de tela selecionadas na documentação em inglês e pt-BR, com processo definido para capturar e atualizar as imagens.
- **Nota histórica de sequência (2026-10-07):** FND-9 → DOC-2 → DOC-3 (#48, auditoria documental completa). OPS-7 foi mesclada na PR #42; OPS-8 na PR #43 com QA PASS 9,5/10; OPS-9 na PR #44; OPS-10 na PR #46 com QA PASS 9,4/10. O proprietário pediu uma pré-revisão visual e o ajuste de Cargos e permissões antes da FND-9; a DOC-2 registra a revisão e os requisitos de mídia. As capturas/GIF continuam depois da FND-9. Essa nota é anterior à mudança do estágio para `beta` feita pelo proprietário; o trabalho ativo atual é a OPS-15 e a ordem atual está no [roteiro de conclusão do projeto](project-completion-roadmap.md). Não há data para release pública, e somente o proprietário pode mudar o estágio novamente ou publicar uma release.
