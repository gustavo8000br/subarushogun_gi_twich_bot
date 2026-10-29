# OPS-25 — Validar o widget da conta no overlay do painel Next (substitui a validação do bug OPS-13 / #57)

[English](../../../stories/OPS-25/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-10-27; ainda não validada pelo `@po`). **Issue:** pendente (o `@devops` cria quando a story ficar pronta; a issue [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) continua aberta até lá; sem comentários em issues).
**Origem:** observação do proprietário em 2026-10-27: o bug de recarga do widget da conta que acontecia no overlay do OBS do painel vanilla (issue #57, story [OPS-13](../OPS-13/story.md)) **parece não ocorrer** no overlay do painel Next; decisão do proprietário: **não** fechar a #57, validar antes o comportamento no overlay Next; o card da OPS-13/#57 no quadro foi movido para "Rascunho" pelo proprietário.
**Relacionadas:** OPS-13 (o bug original e a evidência do OBS 32.2.2 no Linux); OPS-15 (overlay Next; a onda 3 do cutover / FT-39 remove o overlay vanilla); OPS-18 (Conta atual como overlay único de identidade do jogador); OPS-11 (propriedade da conta, também citada pela #57); handoffs de outras plataformas: [Windows](../../handoffs/windows-session-handoff.md), [macOS](../../handoffs/macos-session-handoff.md), [continuação do overlay Next](../../handoffs/next-overlay-continuation.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-qa` independente (executa a validação), `$aiox-ux-design-expert` (revisa a experiência e a acessibilidade dos estados do widget, nota >= 9,0 no escopo revisado), `$aiox-devops` (issue). Não há trabalho de `$aiox-dev` previsto: esta story valida; um defeito encontrado vira uma story de bug própria.

## Problema

A issue #57 foi reaberta depois que o proprietário viu uma tela preta no OBS nativo ao recarregar a Fonte de Navegador do widget da conta (commit `e25836c`, overlay vanilla). A execução no OBS 32.2.2 do Linux passou (CEF 127), então o ambiente do proprietário nunca foi comprovado. Desde então o overlay do OBS passou para o painel Next (OPS-15) e o overlay vanilla está sendo removido (onda 3 do cutover, FT-39). Depois dessa remoção o cenário que falhava não pode mais ser reproduzido no overlay vanilla; o único alvo reproduzível é o overlay Next. O bug parece não ocorrer ali, mas "parece" não é evidência: nada registrado prova que o overlay Next mantém o rótulo da conta após recarregar a Fonte de Navegador, sem expiração e com mudanças de conta.

## Decisões do proprietário (2026-10-27)

1. A #57 **não** é fechada agora; esta story de validação substitui a validação do bug da OPS-13 e é a condição para fechá-la.
2. A story começa só depois da **migração completa do painel** (OPS-15, ST-01) e da **redução drástica das tarefas do quadro**; o proprietário espera que seja feita provavelmente só depois de ambas.
3. O `@qa` executa; o `@ux-design-expert` revisa a experiência e a acessibilidade com nota de pelo menos 9,0 no escopo revisado.

## Story

Como pessoa que mostra a conta atual no OBS,
quero a prova de que o widget da conta do overlay Next sobrevive à recarga da Fonte de Navegador, nunca expira sozinho e acompanha mudanças de conta feitas pelo chat ou pelo painel,
para confiar no overlay durante a transmissão e poder fechar a issue #57 com evidência em vez de impressão.

## Escopo

**Dentro:**

- Reproduzir, no overlay Next, o cenário que falhava no overlay vanilla: recarregar a Fonte de Navegador no OBS e conferir o rótulo da conta.
- Verificar ausência de expiração, mudança de conta pelo chat (`!fila conta`) e pelo painel, revogação do widget e o estado seguro mostrado quando o widget não está autorizado.
- Executar no OBS nativo no Linux (registrar as versões do OBS e do CEF); Windows e macOS depois, a partir dos handoffs de cada plataforma.
- Revisão do `@ux-design-expert` dos estados do widget (carregando, rótulo autorizado, não autorizado) quanto a legibilidade e acessibilidade.

**Fora:**

- Qualquer mudança de código no overlay ou no widget (um defeito encontrado aqui vira story de bug separada; nenhuma correção é misturada a esta validação).
- Reexecutar o overlay vanilla (removido na FT-39; a falha original fica registrada como evidência histórica em `e25836c`).
- Plugins do OBS, desenho de cena ou qualquer recurso novo de widget.
- Fechar a #57 (só o `@devops`, só com o OK explícito do proprietário após o veredito).

## Critérios de aceite

As classes de evidência são registradas separadamente: navegador automatizado (fixtures), OBS/CEF nativo e por plataforma. Nada sobre uma plataforma é afirmado antes de ela rodar.

1. **Dado** o overlay Next com o link do widget da conta adicionado como Fonte de Navegador no OBS nativo (Linux), **quando** a fonte é recarregada (botão de atualizar e "atualizar o cache da página atual"), **então** o rótulo da Conta atual volta a aparecer, sem tela preta e sem erro de autorização. O tempo medido até o rótulo aparecer é registrado (propõe-se uma meta de até 5 s; o `@qa` confirma contra o primeiro carregamento).
2. **Dado** a mesma fonte, **quando** ela é recarregada 10 vezes seguidas, **então** toda recarga mostra o rótulo.
3. **Dado** o link do widget emitido antes, **quando** a sessão do painel expirou e depois que a API reinicia, **então** uma recarga ainda mostra o rótulo: o widget não expira sozinho e só deixa de funcionar quando o operador o revoga.
4. **Dado** o rótulo na tela, **quando** a conta atual muda pelo comando de chat `!fila conta`, **então** o rótulo mostra a nova conta sem recarregar, em poucos segundos após a mudança, com base na cadência documentada (o renderer lê `/overlay/api/widget` uma vez por segundo com `no-store`: `apps/shared/panel/overlay-renderer.mjs:176` define o intervalo de 1000 ms e `:129` define `cache: 'no-store'`; não existe cache de 5 s); o atraso observado é registrado e o `@qa` fixa o limite exato no seu plano de execução.
5. **Dado** o rótulo na tela, **quando** a conta atual muda no painel, **então** vale o mesmo resultado do CA 4.
6. **Dado** que o operador revoga o widget, **quando** a fonte é recarregada, **então** o overlay mostra o estado seguro de não autorizado (sem rótulo de conta, sem detalhes internos) e um link novo funciona após reemissão.
7. **Dado** o widget carregando, autorizado e não autorizado, **quando** o `@ux-design-expert` revisa esses estados, **então** o rótulo é legível sobre fundo transparente e sobre fundo escuro, o estado não autorizado é compreensível sem texto técnico e a nota é de pelo menos 9,0 no escopo revisado. O registro diz o que a revisão cobre (revisão estática versus validação visual, de navegador e de tecnologia assistiva).
8. **Dado** a evidência dos CA 1-6 no Linux, **então** versões do OBS e do CEF, data, commit e o tipo de URL do overlay Next (link de capacidade, sem segredo no registro) ficam escritos nesta story, em inglês e pt-BR.
9. **Dado** que sessões em Windows e macOS fiquem disponíveis (handoffs acima), **quando** os CA 1-6 rodarem nelas, **então** cada resultado de plataforma é registrado separadamente; até lá essas linhas ficam "pendente de plataforma" e nunca são inferidas do Linux.
10. **Dado** que todos os CA passam, **então** o `@qa` emite o veredito e o proprietário decide sobre fechar a #57 (o `@devops` a fecha e edita o corpo principal da issue). **Dado** que algum CA falha, **então** uma story de bug é criada, a OPS-13 é reconsiderada e a #57 continua aberta.

## Dependências

- **Depende de:** ST-01 (migração completa da OPS-15, incluindo a onda 3 do cutover / FT-39 e o overlay Next como único overlay); a redução drástica das tarefas do quadro (decisão do proprietário; provavelmente só depois); OPS-18 (projeção da conta) liberada; um OBS nativo na máquina de teste; os handoffs de plataforma para o CA 9.
- **Bloqueia:** o fechamento da issue #57 e o status final da OPS-13.

## Riscos

- **Passagem em fixture ou navegador tomada como evidência de OBS:** o comportamento do CEF difere do Chromium. Mitigação: os CA 1-6 exigem OBS nativo; execuções de navegador são outra classe.
- **Linux não é o ambiente do proprietário:** a falha original foi vista na máquina do proprietário. Mitigação: CA 9 e linha pendente de plataforma; não fechar a #57 só com evidência de Linux (coerente com a decisão anterior).
- **Linha de base removida:** depois da FT-39 o cenário que falhava não pode ser reexecutado. Mitigação: manter o registro de `e25836c` como linha de base histórica e comparar comportamento, não código.
- **Espera longa:** a story depende de uma migração grande; o bug pode ser esquecido. Mitigação: o card existe no quadro (Bloqueado pela ST-01) e a #57 continua aberta.

## Complexidade (estimativa do `@sm`)

Escopo 2, integração 2, infraestrutura 1, conhecimento 2, risco 2 = **9 → STANDARD**. Dificuldade **M** (várias sessões com OBS nativo e uma revisão de UX), prioridade **P2**.

## Valor de negócio

Fecha uma issue antiga com evidência, protege o overlay durante a transmissão e remove a dúvida deixada pela troca do overlay do painel vanilla para o Next.

## Plano de testes

1. **Navegador (Chromium, fixtures, sem Twitch):** estados do overlay e projeção da mudança de conta, só como evidência de apoio.
2. **OBS/CEF nativo (Linux agora; Windows e macOS depois):** CA 1-6 executados pelo `@qa` com autorização do proprietário para qualquer passo ao vivo; versões registradas.
3. **Revisão de UX:** `@ux-design-expert` no CA 7.
4. **Gates antes de fechar:** os gates de documentação exigidos pelo projeto para mudança só de documentação (`npm run validate:version`, `npm run review:static`); o `@qa` emite o veredito.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] O `@devops` cria a issue do GitHub quando a story ficar pronta (a #57 continua aberta até lá).
- [ ] Plano de revisão do `@ux-design-expert` para os estados do widget, nota >= 9,0 no escopo revisado.
- [ ] Plano de execução do `@qa` no OBS nativo (Linux agora; Windows e macOS quando houver sessões).
- [ ] ST-01 concluída e redução das tarefas do quadro feita (dependência do proprietário).

## Nota de UX

O widget não recebe desenho novo aqui. A revisão cobre só os estados existentes. Uma mudança de texto ou de layout julgada necessária vira story separada com plano de UX próprio (>= 9,0).

## Definição de pronto

- Os CA 1-8 e 10 têm evidência registrada por classe; as linhas do CA 9 estão executadas ou marcadas explicitamente como "pendente de plataforma" com o aceite do proprietário.
- Veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR; a decisão do proprietário sobre a #57 registrada.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-10-27)

1. Objetivo e contexto: claros (histórico do bug, por que uma story de validação). PASS.
2. Orientação técnica: sem mudança de código; plataformas, ferramentas e handoffs nomeados. PASS.
3. Referências: OPS-13, #57, handoffs e o commit da falha original. PASS.
4. Autossuficiência: linha de base, premissas e o risco da linha de base removida declarados. PASS.
5. Testes: classes de evidência separadas; OBS nativo exigido. PASS.
6. Análise estática: story só de documentação; `npm run review:static` listado nos gates. PASS.
- Resultado: pronta para o `@po`. A meta de 5 s do CA 1 é uma proposta marcada como tal; o CA 4 usa o polling documentado de um segundo (corrigido após a validação do `@po`); nenhum outro requisito foi inventado.

## File List

- `docs/stories/OPS-25/story.md` (nova)
- `docs/pt-BR/stories/OPS-25/story.md` (nova)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)

## Change Log

- 2026-10-27 — `@sm` (River): story redigida a partir da observação do proprietário de que o bug de recarga da OPS-13 / #57 parece não ocorrer no overlay Next. Status Draft. Issue pendente.
- 2026-10-28 — `@sm` (River): aplicada a correção obrigatória 1 do `@po`. O CA 4 não cita mais "cache de 5 s" (nenhuma fonte o sustenta); agora indica o polling documentado de um segundo com `no-store` em `/overlay/api/widget` (CA 3 da OPS-15, OPS-18) e deixa o limite exato para o plano de execução do `@qa`. Status inalterado (Draft; o status é do `@po`).
- 2026-10-28 — `@sm` (River): evidência do CA 4 corrigida. A citação da OPS-18 para o polling de um segundo não se sustentava (a OPS-18 não declara intervalo); o CA agora cita a fonte real, `apps/shared/panel/overlay-renderer.mjs:176` (intervalo de 1000 ms) e `:129` (`cache: 'no-store'`). Redação do CA inalterada no restante. Status inalterado (Draft).
