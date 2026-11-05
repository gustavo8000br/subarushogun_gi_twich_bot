# OPS-27 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-27/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-05 — **Modo:** YOLO (autônomo; decisões marcadas `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) (existe, criada pelo `@devops`).
**Fontes conferidas:** `.claude/rules/story-lifecycle.md` (10 pontos), `.aiox-core/development/tasks/validate-next-story.md`, `AGENTS.md` (regra "nunca expor a URL da sessão", 2026-10-29), [improvement-ideas-2026-11-04.md](../../process/improvement-ideas-2026-11-04.md) (ideia 5), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (régua de 9,5, ideia 5, AÇ-21..AÇ-26), [research-index.md](../../research-index.md), [qa-gate-2026-11-05.md](../OPS-15/qa-gate-2026-11-05.md) (pacote da OPS-22 commitado e enviado; o gate leu os CAs 1-10 da OPS-27), `.github/workflows/` (ci.yml, main-cd.yml, quality-gates.yml, release.yml: hoje não existem diretório de hooks nem `core.hooksPath`).
**Nota de escrita:** os padrões deste arquivo aparecem desarmados (`claude\.ai/`, o nome `Claude-Session` sem os dois-pontos), para que a futura verificação não o acuse.

## Veredito

**GO — 9,0/10.** Status: **Draft → Ready** (GO + issue #104). Ready significa "validada para planejamento"; os gates de fatia da story (`@architect`, plano do `@qa`, revisão do workflow pelo `@devops`) continuam valendo antes de o `@dev` começar. O gate de UX **não se aplica** (confirmado: só voltado a quem desenvolve, sem tela e sem texto para a pessoa usuária; as linhas de saída são regidas pelo CA 11).

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | Nomeia o objeto (vazamento de dados sensíveis) e as quatro superfícies. |
| 2 | Descrição completa | 1,0 | Incidente (URL de sessão em 45 commits de um repositório público), proteção só em texto, custo de recuperação, problema dos falsos positivos. |
| 3 | CAs testáveis | 1,0 | 11 CAs Given/When/Then; classe de evidência por CA (unidade, Git real em repositório temporário, CI); a saída nunca repete o valor; CA 7 mutação manual por regra; CA 11 falha fechada com códigos de saída distintos. |
| 4 | Escopo DENTRO/FORA | 1,0 | Duas fatias ordenadas (FT-45, FT-46); FORA lista reescrita de histórico, force push, rotação, escâneres de terceiros, configurações do repositório, regras da OPS-28, texto do `AGENTS.md`, bump/commit/push/PR. |
| 5 | Dependências | 1,0 | Pacote da OPS-22 commitado (atendida); serialização de workflow com OPS-29/OPS-30; propriedade frente à OPS-28; linguagem do script (OPS-24); semente da allowlist como dado. |
| 6 | Complexidade | 1,0 | 12 STANDARD, dificuldade M, prioridade P1 com motivo registrado; o `@architect` confirma. |
| 7 | Valor de negócio | 1,0 | O vazamento para no commit ou no PR, em vez de parar numa reescrita de histórico público. |
| 8 | Riscos | 0,5 | Seis riscos cobrem falsos positivos, `--no-verify`, eco do valor, injeção pelo corpo, custo de regex, conflitos de workflow. **Falta: falso negativo** (correção 1). |
| 9 | Definition of Done | 1,0 | CAs 1-11 por classe; parte de CI executada ou registrada como pendente; gates verdes; veredito do `@qa` e atestado de 9,5. |
| 10 | Alinhamento com fontes e decisões do proprietário | 0,5 | Bate com o pedido do proprietário (2026-11-04), o levantamento e a regra do `AGENTS.md`. Deduções: os critérios de saída da régua ainda dizem "CAs 1 a 10" (a story tem 11) e o intervalo da linha de base não está fixado (correções 2 e 3). |

## Conferências pedidas, na ordem

1. **CAs testáveis e sem invenção.** Todo requisito tem fonte: o host de sessão, o nome do trailer e as quatro superfícies vêm do incidente de 2026-10-29 e da regra do `AGENTS.md` (que cita commits, inclusive o trailer, corpos de PR, corpos de issue e arquivos); as famílias de credencial (regra c) vêm da ideia 5 do levantamento ("tokens") e do pedido do proprietário de 2026-11-04, **não** do texto do `AGENTS.md`. `[AUTO-DECISION]` Aceitar a regra (c) como escopo (motivo: está na ideia pedida pelo proprietário e na dimensão C da régua; a story proíbe o `@dev` de inventar formatos e atribui a lista ao `@architect`, a partir da documentação pública dos provedores). Nada mais é inventado.
2. **FT-45 e FT-46 independentes, com Red/Green.** A FT-45 (função pura, hooks, allowlist, execução manual, CAs 1, 2, 3, 7, 11) é entregável e testável sozinha. A FT-46 (job de CI, corpo como dado, passo de pré-envio da issue, linha de base, CAs 4, 5, 6, 8) precisa do script da FT-45, que é a ordem declarada, não um acoplamento escondido. Cada fatia tem Red escrito primeiro e coluna de proteção. O mapa de CAs por fatia está completo (CA 9 e 10 são transversais). PASS.
3. **Proprietário versus `@dev`.** Separado corretamente em "Dependências do proprietário": texto da regra no `AGENTS.md`/`CLAUDE.md` (agentes só propõem), configurações do repositório (proteção de push, check obrigatório, regras de branch; opcionais, a story funciona sem elas), credencial real achada pela linha de base (a story para e relata; rotação, reescrita de histórico e force push são do proprietário), merge/tag/release. A execução no evento `issues` é técnica, salvo se exigir permissão ou segredo novo. O resto (script, hooks, testes, documentação, rascunho do workflow) é do `@dev`, com o workflow revisado pelo `@devops`. PASS.
4. **Meta 9,5 mensurável.** A régua (quatro dimensões, média >= 9,5, nenhuma abaixo de 9,0, só o `@qa` atesta) é objetiva e cada dimensão tem critério de saída observável na story e na tabela da ideia 5. Nenhuma parte depende do proprietário. PASS, com a correção 2.
5. **Falsos positivos e falsos negativos.** Falsos positivos: cobertos (linha de base CA 6, allowlist testada CA 2, motivo por entrada CA 11, lista semente). **Falsos negativos não estão cobertos** por nenhum risco ou CA: formatos novos de token, variações de URL (`http://`, sem barra final, maiúsculas, codificação percentual ou texto quebrado), outros hosts que a regra do `AGENTS.md` também cita (links de compartilhamento) e texto fora das quatro superfícies (memórias de agentes são arquivos, então estão cobertas; comentários em issues estão fora por regra do projeto). Não é motivo de NO-GO: o CA 3 (um positivo por família listada pelo `@architect`) e o CA 7 (mutação por regra) limitam os padrões listados; mas o limite precisa ser escrito (correção 1) e os casos de padrão decididos pelo `@architect`.
6. **Dependência de pesquisa.** O `research-index.md` não tem nota sobre formatos de credencial ou token nem sobre mecanismos de hook do Git: é uma **LACUNA**, como a story prevê ("só se aparecer uma LACUNA de formato de token"). `[AUTO-DECISION]` Tratar como lacuna estreita e não bloqueante, a fechar na AÇ-22: a lista de padrões precisa de fontes da documentação pública dos provedores, reunidas pelo `@architect` (que tem internet) ou pelo `@analyst` antes de a lista ser escrita; o `@dev` nunca inventa um formato. Se o arquiteto listar apenas formatos já documentados em fonte citada, não é preciso nova nota do `@analyst`.

## Correções exigidas (para o `@sm`, en e pt-BR; nenhuma bloqueia o início do desenho)

1. **Acrescentar o Risco 7 — falsos negativos** (vazamento que os padrões não reconhecem). Mitigação a escrever: a lista de padrões é versionada com uma fonte por família; as decisões sobre maiúsculas/minúsculas, variações de URL e textos codificados são fixadas pelo `@architect` e têm fixtures positivas; a documentação diz que a verificação é uma barreira, não prova de ausência, e como acrescentar um padrão (CA 9). Manter a lista de CAs, salvo se o `@architect` pedir um teste de variação (então entra no CA 3).
2. **Corrigir os critérios de saída da régua** em [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (linha 176 do arquivo en e do gêmeo pt-BR): "CAs 1 a 10 da OPS-27" passa a "CAs 1 a 11" (o CA 11 entrou em 2026-11-05).
3. **Fixar o intervalo da linha de base no CA 6**: o intervalo é o do pull request (`origin/main..HEAD`), não o histórico inteiro nem branches de backup locais; achados no histórico antigo já enviado ou em backups locais são relatados ao orquestrador e tratados pelo processo reservado ao proprietário, nunca "corrigidos" pela story. (O gate do `@qa` de 2026-11-05 registrou zero ocorrências em `origin/main..HEAD`.)
4. **Registrar a LACUNA** (item 6 acima) na caixa "Gates de planejamento" para `@analyst`/`@architect`, com a linha da regra de ouro: "sem pesquisa nova, salvo se o arquiteto não puder citar fonte pública para uma família".

## Condições para os gates

- `@architect` (AÇ-22): lista de padrões com fonte pública e um positivo e um negativo parecido por família; maiúsculas/minúsculas e variações de URL do host de sessão; códigos de saída (rejeição versus erro interno, CA 11); limite de tamanho; formato da allowlist com motivo obrigatório; como os corpos são passados como dado; propriedade frente à OPS-28 (esta verificação cobre commits, corpos e todos os arquivos versionados; o OpenGrep cobre construções de código, sem lista duplicada).
- `@devops`: revisa a edição do workflow e a serializa com OPS-29/OPS-30; cria ou edita corpos de issue só depois que o passo de pré-envio existir (passo documentado). Nunca comenta em issues.
- `@qa`: plano de testes com vazamentos plantados por superfície e uma mutação manual por regra; atesta o 9,5 somente com a régua.
- Lembrete: a atribuição automática do framework pode oferecer acrescentar um trailer de sessão a commits e PRs; a regra do `AGENTS.md` manda ignorá-la. Esta story existe para tornar esse "ignorar" automático.

## Prontidão das fatias

| Fatia | Pode ir ao `@dev` agora? | Gates restantes |
|---|---|---|
| FT-45 (núcleo da verificação e hook local; CAs 1, 2, 3, 7, 11) | NÃO — desenho primeiro | Desenho do `@architect` (AÇ-22), plano do `@qa` (AÇ-23), correções 1-4 pelo `@sm` |
| FT-46 (job de CI e verificação dos corpos; CAs 4, 5, 6, 8) | NÃO — depois da FT-45 | FT-45 integrada, revisão do workflow pelo `@devops`, serialização com OPS-29/OPS-30 |

## Status final

Draft → **Ready** (GO 9,0/10, issue #104). Registrado no Change Log da story, na caixa de gates de planejamento e no índice de stories (en e pt-BR).
