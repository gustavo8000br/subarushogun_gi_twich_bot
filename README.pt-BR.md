# Bot de filas da Twitch para Genshin Impact

[![CI](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml)
[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-yellow.svg)](LICENSE)

[English](README.md) | Português (Brasil)

Um **chatbot da Twitch com painel local para o streamer** organizar filas de Genshin Impact. Execute no seu computador; o app mantém o PostgreSQL e os segredos operacionais em volumes Docker locais.

> **Alpha:** as stories centrais de filas, chat, Twitch, painel, localização e widgets OBS estão implementadas. Escritas reais de recompensas/pontos ainda não foram verificadas em um canal Twitch elegível. Consulte o [roadmap atual](docs/pt-BR/ROADMAP.md).

## Início rápido

1. Instale Docker e Compose v2. Siga o [guia de instalação](docs/pt-BR/INSTALACAO.md) para requisitos exatos, acesso ao GHCR privado, etapas por plataforma e confiança do certificado HTTPS local.
2. Inicie o bot:
   - Linux/macOS: se necessário, execute `chmod +x subarushogun_twich_bot_setup.sh` uma vez e depois `./subarushogun_twich_bot_setup.sh`.
   - Windows PowerShell: `.\subarushogun_twich_bot_setup.bat`.
3. Confie no certificado local desta instalação conforme o guia e abra `https://localhost:3000`.
4. Conecte seu aplicativo Twitch em **Conexão do canal**. O [manual do usuário](docs/MANUAL_DE_USUARIO-pt_BR.md) explica filas, comandos, widgets OBS, recuperação, atualização e desinstalação.

## Documentação

| Guia | Conteúdo |
| --- | --- |
| [Instalação](docs/pt-BR/INSTALACAO.md) | Requisitos, primeira execução em Windows/Linux/macOS, confiança HTTPS e configuração Twitch |
| [Manual do usuário](docs/MANUAL_DE_USUARIO-pt_BR.md) | Filas, comandos, painel, Pontos do Canal, OBS, operação e recuperação |
| [Desenvolvimento](docs/pt-BR/DESENVOLVIMENTO.md) | Ferramentas, testes, CI e estrutura do repositório |
| [Como contribuir](docs/pt-BR/CONTRIBUICAO.md) | TDD, documentação bilíngue, padrão de README, Conventional Commits e fluxo de PR |
| [Roadmap](docs/pt-BR/ROADMAP.md) | Estado atual das stories e issues |
| [Integrações](docs/pt-BR/integrations.md) · [Versionamento](docs/pt-BR/VERSIONING.md) | Referências técnicas e identidade de versão |
| [Stories](docs/pt-BR/stories.md) · [Changelog](docs/pt-BR/CHANGELOG.md) | Evidências de aceite e mudanças para usuários |

Cada guia aponta para sua versão em português brasileiro. A interface, ajuda e mensagens do chat oferecem pt-BR, inglês, espanhol e locales comunitários completos.

## O que o bot faz

- Funciona como chatbot da Twitch e painel local do streamer para várias filas personalizadas.
- Recebe viewers por recompensas próprias de Pontos do Canal ou inclusão manual autorizada; viewer não pode se inscrever pelo chat nem pelo painel.
- Acompanha ordem, chamadas, atendimento, estado das operações de pontos na Twitch e recuperação após interrupções.
- Oferece widgets locais de Browser Source para OBS. A configuração OBS nativa validada usa Ubuntu 24.04 e OBS Studio 32.2.2 / CEF 127; a confiança do certificado no OBS para Windows/macOS não foi verificada.
- Não solicita credenciais de Genshin, processa pagamentos nem envia mensagens privadas.

## Estado do projeto

FND-2 a FND-8 e OPS-1 a OPS-4/OPS-6 estão concluídas. A FND-1 ainda precisa de um novo teste manual no Windows para a correção do helper de inicialização; FND-9 e OPS-5 estão em planejamento. O [roadmap](docs/pt-BR/ROADMAP.md) detalha os itens e limites de validação.

## Como contribuir

O repositório está privado. Para obter acesso e conhecer os requisitos de contribuição, comece por [Como contribuir](docs/pt-BR/CONTRIBUICAO.md) e [Desenvolvimento](docs/pt-BR/DESENVOLVIMENTO.md). Mudanças de comportamento seguem Red → Green → Refactor test-first; a documentação afetada é mantida em inglês e pt-BR.

## Dados e licença

O banco e os segredos operacionais são locais e podem conter informações sensíveis. Não compartilhe volumes Docker, dumps de banco, arquivos `.env`, tokens ou logs com dados sensíveis. Persistência em volume local não garante criptografia em repouso.

Licenciado sob a [Licença MIT](LICENSE).
