# Histórico de mudanças

[English](../../CHANGELOG.md)

Este arquivo destaca mudanças importantes para streamers e viewers. Detalhes técnicos e operacionais estão no [CHANGELOG_INTERNAL.md](CHANGELOG_INTERNAL.md).

## v0.2.0-alpha

- Streamers agora podem pausar, reabrir, arquivar e remover filas gerenciadas com segurança, mantendo tarefas inacabadas disponíveis para recuperação.
- Notificações de chamada podem ser reenviadas pelo painel, e as trocas de conta ficam vinculadas à pessoa cujo atendimento está em andamento.
- O bot acompanha reembolsos e consumos de pontos pendentes, mantendo operações interrompidas visíveis até a Twitch confirmar o resultado.
- Ações de fila dos viewers e avisos no chat são mais confiáveis após reinicializações, e IDs de jogo ocultos são removidos quando uma fila passa para o modo oculto.

## Primeira imagem alpha materializada — v0.1.0-3e0c935-alpha (2026-10-05)

- A primeira versão alpha permitiu executar o bot e o painel do streamer no computador da própria pessoa, com instruções para Windows, Linux e macOS.
- O painel apresentou a configuração da conta Twitch e as ferramentas iniciais para criar e gerenciar filas e recompensas.
- A configuração agora explica em português quando um canal não pode usar Pontos do Canal, em vez de mostrar um código interno.
- O painel local e o login da Twitch usam HTTPS, com instruções para confiar no certificado local na primeira execução.

Esta é uma versão alpha inicial. Algumas funções de gerenciamento de filas e recuperação ainda estão sendo concluídas.
