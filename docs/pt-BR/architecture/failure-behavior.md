# Comportamento em falhas
[English](../../architecture/failure-behavior.md)


Falha da Twitch mantém painel local e PostgreSQL disponíveis. Trabalho financeiro pendente continua durável e visivelmente pendente/conflitante/desconhecido. Reconciliação parcial não remove entradas. SIGTERM/SIGINT interrompe intake/novos trabalhos, deixa linhas pendentes persistidas, desconecta Twitch e fecha Prisma/Fastify com limpeza. Se houver advisory lock para instância única, deve manter conexão de sessão dedicada do PostgreSQL.
