# Especificação: recuperação automática da Twitch após interrupções de rede

> **Story ID:** OPS-8
> **Complexidade:** COMPLEX (19/25)
> **Gerada:** 2026-10-07
> **Status:** Aprovada para planejamento da implementação
> **Issue:** [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)

[Read in English](../../../../stories/OPS-8/spec/spec.md)

## 1. Visão geral

O bot local precisa distinguir indisponibilidade temporária da Twitch/rede de uma autorização que realmente exige ação do streamer. O tratamento de tokens e reconciliação da FND-4 continua sendo a base; a OPS-8 supervisiona falhas recuperáveis de inicialização/conexão e retoma a base quando a Twitch voltar.

### Objetivos

- Recuperar a integração Twitch depois de queda de rede, suspensão, desligamento, reinício ou indisponibilidade inicial da Twitch usando credenciais salvas.
- Separar falhas temporárias de serviço/rede de problemas confirmados de autorização/escopo.
- Manter painel local, PostgreSQL e tarefas duráveis disponíveis enquanto a Twitch estiver offline.

### Fora de escopo

- Alterar escopos OAuth ou fluxo de consentimento.
- Substituir gerenciamento de conexão EventSub do Twurple ou adicionar outro cliente WebSocket.
- Alterar fila, resgate, reembolso, conclusão ou intenção de negócio da outbox.
- Declarar validação Twitch ao vivo por meio de fakes.

## 2. Mapeamento de requisitos

| Requisito | Comportamento especificado |
| --- | --- |
| FR-1 / FR-2 | Classificação tipada de falhas e supervisão cancelável de retry limitado na validação/inicialização. |
| FR-3 / FR-4 | Reutilizar autenticação salva; restaurar integração e reconciliar após sessão EventSub realmente interrompida. |
| FR-5 | Manter registros duráveis da outbox e retomar workers quando o adaptador Twitch estiver disponível. |
| FR-6 / NFR-4 | Projetar recuperação transitória de forma distinta nos estados de saúde/configuração existentes; não bloquear o serviço local. |
| FR-7 | Um supervisor por vez; parar timers de retry/validação/reconciliação e impedir inicializações pós-encerramento. |
| FR-8 / NFR-1..3 | Fakes e relógio controlado cobrem matriz de erros, idempotência, privacidade e persistência. |

## 3. Contrato de comportamento

### Classificação de erros

- Um 401 do access token salvo tenta primeiro a renovação usando o refresh token salvo. A renovação bem-sucedida deve ser persistida e validada para o app, broadcaster e escopos exigidos antes de ser usada.
- Evidências definitivas de reconexão necessária são refresh token comprovadamente inutilizável/revogado, incompatibilidade de identidade ou escopos obrigatórios ausentes no token renovado válido. Elas interrompem ações Twitch autorizadas.
- 401 na validação do access token, sozinho, não basta para solicitar consentimento se o refresh token ainda pode recuperar a sessão.
- Falhas de transporte, timeout, HTTP 429 e Twitch 5xx são transitórias. Credenciais salvas são mantidas e o estado fica degradado/tentando.
- Erros desconhecidos bloqueiam ações Twitch até recuperarem, mas continuam sendo tentados novamente enquanto não houver evidência tipada de autorização inválida. Nunca classificar pelo texto da exceção.
- Dados persistidos de token só mudam após evento/resposta de refresh bem-sucedido. A rotação do refresh token segue o caminho existente do repositório.

### Supervisor de recuperação

- Há um supervisor cancelável por integração. Ele agrupa inícios/gatilhos de recovery sobrepostos e usa backoff exponencial limitado com jitter. Cada retry é uma tentativa, não um loop agressivo.
- A inicialização do HTTP local não bloqueia enquanto Twitch estiver offline. Credenciais salvas permanecem; nenhum OAuth é iniciado automaticamente.
- Um retry reconstrói a etapa mínima que falhou usando credenciais duráveis: validar token → criar auth provider → conferir elegibilidade → iniciar adaptadores/reconciliação/EventSub.
- Ao restaurar Twitch, retomar workers duráveis sem alterar registros outbox ou estado remoto esperado.
- O encerramento cancela timers e impede novas tentativas; uma chamada em andamento é aguardada/tratada com segurança e não instala runtime depois do shutdown.

