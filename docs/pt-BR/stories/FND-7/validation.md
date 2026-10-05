# FND-7 — Validação do Spec Pipeline

[English](../../../stories/FND-7/validation.md)

## Estado do pipeline

| Fase | Resultado | Evidência |
| --- | --- | --- |
| Gather | Concluída com elicitação do usuário | Escopo completo de campos, mesmo computador, estilo completo, SLA de 2s, fallback para vazio, stale marker para falha transitória, link revogável e limite de 240 caracteres. |
| Assess | COMPLEX, 17/25 | Scope 4, Integration 3, Infrastructure 4, Knowledge 3, Risk 3. |
| Research | Concluída | Documentação oficial OBS Browser Source, RFC 6750 e arquitetura existente; sem nova dependência. |
| Write | Revisada após crítica 1 | Define campos, identidade do widget, token fragment/header, fallback e semântica stale. |
| Critique 1 | NEEDS_REVISION | Encontrou ambiguidade entre campo vazio, falha temporária e link revogado; solicitou resposta visual distinta e atualização dos critérios. |
| Revise | Concluída | Elicitação especificou último valor com marcador stale durante falha transitória; vazio usa fallback; token inválido/revogado limpa valor em 401/403. |
| Critique 2 | APPROVED, 4,4/5 (QA independente) | Concluída após correções; PM/PO/arquitetura/QA confirmaram os gates finais PASS. |
| Plan | Concluído | Plano resumido em spec/plan.json e plano executável em plan/implementation.yaml, fatiados em testes-first e dependências FND-5/FND-6. |

## Decisões de escopo aceitas

- Nova extensão pós-MVP; FND-0 permanece como registro fiel do MVP original.
- OBS e app precisam rodar na mesma máquina. Não há acesso LAN/remoto.
- Uma URL por widget; dados operacionais completos da proposta e texto fixo.
- Cada widget oferece estilo completo via controles seguros, não CSS arbitrário.
- Atualização em até 2 segundos; fallback quando o campo está vazio; último dado marcado stale durante erro transitório; limpar dado ao rejeitar capability.
- Link tem segredo exclusivo e revogável; URL deve ser tratada como senha.
- Texto fixo/fallback limitado a 240 pontos de código Unicode, com contagem idêntica no cliente e servidor.

## Limitações

- Spec/story em revisão não significa implementação aprovada, teste de código, instalação ou funcionamento OBS comprovado.
- FND-5 e FND-6 precisam estar totalmente concluídas; mapear todos os campos e bloquear qualquer implementação antes disso.
- UX deve aprovar estilo padrão e fonte permitida antes de implementar os controles.
- Gates finais PM, arquitetura, QA e PO: PASS. Publicação documental/issue autorizada; implementação e testes do produto não iniciados.
- Compatibilidade por sistema operacional não pode ser declarada até executar teste OBS nativo em cada plataforma reivindicada.
