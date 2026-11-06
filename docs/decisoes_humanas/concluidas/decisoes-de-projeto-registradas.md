# Decisões de projeto registradas

**Status:** Concluídas — nenhuma nova escolha do proprietário solicitada.
**English:** [Recorded project decisions](../../human_decisions/done/recorded-project-decisions.md)

## Decisões já registradas — nenhuma nova escolha solicitada

- Manter o painel vanilla em produção até que paridade de painel/overlay, auditoria dos testes legados, revisões independentes de arquitetura/UX/QA, aceite OBS/CEF nativo e rollback isolado passem. Só então propor cutover/remoção para autorização explícita do proprietário.
- Manter OPS-15 **In Progress**; não encerrar FND-9, remover vanilla, criar PR ou fazer merge como parte do trabalho de implementação atual.
- Não alterar schema, persistência, semântica de limpeza entre sessões nem política de domínio/API sob esta migração de UI sem a story exigida e coordenação do Data Engineer.
- OpenGrep é um bloqueio de instalação de ferramenta, não uma decisão de produto. O projeto fixa uma versão e exige verificação da assinatura; instalar o verificador/ferramenta necessário ou manter a análise estática Pendente. Nunca ignorar a verificação da assinatura. Consulte as [referências de ferramentas CI/CD do projeto](../../CI-CD.md) e o [guia de instalação fixado do OpenGrep](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md).

## Marcas do dono registradas em 2026-10-30

