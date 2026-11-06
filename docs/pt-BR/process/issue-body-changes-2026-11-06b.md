# Corpo da issue da OPS-31 (fila natural e devolução de pontos do canal por grupo)

[English](../../process/issue-body-changes-2026-11-06b.md)

**Data:** 2026-11-06. **Autor:** `@sm` (River). **Para:** o `@devops`, que cria a issue **OPS-31** com o corpo abaixo (nunca como comentário; os blocos estão em português porque vão para o corpo da issue, com o espelho em inglês sem caixas, como pede o [modelo de corpo de issue](issue-body-template.md)). O `@sm` não criou nada. As fatias FT-71..FT-78 viram sub-issues just-in-time. **Nenhuma caixa do dono é marcada aqui.** As decisões que o dono já deu aparecem como "registradas" no texto (não como caixas); não há decisão aberta (a seção é a linha única `Nenhuma decisão pendente.`).

## Corpo da issue (a criar)

O texto é o mesmo do [arquivo em inglês](../../process/issue-body-changes-2026-11-06b.md), seção "Issue body (to create)", que já está em português e inglês, como exige o modelo. Resumo do que ele contém:

- **Português e English:** contexto, escopo (proposta do dono em 2026-11-06 para a 0.4.0-beta+), decisões do dono registradas, os seis itens que só um teste real fecha e os riscos.
- **Decisões registradas (não são caixas):** cumprir ao iniciar continua para resgates normais; um escopo OAuth por grupo ativado; falha na consulta pede decisão ao streamer ("verificar grupo"); **momento único da devolução: ao terminar o atendimento**, com o painel explicando no próprio controle que os pontos só voltam depois que o atendimento terminar.
- **Decisão sobre encerramentos sem atendimento (registrada em 2026-11-06):** ao cancelar, pular ou marcar não compareceu uma entrada de grupo especial, o streamer decide na hora se os pontos voltam; sem devolução automática.
- **Decisões do dono:** `Nenhuma decisão pendente.`
- **Gates:** Story Ready (`@po`), `@architect`, `@data-engineer`, plano de UX (nota mínima 9,0), plano de testes do `@qa`, veredito do `@qa`, commit (`@devops`), CI verde, todos sem marca.
