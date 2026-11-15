# Roteiro do OBS nativo para o `@qa` (widget da OPS-25, `ping` ao vivo da D-8, D-6 ao vivo) — 2026-11-05

[English](../../../stories/OPS-25/obs-native-runbook.md)

Escopo: o OBS DESTA máquina (Linux), autorizado pelo proprietário. **Sem iniciar transmissão e sem resgate real** (isso exige o "pode transmitir" expresso do proprietário). Nunca escreva um link de widget em documento, log ou captura: ele é um link de capacidade. As classes de evidência continuam separadas (navegador automatizado, OBS/CEF nativo, Twitch ao vivo); nada é afirmado para Windows ou macOS. Um defeito encontrado vira história de bug própria; nenhuma correção entra aqui.

## 0. Antes de tudo

1. Confirme o checkout: `pwd`, `git rev-parse --show-toplevel`, `git branch --show-current`; registre `git rev-parse --short HEAD` e as versões do OBS e do CEF (OBS: Ajuda > Sobre).
2. Inicie o produto do jeito do projeto (`npm run dev` ou o Compose do produto); abra o painel local em `https://localhost:3000`. **Nunca transmita com `dev:start` (ou `npm run dev`).** Eles rodam o servidor de desenvolvimento (recarga automática, build de desenvolvimento, mais lento, sem endurecimento): use-os só para testes como este roteiro. Para transmitir ao vivo use o build de produção ou o Compose do produto.
3. **Confira o canal.** Painel > "Conexão Twitch": o canal conectado deve ser o **canal de testes** do proprietário, não o canal de produção. Se não for, pare e pergunte ao proprietário. Registre o nome de exibição do canal só nas notas da execução, nunca token nem ID.

## 0.1 Confiar na CA local dentro do OBS (decisão D-5 do proprietário, 2026-11-13)

O painel nunca pede para ignorar erros de certificado, e este roteiro também não: **sem desvio de certificado e sem fallback para HTTP** no OBS. A Browser Source (CEF) precisa confiar na CA local do produto, `localhost-ca.crt` (somente o certificado público; a chave privada fica no volume de segredos do Docker).

1. **Ache o arquivo da CA.** Compose ou instalador no Linux: `$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`. Instalador do Windows: `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt`. Checkout do repositório: `.local/localhost-ca.crt`. Se o volume foi removido, o bootstrap criou uma CA nova: importe o arquivo novo e remova a entrada antiga (veja a [instalação](../../INSTALACAO.md)).
2. **Confirme o sintoma primeiro.** Sem confiança, a Browser Source mostra `net::ERR_CERT_AUTHORITY_INVALID` (visto em 2026-10-06 e de novo em 2026-11-13). Confiar na CA no navegador comum (os comandos do [guia de instalação](../../INSTALACAO.md)) **não** faz o OBS confiar nela: o OBS tem o próprio Chromium (CEF) com repositório de certificados próprio.
3. **OBS nativo no Linux.** Importe `localhost-ca.crt` no repositório de certificados que o processo CEF do OBS lê. Em 2026-10-06 a CA foi importada num **perfil NSS temporário do CEF** (não no repositório comum do usuário) e removida depois; qual repositório o OBS lê por padrão, e o comando de importação, não foram registrados. Essa importação fez a fonte carregar em TLS 1.3 com estado de segurança `secure` (Ubuntu 24.04, OBS 32.2.2 Flathub, `obs-browser` 2.26.9, CEF 127.0.6533.120). **O comando exato de importação não foi registrado no repositório e não é reproduzido aqui; não adivinhe um.** A execução do `@qa` deve registrar o comando usado e a leitura do resultado.
4. **OBS Flatpak (`com.obsproject.Studio`).** O app roda em sandbox com home próprio (`~/.var/app/com.obsproject.Studio/`): importar no `$HOME` do host não o alcança. A evidência de 2026-10-06 foi no build Flathub; o local do repositório no sandbox não foi registrado. Não validado.
5. **Windows.** O guia de instalação importa a CA em `Cert:\CurrentUser\Root` com `Import-Certificate` (confiança do navegador). Se a Browser Source do OBS no Windows usa esse repositório **não foi validado**; nada é afirmado para o Windows.
6. **Verifique.** Reabra a Browser Source (ou reinicie o OBS). Passa: o widget carrega em HTTPS sem erro de certificado. Falha: qualquer erro de certificado; pare e registre, não contorne. Remova qualquer importação temporária que você tenha feito ao fim do teste.
7. **Não validado em 2026-11-13:** confiança TLS no OBS com a CA atual do Compose em qualquer plataforma (o harness de 2026-11-13 ignorou erros de certificado num daemon CDP; o repositório NSS do OBS estava vazio), local do repositório no Flatpak, Windows, macOS.

## 1. Obter os novos links dos widgets

Painel > "Widgets do OBS". Para o widget de conta use "Gerar link" (ou "Regenerar link" se já existir um; o anterior deixa de funcionar). O diálogo "Copie este link para o OBS" mostra o link uma única vez: use "Copie agora" e depois "Pronto, copiei o link". Ele não pode ser visto de novo; se perder, gere outro. Faça o mesmo para cada widget usado nas cenas.

**URL legada `/overlay.html`.** Cenas antigas podem ter uma Browser Source com URL `.../overlay.html?ref=...#...`. Esse alias foi removido na Onda 3 do cutover e não é mais servido: a rota do overlay é `/overlay?ref=<referência>#<capacidade>`. Troque toda fonte `/overlay.html` por um link novo gerado aqui (o link antigo não pode ser convertido). Existe widget de nome da fila (fonte "Nome de uma fila", `queue_name`): crie um por fila se a cena antiga mostrava o nome da fila.

