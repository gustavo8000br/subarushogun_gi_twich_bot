# Handoff — sessão do Claude Code no Windows

[English](../../handoffs/windows-session-handoff.md)

**Objetivo:** handoff exclusivo da futura sessão do Claude Code que o proprietário rodará no **Windows** (anunciada em 2026-10-27) para automatizar as verificações multiplataforma. O Orion (`@aiox-master`) mantém este arquivo atualizado sempre que o plano, os scripts ou os resultados mudarem. A sessão do macOS tem arquivo próprio: `macos-session-handoff.md`. Última atualização: 2026-10-27.

## Regras de ouro
1. **Ative o Orion primeiro** e leia `AGENTS.md`, `CLAUDE.md`, `docs/session-handoff.md` (+ pt-BR) e este arquivo. Mesmos papéis: `@dev` implementa com teste primeiro, `@qa` valida de forma independente, `@devops` comita; push, PR, tag, bump de versão e release exigem o OK expresso do proprietário.
2. **Nunca alegue um resultado que você não rodou no Windows.** Todo relatório informa a versão do SO, a arquitetura, o Node, o Docker Desktop e como foi executado. Resultados do Ubuntu não valem aqui.
3. Trabalhe só dentro do diretório do projeto; sem segredos em logs ou relatórios (tokens, links de widget com `ref=`, senhas, connection strings).
4. O produto está em **beta sem usuários ativos**: mudanças estruturais são seguras até o rc/stable; sem shims de compatibilidade.
5. Use banco e recursos Docker descartáveis; confira projeto Compose, rótulos e dono antes de remover qualquer coisa.
6. O Orion nunca edita o quadro do Project #5; o `@devops` sincroniza a cada evento (o que o proprietário mover prevalece).

## Estado do projeto (2026-10-27)
Branch `feat/ops-15-next-panel`; Node `24.20.0` (`.nvmrc`); painel Next.js + API Fastify + PostgreSQL (Compose). Validado só no **Ubuntu Linux** (165 arquivos / 1.621 testes verdes, OpenGrep 0 achados, E2E do link de widget no Chrome, bateria real da Twitch parcial). O painel vanilla está sendo cortado por ondas (`docs/stories/OPS-15/cutover-plan.md`); a branch `legacy` o preserva.

## Checklist (fonte: `docs/stories/OPS-15/windows-native-plan.md`; backlog OW-01…OW-04)
Transforme cada item em verificação com script quando der; itens manuais ficam como passos do proprietário com modelo de evidência.
- [ ] **Instalação limpa:** rode `subarushogun_twich_bot_setup.bat`; anote SmartScreen/antivírus; escolha idioma e porta; o painel abre em `https://localhost:<porta>`.
- [ ] **Certificado:** importe a CA gerada conforme o guia de instalação; o aviso do navegador some; `https://localhost:<porta>/callback` é alcançável.
- [ ] **Smoke do painel:** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` por URL direta e refresh; a troca de idioma persiste; criar uma fila.
- [ ] **Persistência:** reinicie o Windows ou o Docker Desktop; a mesma fila e os mesmos dados voltam.
- [ ] **Atualização no lugar:** o Update do instalador com imagem mais nova preserva dados, segredos e URL.
- [ ] **Desinstalação:** manter dados e reinstalar devolve os dados; remover dados apaga só containers, rede e volumes deste projeto.
- [ ] **Overlay no OBS:** Browser Source do OBS no Windows com a URL do overlay; fundo transparente, atualizações ao vivo, recuperação ao redimensionar/recarregar, confiança no certificado (o override de `HOME` do Flatpak do Linux não se aplica).
- [ ] **Twitch (canal do proprietário, com OK dele):** OAuth, criação de recompensa, um resgate real até chamar e concluir, exclusão da fila sem operações pendentes (veja a OPS-22).
- [ ] **Caminho de desenvolvedor:** `npm ci`, `npm run dev` / `dev:start` / `dev:stop` no Node 24.20.0 com o OpenSSL do Git for Windows; Ctrl+C não deixa `node.exe` solto.
- [ ] **Testes de contrato do Windows:** `tests/unit/windows-native-contract.test.js` (caminho → nome do projeto Compose, orientação do Docker Desktop, `DATABASE_URL` dispensa o Docker, `.gitattributes` LF exceto `.bat`/`.cmd` CRLF); proteção de segredos no NTFS; Ctrl+C abrupto.

## Como rodar e relatar
1. Atualize a branch, instale o Node 24.20.0, `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:ide:check`.
2. Rode o checklist com scripts em `.local/platform-checks/` (ignorado pelo git), com um arquivo de evidência por item.
3. Relate pelo `@qa`: `docs/stories/OPS-15/qa-gate-<data>-windows.md` (+ pt-BR) com plataforma (SO, versão, arquitetura), versões, comandos, resultados, itens não executados, limpeza e READY/NOT ready.
4. Proponha um job de CI ao `@devops` só com o OK do proprietário (o CD já gera o instalador do Windows em `.github/workflows/main-cd.yml`).

## Perguntas abertas ao proprietário
- Versões do Windows e do Docker Desktop a mirar; se um resgate real da Twitch é permitido neste host; se o teste do OBS é manual ou com script.

## Histórico
- 2026-10-27 — Criado pelo Orion a partir do anúncio do proprietário (Windows) e do pedido (macOS).
