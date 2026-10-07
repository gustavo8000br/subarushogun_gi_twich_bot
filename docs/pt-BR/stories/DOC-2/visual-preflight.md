# Pré-revisão visual da DOC-2 — painel e páginas de saída

[English](../../../stories/DOC-2/visual-preflight.md)

**Revisores:** `$aiox-ux-design-expert` (Uma) e `$aiox-architect` (Aria), com implementação atribuída ao `$aiox-dev` (Dex).
**Data:** 2026-10-07
**Objetivo:** Encontrar desvios visuais ou de usabilidade antes da próxima story de produto e preparar os critérios de mídia da DOC-2.

## Limites da revisão

O produto em execução foi revisado no Chrome, na instalação local existente, olhando a própria página do produto. A sessão mostrava canal conectado mas inelegível, filas/operações financeiras vazias e nenhum widget OBS. Nenhuma mutação na Twitch foi feita. A revisão cobre as oito áreas do painel, além do callback OAuth e da saída de widget OBS, usando a implementação e os contratos de interação documentados. O estado real de sucesso OAuth e telas com filas/operações/widgets preenchidos não estavam disponíveis e não são descritos como testados no navegador.

## Decisão de UX e arquitetura

O painel tem superfícies grafite coerentes, acento violeta contido, hierarquia legível de seções, navegação compartilhada e cartões consistentes. A maioria das telas mantém a identidade esperada de um painel local de operação. Comandos e Cargos e permissões era o desvio visível: linhas completas repetidas formavam uma lista longa e sem diferenciação, dificultando comparar os limites de acesso fixo.

O ajuste agrupa os comandos segundo o limite já enviado pelo catálogo: audiência configurável, acesso fixo de streamer/moderador e acesso fixo exclusivo do streamer. Uma grade responsiva de cartões em duas colunas melhora a leitura no desktop; larguras menores voltam a uma coluna. Os títulos dos grupos estão localizados nos três idiomas do painel. API, política de autorização, modelo de dados e comportamento do chat permanecem iguais. O agrupamento apresenta metadados existentes; não cria um segundo sistema de permissões.

## Achados página por página

| Página/saída | Achado da revisão | Ação ou acompanhamento |
| --- | --- | --- |
| Visão geral | Elegibilidade do canal, saúde do banco/API, contagens de filas e próxima ação aparecem juntas. O estado atual de canal inelegível continua compreensível sem expor erro técnico. | Sem mudança neste ajuste visual. |
| Filas e atendimentos | O estado vazio explica o que aparecerá e direciona à configuração do canal. | Estados preenchidos e filas arquivadas precisam de revisão visual futura com dados demonstrativos seguros. |
| Nova fila | O formulário é completo, porém longo, e reúne várias configurações de recompensa em um cartão. Rótulos e limites opcionais nativos da Twitch estão claros. | Considerar dividir em seções numa revisão futura; nenhum comportamento/campo foi alterado aqui. |
| Operações financeiras | O estado vazio explica que pedidos continuam pendentes até confirmação Twitch e destaca resultados desconhecidos. | Não havia linhas de pendência/conflito/recuperação nesta instalação; validar com fixtures durante a DOC-2. |
| Comandos / Cargos e permissões | Cartões repetidos deixavam a página extensa e visualmente plana; comandos configuráveis e fixos estavam intercalados. | Foram implementados títulos de grupo e cartões responsivos mais compactos; comandos fixos continuam imutáveis. |
| Widgets do OBS | A página distingue uso de Browser Source local, links de uso único e a ação de criação no estado vazio. | Não havia widget na instalação; revisar editor e telas de URL de uso único com fixtures seguros durante a DOC-2. |
| Configurações | Idioma do produto e rótulos de conta ficam em cartões distintos, separando preferências sem relação entre si. | Sem mudança. |
| Conexão Twitch | Configuração de credenciais e estado/reconexão do canal aparecem em cartões distintos, com orientação atual sobre elegibilidade. | Nenhuma credencial foi alterada e nenhum OAuth foi iniciado. |
| Callback OAuth | O template de sucesso/falha tem mensagem de estado focada e caminho de retorno alinhado ao sistema de cartões do painel. | Verificar sucesso e falha no navegador somente em fluxo autorizado e seguro; nenhum callback real foi executado nesta revisão. |
| Saída de widget OBS | A página transparente de valor único é apropriada para Browser Source e não expõe o painel administrativo. | Nenhum URL ativo de widget foi aberto ou capturado. |

## Requisitos de mídia da DOC-2 informados pelo proprietário

- Capturar somente a página da aplicação. Excluir abas, barra de endereço, moldura do navegador e elementos do desktop sem relação com o produto. Manter todo o conteúdo do produto necessário para compreender a página.
- Para apresentar nos READMEs, criar um GIF página por página, em ritmo calmo de leitura. Não acelerar nem apresentar como timelapse; cada página permanece tempo suficiente para ser compreendida.
- Capturar somente depois de verificar as páginas/estados demonstrativos necessários e registrar versão do produto, viewport, idioma e fonte dos dados demonstrativos. Usar dados sintéticos e remover credenciais, tokens, IDs de viewers, UIDs, links privados e dados pessoais.
- Usar posição/legendas equivalentes em inglês e pt-BR, alt text nas imagens e uma alternativa textual acessível para o tour animado.

## Limites

Esta é uma pré-revisão visual/de arquitetura, não uma nota de QA independente, estudo de usabilidade com streamers, certificação de auditoria WCAG nem aceite de integração Twitch. A aparência da implementação deve ser revisada no navegador depois de servir a nova build local; a instalação GHCR ativa ainda usa a imagem anterior até uma implantação posterior.
