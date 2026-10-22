# OPS-15 — Plano para Windows nativo e checklist de aceite do proprietário

[English](../../../stories/OPS-15/windows-native-plan.md)

**Status:** Planejado e parcialmente programado no Ubuntu, 2026-10-21. **Nenhum resultado em Windows é alegado aqui.** O teste de usuário final no Windows é do proprietário e deve passar antes de ele aceitar a publicação do release beta de usuário final.

## O que já existe (inspecionado no código, não reexecutado no Windows neste ciclo)

| Área | Comportamento ciente de Windows | Evidência |
|---|---|---|
| Instalador do produto | `subarushogun_twich_bot_setup.bat` embute o `installer.ps1` em Base64 UTF-16LE, então os acentos de pt-BR/es sobrevivem ao Windows PowerShell 5.1 | `apps/infra/scripts/package-installer.mjs`; job de CI “Native windows installer smoke” (`windows-latest`, Docker falso) |
| Bootstrap de TLS | O OpenSSL é localizado fora do `PATH` (`usr/bin` do Git for Windows) em `win32` | `tests/unit/bootstrap-secret.test.js` |
| Launcher de dev | `npm run dev` inicia `process.execPath` (sem shell nem shims `.cmd`), fixa Node 24.20.0, verifica Docker Compose/Engine e aceita um `DATABASE_URL` explícito que dispensa o Docker | `apps/frontend/scripts/dev-*.mjs`; novo `tests/unit/windows-native-contract.test.js` |
| Modos de arquivo | As asserções de permissão POSIX são puladas em `win32` | testes unitários existentes |

## Programado neste ciclo

- `.gitattributes`: LF para texto e CRLF para `.bat`/`.cmd` e `*.ps1 eol=crlf` para scripts PowerShell (decisão do proprietário; sem `text`, para que `text=auto` não renormalize arquivos já gravados com CRLF), para que um clone no Windows com `core.autocrlf=true` não corrompa scripts shell, YAML, migrations SQL (checksums do Prisma) nem o Dockerfile.
- `tests/unit/windows-native-contract.test.js` (5 testes, passando no Linux): caminho de checkout no estilo Windows → nome de projeto Compose válido; mensagem acionável do Docker Desktop; `DATABASE_URL` dispensa o Docker; política de fim de linha.

## Riscos conhecidos e trabalho planejado (ainda não feito)

1. **Colisão de nome do projeto Compose.** `getDevelopmentComposeProject` mantém só os últimos 28 caracteres do caminho do checkout; dois checkouts com a mesma terminação (por exemplo `/home/a/queue-bot` e `/srv/b/queue-bot`, em qualquer sistema operacional) compartilham o mesmo projeto/volume de dev. **Resolvido (aprovado pelo proprietário em 2026-10-21):** o nome padrão não mudou, então os bancos de dev existentes continuam vinculados; um override opcional `DEV_COMPOSE_PROJECT` (letras minúsculas, dígitos, `-`, `_`; 1–63 caracteres) agora separa esses checkouts. Testes em `tests/unit/windows-native-contract.test.js`.
2. **Proteção dos arquivos de segredo.** Os modos `0o600/0o400` não são aplicados pelo NTFS; o Windows depende da ACL do perfil do usuário. Planejado: documentar e avaliar reforço com `icacls` para `.local/dev-db/password` e a chave TLS.
3. **Ctrl+C no Windows.** `child.kill('SIGINT')` encerra Next e Fastify de forma abrupta (sem drenagem graciosa). Aceitável em desenvolvimento; verificar que não sobra `node.exe` órfão.
4. **CI.** Um job `windows-latest` com `npm ci`, lint, typecheck e `tests/unit` foi adiado por decisão do proprietário (2026-10-21) para depois da migração do painel; o `@devops` o adiciona quando o release beta estiver sendo preparado.
5. **Execução real do instalador com Docker.** Instalação limpa, atualização in-place, desinstalação e preservação de dados contra o Docker Desktop real no Windows continuam sem prova (o smoke de CI usa Docker falso).
6. **Browser Source do OBS no Windows** (versões de OBS/CEF, transparência, redimensionar/recarregar, várias fontes).

## Checklist de aceite do proprietário (execute antes de aceitar o release beta)

Ambiente: Windows 10/11 64 bits, Docker Desktop com backend WSL 2 em execução, perfil de usuário limpo ou máquina/VM Windows descartável, o instalador beta exato gerado pelo workflow de release. Registre build do Windows, versão do Docker Desktop, versão do OBS e versão do instalador.

- [ ] **Instalação limpa.** Execute `subarushogun_twich_bot_setup.bat`; anote o comportamento do SmartScreen/antivírus; escolha idioma e porta; o painel abre em `https://localhost:<porta>`; a saúde é `ok`; nenhum dado da Twitch é necessário.
- [ ] **Certificado.** Importar a CA gerada (conforme o guia de instalação) remove o aviso do navegador; a URL de callback `https://localhost:<porta>/callback` responde.
- [ ] **Smoke do painel.** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` abrem por URL direta e por atualização; a troca de idioma persiste; crie uma fila manual e adicione/chame/conclua uma entrada.
- [ ] **Persistência.** Reinicie o Windows (ou o Docker Desktop); o produto volta com a mesma fila e os mesmos dados.
- [ ] **Atualização in-place.** Rode Atualizar no instalador com uma imagem mais nova: dados e segredos preservados, URL do painel inalterada.
- [ ] **Desinstalação.** Desinstale mantendo os dados, reinstale e confirme que os dados voltam; depois desinstale removendo os dados e confirme que containers, rede e volumes do produto sumiram, sem tocar em outros projetos Docker.
- [ ] **Overlay no OBS.** Adicione a URL do overlay como Browser Source no OBS do Windows; fundo transparente, atualizações em cerca de 2 segundos, recuperação ao redimensionar/recarregar, duas fontes ao mesmo tempo.
- [ ] **Twitch.** Com um canal de teste: conectar OAuth, criação de recompensa/estado pendente, um resgate real até chamar e concluir (somente se você aceitar usar uma conta real).
- [ ] **Caminho de desenvolvedor (opcional).** `npm ci`, `npm run dev` com Node 24.20.0 e OpenSSL do Git for Windows; Ctrl+C não deixa `node.exe` solto.

Marque cada item como Aprovado/Reprovado com notas; qualquer Reprovado bloqueia o aceite do release e reabre o critério correspondente da OPS-15.
