# Roadmap do projeto

[Read in English](../ROADMAP.md) · [Voltar ao README](../../README.pt-BR.md)

Estado conferido com o índice local de stories e as issues do GitHub em 2026-10-07. Issues abertas indicam planejamento/aceite pendente, não promessa de prazo de lançamento.

| Story | Estado |
| --- | --- |
| FND-1 — Identidade de versão e runtime local ([#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3)) | Em andamento; falta repetir manualmente no Windows o teste da correção do helper |
| FND-2 — Domínio de filas e ordenação PostgreSQL ([#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2)) | Concluída |
| FND-3 — Outbox financeira durável e recuperação ([#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5)) | Concluída; operações reais de pontos não verificadas |
| FND-4 — OAuth Twitch, recompensas, EventSub e reconciliação ([#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4)) | Concluída; aceite autorizado de recompensa real não verificado |
| FND-5 — Comandos, atendimento, timeout e conta ([#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Concluída; operações reais de pontos não verificadas |
| FND-6 — Painel do streamer e segurança local ([#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Concluída; escritas reais na Twitch não verificadas |
| FND-7 — Widgets locais para OBS ([#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)) | Concluída; QA PASS 9,2/10. Certificado OBS no Windows/macOS e escritas reais Twitch não verificados |
| FND-8 — Localização do produto ([#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)) | Concluída; mesclada na PR #31; QA PASS 9,2/10 |
| FND-9 — Filas manuais para canais inelegíveis ([#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)) | Issue de planejamento aberta; implementação não iniciada |
| OPS-1 — CI para API, infra e web ([#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)) | Concluída; mesclada na PR #12 |
| OPS-2 — Status Twitch localizado com segurança ([#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)) | Concluída; mapa inicial na PR #13 e precedência/localização na PR #31 da FND-8 |
| OPS-3 — Catálogo de comandos e permissões por cargo ([#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17)) | Concluída; mesclada na PR #24 |
| OPS-4 — Licença MIT ([#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29)) | Concluída; mesclada na PR #25 |
| OPS-5 — Instalador de ciclo de vida multiplataforma ([#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30)) | InReview na PR #36; Actions Linux/macOS passaram, nova execução Windows pendente após a execução 37637259314 não observar a inicialização do Compose; QA independente pendente |
| OPS-6 — Status de runtime claro e orientações no painel ([#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32)) | Concluída; mesclada na PR #33; QA independente PASS 100/100 |

Consulte critérios de aceite e evidências detalhadas no [índice de stories](stories.md) e na [versão em inglês](../stories.md).

## Candidatas a stories para planejamento futuro

Estas ideias solicitadas pelo proprietário são candidatas ao backlog; ainda não são stories ou issues refinadas:

- Recuperar automaticamente a conexão com Twitch API/EventSub após perda temporária de rede, suspensão, desligamento ou reinício quando as credenciais OAuth persistidas continuarem válidas; não pedir novo login por uma falha transitória.
- Incluir capturas de tela selecionadas na documentação em inglês e pt-BR, com processo definido para capturar e atualizar as imagens.
