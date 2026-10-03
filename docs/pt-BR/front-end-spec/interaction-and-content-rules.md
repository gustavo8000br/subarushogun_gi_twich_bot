# Interação e conteúdo
[English](../../front-end-spec/interaction-and-content-rules.md)


- Idioma do produto: pt-BR. Datas usam locale pt-BR; IDs técnicos e chaves de estado permanecem em inglês.
- Diferenciar estado pendente da confirmação Twitch. Nunca dizer que reembolso/consumo terminou antes da confirmação remota.
- Explicar que inclusão manual não cria resgate de pontos e que UID informado em modo oculto é descartado.
- Confirmar exclusão destrutiva de fila e exibir resumo de resgates/cancelamentos pendentes antes da confirmação.
- Desabilitar controles incompatíveis com ciclo de vida/estado e sempre revalidar a operação no servidor.
- Explicar estados carregando, vazio, desatualizado, desconectado, reconciliação parcial e erro com uma ação segura seguinte.
- Não mostrar o valor ou fragmentos do Secret após salvar. Usar placeholder visual fixo e ação para substituir e validar.
- Nomes e textos controlados por usuários são renderizados como texto, nunca HTML. Não repetir texto bruto rejeitado de resgate/chat.
- `/api/state` e rotas administrativas exigem sessão local; não se pressupõe uma visualização pública do estado.