- **2026-10-30 — D-01 (issue #73), opção B:** palavras fixas por idioma suportado, lista fechada mantida pelo projeto, sem configuração da pessoa streamer. Efeito: o card ST-11 sai de Aguardando decisão para Rascunho com a política B registrada aqui.
- **2026-10-30 — D-12 (issue #102), opção A:** remover os 3 testes de status histórico. Efeito: TS-02 vai a Pronto para o `@dev` remover os 3 testes.
- **2026-10-30 — D-13 (issue #102), opção A:** medir primeiro. Efeito: a TS-11 mede; a TS-07 implementa somente se o ganho se confirmar.
- **2026-10-30 — D-14 (issue #102), opção A:** arquivar os cards legados #17 e #18 (arquivados, nunca apagados; as issues não são fechadas).
- **2026-10-30 — A-08 (issue #102), Feito:** o workflow do Project "Close issues when status changes" foi desligado.
- **2026-10-30 — D-15 e OW-14 (issue #102), resolvidas sem ação do dono:** a branch remota `backup/ops-15-before-history-fix` já foi apagada na limpeza de 2026-10-29, então não resta nada a decidir. Registrada como resolvida sem marcar a caixa em nome do dono.
- Registro mecânico sem gate do `@qa` (decisão do dono com a cota em 90%); o gate retroativo do `@qa` continua DEVIDO.

## Marcas do dono registradas em 2026-11-05 (issue #69, lidas em 2026-11-04)

- **D-04 (issue #69), registrada como opção A (adiar):** o dono marcou B ("aceitar após teste nativo bem-sucedido") antes de rodar qualquer teste e depois esclareceu que marcou antes de testar. Registrada como A pelo esclarecimento dele; a caixa dele na issue continua marcada como ele deixou. Efeito: a HD-03 segue pendente, a ação A-02 (rodar a matriz nativa do overlay) continua com o dono e nenhuma evidência de OBS/CEF nativo é afirmada.
- **D-05 (issue #69), opção B:** conseguir um Mac e validar antes do `rc`. Efeito: OW-07 fica Bloqueado até haver acesso a um Mac; nenhum resultado de macOS é afirmado.
- **D-06 (issue #69), opção A:** aguardar. Efeito: nenhum merge do PR #101 agora; o merge segue reservado ao dono e o Orion volta a perguntar quando o veredito final do `@qa` e a CI estiverem verdes.
- **D-07 (issue #69), opção A:** adiar. Efeito: nenhuma tag nem release da `v0.3.0-beta` até o fim do cutover e o merge do PR.

## Marcas do dono registradas em 2026-11-05 (issue #83)

- **D-08 (issue #83), opção A:** delegar o lugar do seletor de idioma ao plano de UX da FT-01 (o `@ux-design-expert` compara as opções e propõe com nota mínima 9,0). O dono marcou A sem carimbo; lida no corpo da issue em 2026-11-05. Efeito: OW-10 sai de Aguardando decisão para Concluído; nenhuma mudança de UI até o plano da FT-01 ser aprovado.

## Decisões do dono executadas em 2026-11-05 (release)
- **D-06 e D-07 (issue #69), executadas:** o PR #101 foi mesclado antes e, com a autorização do dono de 2026-11-05 (somente esta release), a pré-release `v0.3.0-0d0b595-beta` foi publicada pelo workflow de release depois dos PRs #111 (passo de empacotamento no Windows) e #112 (identidade do bot antes da tag anotada). Nenhuma ação de `rc` ou stable foi feita.
- **OW-18, dispensada pelo dono (2026-11-05):** a troca da fonte na cena deixou de ser exigida; o card está Concluído e arquivado, nunca apagado. Os agentes não tocaram em nenhum arquivo do OBS.
- **OWN-15 (leitor de tela), aceite de risco do dono (2026-11-05):** aceito sem validação. A **OW-06** passa a dizer "checada por agentes no navegador (OWN-16 a OWN-18 pendentes da FT-09); leitor de tela aceito sem validação". A caixa do checklist na issue #69 não é marcada, porque não houve validação.
- **OW-10, concluída:** D-08 = A (issue #83) registrada; o card está Concluído. A FT-63 continua aberta.
- **Limpeza de branches (dono, 2026-11-05):** `docs/post-cutover-docs`, `feat/ops-15-next-panel`, `fix/release-windows-installer`, `fix/release-tag-identity` e `legacy` foram apagadas (remoto e local) e dois backups locais foram apagados só localmente, depois da tag e dos PRs mesclados; sem reescrita de histórico (a auditoria achou a `origin/main` limpa). Nomes e SHAs ficam fora do repositório.

## Decisões do dono registradas em 2026-11-05/06 (OPS-31, fluxo da fila, OPS-32)

- **OPS-31 (issue #115), devolução por grupo, 2026-11-06:** a devolução só acontece ao terminar o atendimento (o resgate fica `UNFULFILLED` durante o atendimento e vira `CANCELED` ao concluir). Ao cancelar, pular ou marcar não compareceu, o streamer decide na hora se os pontos voltam. Um escopo OAuth por grupo ativado. Falha na consulta do grupo mostra "verificar grupo" e nunca devolve nem cumpre sozinha. Inscrito = pagos + presenteados + Prime, e o streamer conta como membro do grupo. Os pontos ficam retidos até o fim do atendimento, e o painel explica isso no próprio controle.
- **Fluxo da fila, 2026-11-06:** o `fulfill` continua ao iniciar o atendimento confirmado, para resgates normais.
- **OPS-32 (issue #117), calendário de ciclos da fila, 2026-11-06:** a fila reinicia sozinha para jogos conhecidos (o streamer escolhe o jogo e o servidor); ao escolher o jogo, o produto sugere filas e recompensas como presets editáveis, criados só depois da confirmação; a fila reiniciada vai para a guia "Filas antigas" por 7 dias; a política padrão para resgates pendentes depois dos 7 dias é definida pelo streamer em Configurações. Decisão pendente do dono: OD-32-1 (a OPS-32 entra na 0.4.0-beta ou depois; recomendado: depois), sem caixa marcada.
- **FT-09, 2026-11-06:** bloqueada só pela FT-06.
- **Leitor de tela, 2026-11-05/06:** risco aceito sem validação (ver OWN-15 acima).
- **`legacy`, 2026-11-06:** fica até o dono apagá-la ele mesmo (há um ruleset). Divergência: a limpeza de branches de 2026-11-05 acima a registra como apagada; em 2026-11-06 o remoto tem só a `main` e ainda existe uma branch `legacy` local. O `@devops` não mexeu em nenhuma branch.
- **OW-18** dispensada e **OW-10** concluída com D-08 = A (já registradas acima).
