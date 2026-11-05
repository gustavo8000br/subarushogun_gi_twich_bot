# Handoff — sessão do Claude Code no macOS

[English](../../handoffs/macos-session-handoff.md)

**Objetivo:** handoff exclusivo da futura sessão do Claude Code que o proprietário rodará no **macOS** (anunciada em 2026-10-27) para automatizar as verificações multiplataforma. O Orion (`@aiox-master`) mantém este arquivo atualizado sempre que o plano, os scripts ou os resultados mudarem. A sessão do Windows tem arquivo próprio: `windows-session-handoff.md`. Última atualização: 2026-10-27.

## Regras de ouro
1. **Ative o Orion primeiro** e leia `AGENTS.md`, `CLAUDE.md`, `docs/session-handoff.md` (+ pt-BR) e este arquivo. Mesmos papéis: `@dev` implementa com teste primeiro, `@qa` valida de forma independente, `@devops` comita; push, PR, tag, bump de versão e release exigem o OK expresso do proprietário.
2. **Nunca alegue um resultado que você não rodou no macOS.** Todo relatório informa a versão do SO, a arquitetura, o Node, o Docker Desktop e como foi executado. Resultados do Ubuntu não valem aqui.
3. Trabalhe só dentro do diretório do projeto; sem segredos em logs ou relatórios (tokens, links de widget com `ref=`, senhas, connection strings).
4. O produto está em **beta sem usuários ativos**: mudanças estruturais são seguras até o rc/stable; sem shims de compatibilidade.
5. Use banco e recursos Docker descartáveis; confira projeto Compose, rótulos e dono antes de remover qualquer coisa.
6. O Orion nunca edita o quadro do Project #5; o `@devops` sincroniza a cada evento (o que o proprietário mover prevalece).

## Estado do projeto (2026-10-27)
Branch `feat/ops-15-next-panel`; Node `24.20.0` (`.nvmrc`); painel Next.js + API Fastify + PostgreSQL (Compose). Validado só no **Ubuntu Linux** (165 arquivos / 1.621 testes verdes, OpenGrep 0 achados, E2E do link de widget no Chrome, bateria real da Twitch parcial). O painel vanilla está sendo cortado por ondas (`docs/stories/OPS-15/cutover-plan.md`); a branch `legacy` o preserva.

## Checklist (o macOS nunca foi validado; todo achado é uma "primeira validação")
- [ ] **Ciclo do instalador:** o artefato do instalador do macOS é gerado por `.github/workflows/release.yml` (runner `macos-15`); instalação limpa, painel abre em `https://localhost:<porta>`, escolha de idioma e porta.
- [ ] **Certificado:** confiar na CA gerada pelo Keychain; o aviso do navegador some; `/callback` alcançável.
- [ ] **Smoke do painel:** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` por URL direta e refresh; criar uma fila.
- [ ] **Persistência, atualização no lugar e desinstalação:** mesmas expectativas da lista do Windows, com o Docker Desktop para macOS (Apple Silicon e Intel se houver os dois).
- [ ] **Overlay no OBS:** Browser Source do OBS no macOS com a URL do overlay (transparência, atualizações ao vivo, redimensionar/recarregar, confiança no certificado).
- [ ] **Caminho de desenvolvedor:** Node 24.20.0, OpenSSL, `npm ci`, `dev:start` / `dev:stop`; permissões dos segredos gerados (arquivos de `.local/` sem leitura pública); sem processos soltos após Ctrl+C.
- [ ] **Suíte no macOS:** `npm test` e registrar falhas só do macOS separadas da linha de base do Ubuntu.
- [ ] **Twitch (canal do proprietário, com OK dele):** OAuth, criação de recompensa, um resgate real até chamar e concluir.

## Como rodar e relatar
1. Atualize a branch, instale o Node 24.20.0, `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:ide:check`.
2. Rode o checklist com scripts em `.local/platform-checks/` (ignorado pelo git), com um arquivo de evidência por item.
3. Relate pelo `@qa`: `docs/stories/OPS-15/qa-gate-<data>-macos.md` (+ pt-BR) com plataforma (SO, versão, arquitetura), versões, comandos, resultados, itens não executados, limpeza e READY/NOT ready.
4. Proponha um job de CI ao `@devops` só com o OK do proprietário (o `release.yml` já gera o artefato do macOS no `macos-15`).

## Perguntas abertas ao proprietário
- Versões do macOS e do Docker Desktop a mirar; se um resgate real da Twitch é permitido neste host; se o teste do OBS é manual ou com script.

## Histórico
- 2026-10-27 — Criado pelo Orion a partir do anúncio do proprietário (Windows) e do pedido (macOS).
