# Resumo do Projeto: Bot local de filas da Twitch para Genshin Impact

[English](../project-brief.md)

## Visão do produto

Oferecer a uma streamer da Twitch uma ferramenta local confiável para operar várias filas configuráveis de Genshin Impact durante uma live. Viewers entram somente por resgates de pontos do canal; streamer e moderadores autorizados também podem adicionar pessoas manualmente. A ferramenta acompanha ordem, chamadas, atendimento e resultado confirmado das operações de pontos, recuperando tarefas pendentes após reinícios.

## Problema e usuários

A operadora principal é a streamer que precisa gerenciar várias atividades sem depender de listas no chat ou perder estado quando o processo ou computador parar. Moderadores ajudam na operação das filas. Viewers resgatam uma recompensa da fila, aguardam e combinam os detalhes do jogo com a streamer por mensagem privada, fora desta aplicação.

## Limites do produto

- Uma instalação local atende uma única broadcaster da Twitch e o aplicativo Twitch dela.
- PostgreSQL roda localmente por Docker Compose; não há backend hospedado, banco remoto, telemetria, domínio público nem serviço de sincronização.
- Twitch é o único serviço externo em runtime. Não há integração com Discord, mensagens privadas, login de jogo, verificação de UID, overlay OBS, rankings, inscrição pública ou comando de entrada para viewers.
- O app nunca solicita, armazena ou repete credenciais do jogo. Um UID visível é somente um identificador público do jogo, com nove dígitos ASCII conforme a regra de formato desta versão.
- Chat e texto de resgate não são confiáveis. Payloads inválidos são descartados sem eco ou retenção bruta.

## Medidas de sucesso

- Mudanças de pontos são duráveis, rastreáveis e apresentadas como pendentes até a confirmação da Twitch.
- Recuperação após reinício/reconexão preserva a ordem das filas, o histórico e as operações pendentes.
- Operadores conseguem ver e resolver localmente problemas de conectividade, reconciliação, operações financeiras e recompensas.
- Primeira execução exige Docker Compose v2 e navegador, sem Node.js/PostgreSQL no host ou edição manual de `.env`/YAML.
- O código do produto usa JavaScript ESM em `apps/web`, `apps/api`, `apps/infra` e outros módulos `apps/*` somente quando necessário. O `.env.example` do repositório pertence ao scaffolding do framework AIOX, não é configuração do produto.

## Qualidade e governança

Cada incremento comportamental segue Red → Green → Refactor com testes antes da implementação e evidências reais nos dois documentos de stories. Garantias de banco exigem PostgreSQL isolado e migrations reais. Inglês é a documentação principal e pt-BR mantém cópia equivalente. Promoção de estágio exige aprovação humana; @devops é responsável por releases e tags.

## Entregas

1. Identidade runtime local, bootstrap Compose, schema/migrations PostgreSQL e documentação operacional bilíngue.
2. Domínio de filas, política de UID, parser, autorização e persistência concorrente ordenada.
3. Outbox durável e operações de pontos confirmadas/recuperáveis.
4. OAuth Twitch, recompensas próprias, EventSub, adaptadores e reconciliação.
5. Comandos, notificações, timeout, limpeza e propriedade da conta atual.
6. Segurança do painel/API local e aceitação do sistema.

## Fonte e rastreabilidade

Derivado do prompt completo do usuário, datado de 2026-10-02, e da confirmação de que o código do produto deve ficar em `apps/*`: consulte a [especificação do produto](../stories/FND-0/spec/spec.md), [requisitos](../stories/FND-0/spec/requirements.json) e [pesquisa](../stories/FND-0/spec/research.json).
