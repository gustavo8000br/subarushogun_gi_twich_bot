# Histórico de mudanças

[English](../../CHANGELOG.md)

## Unreleased

- Migra a imagem do app de Debian Bookworm para Alpine 3.24 fixado após build limpo e validação Compose real da engine musl do Prisma, bootstrap, migrations, health HTTPS e reinício com os volumes existentes preservados. A imagem AMD64 local caiu de 959 MB para cerca de 770 MB; ARM64 aguarda validação no CI.

- Publica no GHCR imagens para `linux/amd64` e `linux/arm64`, com tags multi-plataforma `main`/versão e tags explícitas com sufixo de arquitetura. Os helpers Compose de início e atualização baixam a imagem publicada.
- Remove durante a desinstalação a imagem GHCR local selecionada, preservando os volumes do projeto salvo se o operador confirmar a exclusão dos dados.
- Materializa nas imagens de CI a identidade de sete caracteres do commit exato de origem, a partir da próxima pull request.
- Usa `main` como tag Docker padrão, separada da versão runtime do produto.
- Corrige a espera entre verificações do painel no `iniciar.bat` para evitar a mensagem de redirecionamento de stdin observada no Windows; requer reteste manual nessa plataforma.
- Esclarece o passo único `chmod +x iniciar.sh` para instalações por arquivo no Linux/macOS e adiciona um guia de primeira execução no macOS.
- Exibe estados da configuração Twitch com texto claro no painel; a inelegibilidade por falta de Afiliado/Parceiro agora tem explicação amigável em vez do código interno `INELIGIBLE`.
- Adiciona CI no GitHub Actions com lint e verificação de tipos separados para API/infra/web, suíte completa de testes, OpenGrep, validação de versão/Compose e build da imagem de produção.

- Serve painel local e callback OAuth Twitch por HTTPS em `https://localhost`, com certificado local persistente e instrução para confiar nele uma vez.
- Amplia as instruções de primeira execução para Windows/WSL 2 e Ubuntu/Linux, incluindo confiança no certificado HTTPS, callback Twitch, papéis do chatbot e do painel e estimativas de hardware identificadas como aproximadas e variáveis por versão.
- Adiciona updater Git por fast-forward e desinstalador interativo para Linux/macOS e Windows; a desinstalação preserva os dados por padrão e exige confirmação digitada antes de apagar volumes.
- Atualiza a referência de integrações e os changelogs nos dois idiomas para refletir criação durável de recompensa pausada e recuperação auditada de associação ambígua; edição/abertura/fechamento/arquivamento/exclusão seguem incompletos.
- Mostra no setup local a elegibilidade do canal, disponibilidade de Channel Points e contagem de vagas de recompensa, com explicação quando canal/API não estão elegíveis/disponíveis.
- Mantém o formulário de credenciais Twitch acessível durante a validação e limpa o Secret com segurança após o evento do navegador terminar.
- Cria recompensas da fila por worker durável; resultados Twitch não resolvidos ficam visíveis e o painel permite vincular recompensa verificada e gerenciável com auditoria explícita do operador.
- Adiciona base de painel local do streamer para configuração Twitch, operações de fila, notificações de chamada, visibilidade financeira, revisão/confirmação de limpeza e rótulos de conta. Criação de recompensas e recuperação de associação ambígua estão disponíveis; edição, abertura/fechamento, arquivamento e exclusão seguem incompletos.
- Adiciona confirmação de limpeza no chat vinculada ao mesmo moderador/canal/fila e snapshot de entradas ativas válido por 15 segundos; reembolsos são enfileirados para confirmação remota.
- Adiciona propriedade automática da conta atual em chamadas individuais, com intervenção manual e retorno ao padrão configurado quando a entrada proprietária termina.
- Adiciona READMEs centrais bilíngues para operação, cobrindo primeira execução, atualização, operação Compose diária, contribuição, Conventional Commits e limites atuais da implementação.
- Adiciona decisões datadas de integração Twitch/SDK/infraestrutura com versões verificadas, escopos por operação, referências oficiais e distinção clara entre adaptadores planejados e validação real.
- Adiciona runtime local fixado em Docker Compose, segredo persistente de banco gerado uma única vez, PostgreSQL 18.6 e fundação Prisma 6.19.3.
- Adiciona tabelas versionadas do PostgreSQL e restrições de banco para chaves de fila, resgates, entradas ativas, integridade da origem e idempotência da outbox.