## 2. Backup e edição da coleção de cenas do OBS (OBS FECHADO)

1. Feche o OBS por completo (confira que não sobrou processo `obs`).
2. Ache o diretório da coleção: normalmente `~/.config/obs-studio/basic/scenes/`; no OBS Flatpak é `~/.var/app/com.obsproject.Studio/config/obs-studio/basic/scenes/`. O nome da coleção ativa está em `../../global.ini` (`SceneCollection=`).
3. **Backup primeiro:** copie o `.json` da coleção (e o `.json.bak`, se houver) para um nome datado no mesmo diretório, por exemplo `<coleção>.json.pre-0.3.0-beta-backup`. Compare com `cmp`.
4. Edite somente o `settings.url` de cada entrada `"id": "browser_source"` cuja URL antiga aponte para o overlay do painel, trocando pelo link novo do passo 1. Não altere mais nada (tamanhos, filtros, outras fontes). Uma ferramenta que entenda JSON é mais segura que substituição de texto; valide que o arquivo continua válido (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <arquivo>`).
5. Reabra o OBS, carregue a coleção e confirme que a Browser Source aparece (não preta).
6. Reversão se algo parecer errado: feche o OBS e copie o backup sobre o arquivo da coleção.

## 3. Validação do widget (AC-W-1..5, com capturas)

Tire uma captura por estado (carregando, autorizado, desatualizado/indisponível, não autorizado) sobre cena transparente e escura, mais uma cena clara, e confira que a linha pequena de status fica DENTRO da caixa da fonte (risco 1 do UX: corte quando a altura da fonte é igual à altura do rótulo).

**Altura.** A linha de status do widget (por exemplo, "Atualização atrasada") é desenhada dentro da caixa do widget. Deixe a altura do widget, e a altura da fonte Navegador (Browser Source) do OBS, em pelo menos `ceil(tamanho da fonte x 1,4) + 20` px. Exemplo: fonte 32 precisa de 65 px. Com altura menor, o OBS corta a linha de status. O formulário do widget mostra esse mínimo para o tamanho de fonte escolhido.

| AC | Faça | Registre |
|---|---|---|
| AC-W-1 | Selecione a Browser Source, use "Atualizar" e depois "Atualizar cache da página atual". | O rótulo volta, sem tela preta nem erro de autorização; os segundos até aparecer (limite proposto de 5 s; o `@qa` fixa contra o primeiro carregamento). |
| AC-W-2 | Repita a atualização 10 vezes seguidas. | 10 de 10 rótulos. |
| AC-W-3 | Deixe a sessão do painel expirar (ou feche a aba do painel e espere expirar) e reinicie a API (reinício do `npm run dev` ou `docker compose restart` só do serviço do projeto); recarregue a fonte. | O mesmo link ainda mostra o rótulo. |
| AC-W-4 | Mude a conta atual **no painel**; não recarregue a fonte. | O rótulo acompanha dentro do polling documentado de 1 s; registre o atraso observado. (A via de chat `!fila conta` é a AC-W-8, pendente do OK do proprietário para uma mensagem real no chat.) |
| AC-W-5 | Revogue o widget no painel, recarregue a fonte, depois gere um link novo e atualize a fonte (repita o passo 2). | O estado seguro de não autorizado, sem rótulo e sem detalhes internos; o link novo funciona. |

Depois registre na story OPS-25 (en e pt-BR): versões do OBS e do CEF, data, commit e o TIPO de URL ("link de capacidade"), nunca o link (AC-W-7). O `@ux-design-expert` reavalia a AC-W-6 a partir das capturas em um adendo curto.

## 4. `ping` ao vivo (AC-D8-9, depende do proprietário)

Precisa do proprietário: uma mensagem real no chat do canal de testes (não precisa de transmissão, mas a decisão é dele). Com o proprietário presente, um moderador ou o streamer envia `!fila ping` (a palavra raiz segue o idioma do produto: `!queue ping` em inglês, `!cola ping` em espanhol).

- Esperado: `Pong 🏓 - v0.3.0-beta - <n>ms.` após o bump (antes dele, a versão não tem o trecho do commit, por exemplo `v0.2.1-beta`). Compare `<n>` com `twitch_api_ping_ms` de `GET https://localhost:3000/health` chamado em até 30 s (mesma medição compartilhada; devem ser iguais dentro da janela do cache).
- Forma de falha para tentar (opcional, com o proprietário): com a integração desconectada, a resposta é `Pong 🏓 - <versão> - sem medição da Twitch (TWITCH_NOT_CONNECTED).` (ou a forma do idioma).
- Registre os dois números, o horário e que o canal era o canal de testes.

## 5. D-6 ao vivo (diagnóstico, depende do proprietário)

Precisa do "pode transmitir" do proprietário. Transmita só com o build de produção ou o Compose do produto, nunca com `dev:start`. Sem ele, a D-6 continua "diagnosticável; causa raiz pendente de evidência ao vivo". Quando ele autorizar, inicie a transmissão e acompanhe o log JSON da API em busca de linhas com `event: "twitch_integration_degraded"` (e a antiga `twitch_reconciliation_degraded`) enquanto o `/health` mostra `twitch_integration: degraded`. A linha nomeia `details.reason` (`eventsub_disconnected`, `eventsub_startup_disconnected`, `subscription_revoked` com `type` e `revokeStatus`). Registre o motivo e a ordem das linhas; nunca cole texto de chat, tokens ou IDs. Um `degraded` silencioso (estado sem nenhuma dessas linhas) é, por si só, um achado a relatar.
