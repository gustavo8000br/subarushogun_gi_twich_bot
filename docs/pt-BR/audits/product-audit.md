# Auditoria do repositório do produto — 2026-10-06

[English](../../audits/product-audit.md)

## Escopo e método

Foram revisados 571 arquivos do repositório, excluindo `node_modules/`, `.aiox-core/`, metadados Git e dados operacionais locais. A revisão cobriu `apps/api`, `apps/web`, `apps/infra`, testes, schema/migrations PostgreSQL, Docker/Compose, helpers shell/Windows, GitHub Actions, arquivos de pacote/versão e documentação para usuários e técnica. Foram usados inspeção do código, testes existentes, `npm audit --audit-level=low`, OpenGrep, validação do schema Prisma, validação da configuração Compose e comandos de qualidade do projeto. Um resultado limpo de scanner não prova que todos os caminhos do código são seguros.

## Achados de segurança e confiabilidade

- `npm audit --audit-level=low`: 0 vulnerabilidades reportadas no momento da consulta.
- OpenGrep: 0 achados em 56 arquivos JavaScript da aplicação.
- Validação do schema Prisma e `docker compose config --quiet`: passaram.
- Esta auditoria não confirmou nova vulnerabilidade explorável na aplicação. A URL do widget funciona intencionalmente como capability portadora; deve permanecer privada e ser revogada/regenerada caso seja exposta.
- O teste PostgreSQL real do widget revelou um defeito de limpeza da infraestrutura de testes: `--rm` do Docker pode remover o container antes de `docker inspect`, que então responde `no such object`; a limpeza anterior ignorava falhas e podia deixar o volume nomeado. Uma correção test-first agora remove e verifica o container antes de remover e verificar seu volume. A repetição focada passou 13 testes (11 de integração PostgreSQL real + 2 unitários de cleanup), e nenhum container ou volume nomeado de teste permaneceu.
- O aceite OBS nativo cobre somente Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120. Confiança de certificado no Windows e macOS segue sem validação.
- Criar/editar widget, copiar link único, regenerar, revogar, excluir e selecionar a fonte de fila com fixture temporária local no PostgreSQL foram verificados no Chrome depois que o operador confiou no certificado local. Recuperação nativa do OBS após stop/restart, recuperação da exibição stale, recarga da fonte e rotação de capability passaram no Ubuntu/OBS/CEF 32.2.2. A revisão QA independente é o gate de status da FND-7; sincronização Twitch não foi exercitada.
- Nenhuma operação real de reward, pontos, chat ou EventSub da Twitch foi exercitada nesta auditoria.

## Dez melhorias a considerar para o produto

1. **Fechar o status da FND-7** — recuperação/rotação nativas no OBS e seleção local da fonte de fila passaram; registrar veredito QA independente final de pelo menos 9/10 antes de marcar a story como concluída.
2. **Completar o planejamento de i18n de todo o produto (FND-8)** — definir um recurso de tradução seguro por módulo, seleção do idioma na instalação, fallbacks inglês/pt-BR/espanhol, mapeamento de erros de API para mensagens, gramática dos comandos e fluxo/template de contribuição comunitária.
3. **Planejar entrada manual para canais inelegíveis (FND-9)** — manter Custom Rewards criadas pelo app para canais elegíveis; usar entrada manual por streamer/moderador no chat para canais inelegíveis, sem alegar consumo ou reembolso de pontos.
4. **Validar confiança nativa de certificado no Windows e macOS** — publicar apenas instruções de confiança/remoção testadas, cobrir armazenamentos do navegador e CEF do OBS e explicar rotação/recuperação da CA após reset do volume de segredos.
5. **Adicionar monitoramento automático de dependências** — executar no CI uma auditoria de vulnerabilidades fixada e sem mutação, definir cadência revisada de atualizações e manter versões exatas e integridade do lockfile.
6. **Reduzir duplicação no CI** — o workflow instala dependências em vários jobs e executa lint/typecheck do projeto junto dos mesmos por app. Medir o tempo do CI e então consolidar jobs ou cache sem perder clareza dos responsáveis por falha.
7. **Adicionar gate de consistência do repositório** — validar schema Prisma, Compose, identidade de runtime, links EN/pt-BR e paridade de IDs das tarefas das stories no CI para detectar divergência antes do merge.
8. **Revalidar operação no Windows após o fix do helper de início** — o relatório manual anterior encontrou uma mensagem de redirecionamento de entrada. Cobertura de contrato Linux não comprova comportamento do `.bat` no Windows nativo.
9. **Padronizar utilitários de operação para localização (planejamento FND-8)** — escolher nomes genéricos para instalação/atualização/desinstalação e uma interface comum de detecção de dependências, atualização e remoção; preservar caminhos com espaços e confirmação de retenção de dados em todos os shells suportados.
10. **Melhorar diagnósticos de recuperação e planejar exportação** — mostrar estado local acionável do banco, idade/latência do probe Twitch, EventSub e tarefas financeiras pendentes; planejar em separado backup/restauração sob controle do usuário, com confidencialidade e testes de recuperação antes de implementar.

## Encaminhamento

As lacunas de aceite da FND-7 estão registradas na story e issue #7 atuais. FND-8 e FND-9 já têm issues de planejamento; use esses ciclos para as recomendações 2, 3 e 9. A recomendação 8 permanece no aceite da FND-1. As recomendações 4–7 e 10 são propostas, sem aprovação de escopo. Nenhuma nova issue do GitHub foi criada nesta auditoria; operações de issues pertencem ao `@devops`.

## Gates finais neste worktree

- `npm run lint`, `npm run typecheck`: passaram.
- `npm test`: 472 aprovados em 69 arquivos.
- `npm run review:static`: 0 achados em 56 arquivos JavaScript da aplicação.
- `npm run validate:version`: identidade `v0.5.0-0000000-alpha` válida.
- Validação Prisma (com `DATABASE_URL` local sintética), `docker compose config --quiet`, `npm audit --audit-level=low` (0 vulnerabilidades) e `git diff --check`: passaram.
- Stack Compose isolada reconstruída e `/health` verificado: versão `v0.5.0-0000000-alpha`, banco conectado, Twitch não configurada. A stack permanece disponível na porta local 3437.
