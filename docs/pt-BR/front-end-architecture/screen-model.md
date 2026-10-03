# Modelo de telas
[English](../../front-end-architecture/screen-model.md)


Configuração/reconexão → visão geral → lista/detalhe da fila → recuperação financeira → configuração da conta. Cada tela possui estados carregando, vazio, desconectado, desatualizado, parcial, erro e sucesso/pendente. Controles refletem o ciclo de vida, mas a validação do servidor continua autoritativa. Ações destrutivas de apagar/limpar mostram resumo revisável antes da requisição final.
