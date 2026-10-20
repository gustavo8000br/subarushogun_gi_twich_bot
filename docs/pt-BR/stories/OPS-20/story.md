# OPS-20 — Simplificar a inicialização de desenvolvimento e separar runtime de build

[English](../../../stories/OPS-20/story.md)

**Status:** Backlog — implementação pausada para respeitar a sequência existente do projeto; o worktree atual contém alterações de implementação OPS-20 ainda não revisadas.
**Relacionadas:** instalador unificado OPS-5; migração Next.js e runtime local OPS-15.
**Versão:** manter o produto em `v0.2.0-beta`; esta fatia não cria release, bump, issue, commit ou push.

## História

Como desenvolvedor configurando este projeto em uma máquina nova,
quero um comando claro com hot reload e diagnósticos acionáveis, enquanto o caminho do usuário final continua usando uma imagem pré-compilada,
para conseguir configurar o ambiente de desenvolvimento sem ensinar Node, npm, build de código-fonte ou detalhes de Compose ao usuário final.

## Critérios de aceite

1. Após executar `npm ci` uma vez, `npm run dev` continua sendo o único entrypoint de desenvolvimento e executa Next HTTPS/HMR e Fastify watch contra o PostgreSQL descartável e isolado por checkout. Antes de provisionar ou migrar, valida a versão fixada do Node, as dependências instaladas e Docker Compose/engine somente quando o banco gerenciado for necessário.
2. Falhas de preflight identificam o pré-requisito e a recuperação exata (`npm ci`, usar Node `24.20.0`, iniciar Docker Desktop/Engine com Compose v2 ou definir `DATABASE_URL` explicitamente descartável). Nenhuma dependência é instalada silenciosamente, nenhum arquivo do usuário é sobrescrito e nenhum serviço/banco/migration inicia se o preflight falhar.
3. `compose.yaml` é um manifest de runtime somente com pull para instaladores e operadores. Builds locais/CI são explícitos por `compose.build.yaml`; `npm run build` e workflows de qualidade usam ambos. Runtime publica somente o frontend no loopback, mantém API e PostgreSQL privados e preserva ordem, segredos e comportamento de persistência atuais.
4. O empacotamento do instalador continua incorporando apenas a configuração de runtime e removendo opções de source/build como já faz; contratos de ciclo de vida e segurança dos dados não mudam. Usuários finais não precisam de Node/npm, checkout do código ou compilação local da imagem.
5. README, guias de desenvolvimento, instalação/instalador e arquitetura em inglês/pt-BR concordam sobre os dois caminhos e mostram os comandos finais. URLs de desenvolvimento informam HTTPS corretamente. Não afirmar que instalador ou pacote GHCR ainda não publicado está disponível publicamente.
6. Testes nomeados cobrem ordem e mensagens seguras/acionáveis do preflight, contratos dos manifests runtime/build, empacotamento pull-only, limites de rede/volumes privados e equivalência documental bilíngue. A validação não usa banco/volume ativo de desenvolvimento ou produto.
7. Revisão UX da orientação inicial para desenvolvedor e instalador alcança no mínimo **9/10** em compreensão e recuperação; QA AIOX independente revisa critérios, testes e documentos alterados. Esta é uma mudança de onboarding CLI/documentação, não da UI do painel.

## Plano UX — antes da implementação

- Público: desenvolvedor retomando um checkout Ubuntu recém-preparado e streamer não técnico usando o futuro instalador público.
- Jornada de desenvolvimento: instalar uma vez Node fixado e dependências; executar `npm run dev`; acompanhar um fluxo conciso; se não puder iniciar, receber o pré-requisito específico, comando copiável de recuperação e link ao guia antes de qualquer mutação no banco.
- Jornada do usuário final: usar **Instalar / Iniciar** do instalador existente; escolher idioma/porta quando solicitado; ver progresso localizado e URL do painel ou instrução de recuperação. Nunca pedir clone ou build do código-fonte.
- Hierarquia: (1) qual caminho usar, (2) um comando/ação, (3) o que iniciará, (4) erro e recuperação exatos, (5) limite de segurança dos dados locais. Detalhes da API/banco ficam nos guias de desenvolvimento/arquitetura, não no início rápido do usuário.
- Falhas: Node ausente/incorreto, `node_modules` ausente, Compose/daemon indisponível e DB externo escolhido são estados distintos. Nunca exibir stack trace bruto, segredos, connection string ou conteúdo do banco.
- Legibilidade/acessibilidade: linguagem direta, passos numerados curtos, comandos copiáveis, status textual e conteúdo equivalente EN/pt-BR.
- Gate UX: **9,2/10 conceitual** para comando único de desenvolvimento, diagnóstico pré-mutation e separação entre instalador/código-fonte. É a nota do plano aprovado; revisão da implementação e teste de inicialização por usuário novo devem ser registrados separadamente antes de Ready for Review.

## Coordenação de arquitetura e dados

- Topologia runtime não muda: frontend é o único serviço publicado no host; API permanece privada e responsável por Twitch/domínio/persistência; PostgreSQL é privado e guarda localmente os dados fornecidos pelo streamer.
- `compose.yaml` permanece a fonte do instalador e não exige contexto de source/build. `compose.build.yaml` adiciona somente contexto/args de build local para `bootstrap`, `migrate` e `bot`.
- Sem mudança de schema, migration, credenciais, banco ou volume ativo. Dara revisa este limite e confirma que a validação não usa dados do produto.
- Preservar `npm run dev` ativo, seu diretório `.next` e o banco/volume Compose isolado deste checkout.

## Plano de validação

- TDD para preflight e contratos de Compose/empacotamento; começar pelos testes focados.
- `npm run lint`, `npm run typecheck`, `npm test`, validações de localização/versão, análise estática se instalada, `docker compose config --quiet`, `docker compose -f compose.yaml -f compose.build.yaml config --quiet` e `git diff --check`.
- Validação de build pode usar o manifest explícito de build; não executar Compose `up`, migrations, limpeza de volumes ou reinício do servidor ativo.
- QA independente registra veredito/nota delimitados; não alegar disponibilidade pública do instalador, aceite de inicialização em todos os sistemas ou conclusão dos gates da OPS-15.

## Lista de arquivos

- `$aiox-dev` atualizará durante a implementação.

## Histórico

| Data | Alteração | Autor |
|---|---|---|
| 2026-10-20 | Criada story bilíngue a partir do fluxo de desenvolvimento/usuário final aprovado; registra plano UX, separação runtime pull-only/build e segurança do banco ativo. | `$aiox-sm` |
