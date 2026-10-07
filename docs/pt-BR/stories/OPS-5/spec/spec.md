# Especificação OPS-5 — entrypoints de instalação e artefatos de CI

[English](../../../../stories/OPS-5/spec/spec.md)

**Status:** rascunho de planejamento. Esta proposta precisa de refinamento e não autoriza implementação.

## Objetivo

Oferecer um entrypoint claro de ciclo de vida por família de sistema operacional para primeira configuração, atualização e desinstalação. Usar um workflow GitHub Actions com runners nativos para testar e empacotar os entregáveis por plataforma a partir das fontes revisadas do repositório. O aplicativo runner é open source; Actions hospedado é um serviço.

## Comportamento do produto

- Windows recebe um entrypoint PowerShell; destinos Linux/macOS suportados compartilham um entrypoint POSIX quando seus requisitos testados forem compatíveis.
- O entrypoint apresenta as ações de menu/argumento `setup/start`, `update` e `uninstall`.
- Detecta Docker CLI, disponibilidade do daemon, Compose v2, sistema operacional e arquitetura suportados antes de alterar o produto.
- Explica pré-requisitos ausentes e oferece somente etapas de instalação suportadas e consentidas explicitamente. Nunca eleva privilégios em silêncio, habilita virtualização do host, aceita termos de fornecedor ou executa downloads sem verificação.
- A atualização preserva volumes do produto e informa origem/versão da imagem.
- A desinstalação mantém a escolha existente entre preservar e apagar dados, exige confirmação digitada para apagar, remove somente recursos do produto e nunca remove Docker como dependência compartilhada.
- O entrypoint é idempotente e suporta caminhos com espaços.

## Comportamento da CI

- Uma matriz GitHub Actions executa testes contratuais de shell em runners nativos Linux/macOS e testes de PowerShell no Windows.
- A CI cobre quoting, caminhos com espaços, cancelamento, dependências ausentes, falha/recuperação, limites de elevação, saúde do Compose e política de volumes na desinstalação.
- O workflow empacota um artefato por família de sistema a partir de fontes versionadas e revisadas e os publica para inspeção. Artefatos gerados nunca são commitados de volta na branch de origem.
- Permissões do workflow são mínimas; Actions de terceiros são fixadas por SHA completo e atualizadas por PR revisado.
- Anexar artefatos a release é uma etapa separada e autorizada. A CI de PR não publica releases nem tags.
- Verificações em runners da CI são identificadas separadamente da aceitação manual nas máquinas dos usuários.
- O aplicativo runner possui licença MIT/open source; o GitHub Actions hospedado continua sendo um serviço, e o plano de controle completo não é open source. Hospedagem própria é um custo operacional opcional, não a recomendação padrão.

## Segurança e operação

- Nunca desinstalar nem alterar uma instalação compartilhada do Docker.
- Não imprimir credenciais, material OAuth, segredos do banco ou strings de conexão.
- Verificar assinaturas/checksums de instaladores baixados quando o fornecedor os publica; falhar com segurança se uma verificação contratual existir e falhar.
- Falha ao instalar dependência não apaga dados do produto e deixa instruções explícitas de recuperação.
- Não prometer atualização automática do Docker do host; o workflow empacota apenas os entrypoints de ciclo de vida do produto.

## Decisões em aberto

1. Windows, macOS, distribuições Linux e arquiteturas de CPU exatos suportados.
2. Se o entregável Windows permanece `.ps1` ou exige um wrapper executável assinado.
3. Quais pré-requisitos podem ser automatizados em cada sistema, em contraste com instruções oficiais manuais.
4. Se artefatos distribuíveis da CI são necessários em todo PR ou somente em pushes/execuções manuais.

Consulte [`research.json`](research.json) para pesquisa em fontes oficiais e alternativas.
