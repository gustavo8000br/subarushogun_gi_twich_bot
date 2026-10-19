# Decisões de projeto registradas

**Status:** Concluídas — nenhuma nova escolha do proprietário solicitada.
**English:** [Recorded project decisions](../../human_decisions/done/recorded-project-decisions.md)

## Decisões já registradas — nenhuma nova escolha solicitada

- Manter o painel vanilla em produção até que paridade de painel/overlay, auditoria dos testes legados, revisões independentes de arquitetura/UX/QA, aceite OBS/CEF nativo e rollback isolado passem. Só então propor cutover/remoção para autorização explícita do proprietário.
- Manter OPS-15 **In Progress**; não encerrar FND-9, remover vanilla, criar PR ou fazer merge como parte do trabalho de implementação atual.
- Não alterar schema, persistência, semântica de limpeza entre sessões nem política de domínio/API sob esta migração de UI sem a story exigida e coordenação do Data Engineer.
- OpenGrep é um bloqueio de instalação de ferramenta, não uma decisão de produto. O projeto fixa uma versão e exige verificação da assinatura; instalar o verificador/ferramenta necessário ou manter a análise estática Pendente. Nunca ignorar a verificação da assinatura. Consulte as [referências de ferramentas CI/CD do projeto](../../CI-CD.md) e o [guia de instalação fixado do OpenGrep](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md).