### EventSub e reconciliação

- Twurple 8.2.0 gerencia a troca `session_reconnect` da Twitch e reconecta socket já estabelecido conforme comportamento da biblioteca. Não abrir outro socket durante esse protocolo.
- Uma sessão nova após desconexão inesperada real marca recovery e executa a reconciliação paginada existente. O estado só volta a connected após reconciliação bem-sucedida.
- Notificações EventSub podem coincidir com a reconciliação; deduplicação por redemption ID e regras de estado terminal existentes permanecem autoritativas.
- Exaustão da conexão inicial precisa ser supervisionada pela aplicação se os retries iniciais do Twurple terminarem antes de uma sessão ficar pronta.

### Contrato de status

Reutilizar estados seguros existentes quando forem expressivos: `not_configured`, `connecting`, `reconciling`, `degraded`, `reconnect_required`, `connected`, `ineligible` e `stopped`. API/UI devem comunicar retry em andamento versus ação do usuário usando status atual e indicador de recuperação/próxima tentativa segura se necessário. Não expor mensagens de exceção nem credenciais.

## 4. Cobertura de aceite

1. Validação transitória no startup não marca reconexão necessária; retry controlado posterior tem sucesso sem OAuth.
2. Access token com 401 tenta refresh salvo; apenas falha definitiva do refresh, incompatibilidade de identidade ou falta de escopos obriga reconectar.
3. Falha transitória da consulta de elegibilidade tenta de novo com auth salva e restaura adaptador/API/EventSub.
4. Reinício com credenciais salvas e Twitch inicialmente indisponível restaura serviço automaticamente.
5. Desconexão real WebSocket seguida de ready dispara exatamente uma reconciliação; `session_reconnect` é tratado pelo Twurple e não cria socket paralelo.
6. Gatilhos de recuperação duplicados são agrupados; retries e reconciliações concorrentes não se sobrepõem.
7. Linhas outbox e intenções financeiras sobrevivem à indisponibilidade, reinício e recuperação; workers retomam somente com adaptador e não declaram sucesso sem confirmação Twitch.
8. Encerramento durante backoff ou inicialização em curso impede timers órfãos e início tardio de listener.
9. Projeções health/setup distinguem tentativa transitória de reconexão necessária sem revelar tokens/erros.
10. Suítes focadas unitárias e de integração PostgreSQL passam; nenhuma operação Twitch real é alegada sem executar validação separada.

## 5. Limites de implementação

Mudanças esperadas em `apps/api/src/twitch/auth-runtime.mjs`, `integration.mjs`, `eventsub-runtime.mjs`, projeções runtime/health apenas se necessário, e testes unitários/de integração focados. Não se espera migration. Chamadas de rede permanecem fora de transações PostgreSQL. Repositórios existentes de credenciais e filas continuam como fonte persistente da verdade.

## 6. Riscos e proteções

| Risco | Proteção |
| --- | --- |
| Timeout transitório pede OAuth outra vez | Classificação tipada; teste explícito de erro transitório versus autenticação definitiva. |
| Avalanche de retries em indisponibilidade ampla | Backoff exponencial limitado, jitter, supervisor single-flight, cancelamento e logs sem erros brutos. |
| Listener/subscriptions EventSub duplicados | Uma instância dona do runtime; Twurple gerencia troca de sessão; testes verificam um listener ativo. |
| Perda de intenção financeira ou falso reembolso confirmado | Testes de reinício PostgreSQL; preservar id/state da outbox e semântica de confirmação remota. |
| Status connected antes da recuperação segura | Só publicar connected após auth/elegibilidade e reconciliação exigida concluírem. |

## 7. Fontes oficiais e versão

Pesquisa verificada em 2026-10-07. Consulte `research.json` e `docs/integrations.md` para fontes oficiais OAuth/EventSub e detalhes do Twurple 8.2.0 instalado. Este plano não adiciona dependências nem escopos Twitch.

## 8. Dúvidas abertas

Nenhuma. Requisitos e limites arquiteturais foram resolvidos pela issue #41, FND-4/FND-5, SDK instalado e referências oficiais.
