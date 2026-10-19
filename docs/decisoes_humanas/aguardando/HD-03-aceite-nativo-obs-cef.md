# HD-03 — Resultado do proprietário para aceite nativo OBS/CEF

**Status:** Aguardando: não há execução nativa OBS/CEF nem aceite do proprietário registrado.
**English:** [HD-03 — Native OBS/CEF acceptance owner outcome](../../human_decisions/awaiting/HD-03-native-obs-cef-acceptance.md)

### HD-03 — Resultado do proprietário para aceite nativo OBS/CEF

**Status:** Pendente. Não há execução nativa OBS/CEF nem aceite do proprietário registrada neste checkpoint da migração.

| Opção | Escolha | Efeito |
| --- | --- | --- |
| A — Aceitar após teste nativo bem-sucedido | Executar a matriz do overlay da story no OBS Browser Source e registrar versões OBS/CEF, comportamento URL/capability, reload, resize, múltiplas fontes e recuperação de erro. | Fecha o aceite do proprietário somente para a revisão/plataforma testada; os outros gates da OPS-15 permanecem abertos. |
| B — Rejeitar com finding reproduzível | Registrar plataforma/versões e o caso da matriz que falhou, devolvendo o defeito para implementação. | Mantém o gate de aceite aberto enquanto uma incompatibilidade específica é corrigida e testada novamente. |
| **C — Adiar aceite (recomendada agora)** | Deixar o gate nativo Pendente até haver uma sessão real do OBS/CEF. | Impede que evidência somente de Chromium seja confundida com aceite nativo e mantém o cutover bloqueado. |

**Recomendação:** C neste checkpoint. O OBS documenta que o Browser Source é baseado em CEF, então o aceite nativo deve ocorrer dentro do próprio OBS. [Documentação Browser Source do OBS](https://obsproject.com/kb/browser-source).

**Seleção atual:** C até o teste nativo ser executado. Não precisa responder agora; escolha A ou B após revisar a evidência nativa registrada.
