# Testes instáveis sob carga (registro, 2026-11-19)

Status: **registro aberto, sem correção ainda.** A decisão de abrir story/issue é do `@sm`/`@devops` (o quadro e as issues não são editados aqui). Cópia em inglês: [`docs/process/flaky-tests-2026-11.md`](../../process/flaky-tests-2026-11.md).

| Teste | Sintoma | Onde foi observado | Frequência observada |
|---|---|---|---|
| `tests/unit/next-queue-lifecycle-recovery.test.jsx`, "maps the API cancellation conflict into safe UI feedback" | `expected 'null' to contain 'panel.queue.delete.cancel.processing'` | bateria completa do `@qa` no pacote do fluxo de pesquisa (2026-11-18, execução de 333 s, 231/232 arquivos); CI da PR #148 | 1 falha nessa execução completa; o arquivo passou 3/3 quando reexecutado sozinho. Ocorrência no CI informada pelo orquestrador (não reverificada aqui) |
| `compose-widgets-overlay-revoke` (integração com Chromium) | timeout de etapa do Chromium | CI da PR #148 | informado pelo orquestrador, 1 ocorrência (não reverificada aqui) |

## Hipótese (não comprovada)

- Os dois falham só sob carga da bateria completa ou do CI, nunca isolados: a asserção compete com um estado assíncrono de UI/rede (o feedback de cancelamento pendente aparece depois) e uma espera fixa ou curta demais perde a janela em um worker lento.
- O caso do Chromium é timeout, compatível com runner carregado e não com erro de lógica.
- Trabalho anterior relacionado: TS-15 (teste instável de exclusão de fila no Chromium, corrigido em `0644cec`, PR #101) e TS-22 (`compose-runtime.test.js:1022`) em [`backlog-inventory.md`](backlog-inventory.md).

## Próximo passo (quando agendado)

1. Reproduzir com a bateria completa sob carga de CPU (não isolado) e registrar a taxa de falha em um número fixo de execuções.
2. Trocar a espera fixa pela espera do estado observável (`findBy*` / `waitFor` no elemento de feedback, ou `waitForResponse` na chamada de rede), test-first, sem enfraquecer a asserção.
3. Não pular nem afrouxar os testes enquanto isso; falha causada por essa instabilidade é reexecutada pelo `@qa` e relatada, nunca dispensada em silêncio.
