# Validação do Planejamento Greenfield

[English](../planning-validation.md)

## Escopo revisado

O resumo do produto, PRD, especificação do frontend, arquitetura integrada, arquitetura do serviço e arquitetura do frontend foram comparados aos artefatos FND-0 de requisitos/spec/pesquisa e ao `po-master-checklist.md` fornecido pelo AIOX.

## Resultados

| Área do checklist | Resultado | Evidência |
| --- | --- | --- |
| Configuração e inicialização | Pronta com gates de implementação | Repositório privado no GitHub e `main` local existem; Node 24.20.0, npm 11.19.0, Docker 29.8.1/Compose v5.5.1 e `gh` autenticado estão disponíveis. `package.json`, README e runtime do produto aguardam trabalho TDD FND-1. |
| Infraestrutura e implantação | Planejada | Topologia Compose e testes isolados com PostgreSQL/migrations reais estão especificados na arquitetura e no plano FND-1. Não se declara implementação nem paridade de plataforma. |
| Dependências e integrações externas | Pesquisadas; verificações de implementação pendentes | Referências oficiais e versões fixadas estão em `stories/FND-0/spec/research.json`; comportamento do SDK precisa de testes contratuais com as versões instaladas. Não foram usadas credenciais Twitch reais. |
| UI/UX | Planejada | Fluxo do painel, privacidade, status, acessibilidade e renderização segura constam na especificação/arquitetura frontend. Testes de contrato da UI antecedem implementação. |
| Responsabilidades usuário/desenvolvimento | Pronta | App de desenvolvedor e autorização Twitch são providos pela streamer; código, testes, documentação e validação local pertencem ao projeto. Autoridade de release/tag permanece com @devops; promoção de estágio exige aprovação humana. |
| Sequência e dependências | Pronta | FND-1 a FND-6 colocam persistência antes de domínio/integrações/painel e exigem testes baseados em migrations. |
| Alinhamento do MVP | Pronto | Itens fora de escopo seguem as exclusões explícitas; não se adicionam cadastro público, multi-canal, Discord, credenciais de jogo, overlay ou serviços hospedados. |
| Documentação e handoff | Prontos com paridade acompanhada | Cada documento de planejamento tem link para sua versão pt-BR. Stories/changelogs/integração/versionamento continuam entregáveis da implementação. |
| Pós-MVP | Adiado conforme especificação | Overlay, Discord, ranking, funcionalidade de export/backup, hospedagem pública e escala horizontal permanecem fora de escopo. |

## Decisão condicional

**Gate PO: APROVADO COM INTERPRETAÇÃO DE ESCOPO.** A operadora decidiu manter o painel mutável exigido pelo produto e tratar CLI-first do AIOX como diretriz de desenvolvimento/operação do framework. Nenhuma CLI de domínio adicional será criada. O painel obrigatório continua sendo a superfície de controle da operadora; mutações do painel/chat passam pelos mesmos serviços de domínio no servidor.

O conflito de governança foi resolvido. A implementação pode seguir pelo Story Development Cycle. Nenhum código de produto foi escrito durante o planejamento.

## Riscos para acompanhar

- Permissões de secret Compose baseadas em arquivo podem diferir entre Linux e Docker Desktop; validar antes de afirmar compatibilidade.
- Normalização de campos do SDK Twitch, semântica do resultado de envio e escopos atuais de endpoints exigem testes de contrato por versão.
- Não é possível garantir efeito HTTP exatamente uma vez; manter intenção durável e confirmação remota como contrato.
- O sharding AIOX exige `@kayvan/markdown-tree-parser`; foi instalado globalmente porque `.aiox-core/core-config.yaml` habilita `markdownExploder`.

## Estado dos workflows

- Spec Pipeline: requisitos, complexidade, pesquisa de fontes oficiais, spec, crítica e plano de implementação presentes; crítica aprovada com questões médias registradas.
- Greenfield Fullstack: descoberta/PRD/UI/arquitetura fullstack escritos e shardados; validação PO aprovada com interpretação de escopo.
- Greenfield Service: arquitetura do serviço escrita e shardada; gate compartilhado do produto aprovado.
- Greenfield UI: especificação e arquitetura do frontend escritas e shardadas; gate compartilhado aprovado.
- Story Development Cycle: iniciando por FND-1 após criação e validação da story.
- Auto Worktree + Git Workflow: reservado para o final e não iniciado.
