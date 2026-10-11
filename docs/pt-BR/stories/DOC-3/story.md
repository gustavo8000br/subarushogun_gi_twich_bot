# DOC-3 — Auditoria e correção de consistência documental

[English](../../../stories/DOC-3/story.md)

**Status:** Planejada; issue [#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48). O trabalho só começa depois que FND-9 e DOC-2 forem concluídas.  
**Capacidade:** Qualidade da documentação do produto e de contribuição

## História

Como streamer ou pessoa contribuindo com o projeto,
quero que a documentação mantida seja precisa, concisa, coesa e equivalente em inglês e pt-BR,
para que instalação, operação, desenvolvimento e comportamento do produto sejam claros e confiáveis.

## Escopo e sequência

- Iniciar esta story somente depois de concluir FND-9 e DOC-2.
- Auditar toda a documentação mantida do produto, incluindo READMEs raiz, guias específicos, stories, integrações, roadmaps, registros de mudanças/releases, guias de contribuição e instruções de agentes do repositório. Excluir dependências, artefatos gerados e a árvore-fonte do framework AIOX.
- Usar `$aiox-ux-design-expert` para revisar estrutura, legibilidade, navegação e hierarquia visual da documentação do usuário; usar `$aiox-dev` com `$aiox-architect` para corrigir linguagem e consistência técnica; usar `$aiox-qa` para conferir afirmações e links contra implementação e evidências.
- Preservar o significado das políticas aprovadas de produto/segurança/pontos e das evidências TDD registradas. Não reescrever comandos históricos ou resultados de teste como se fossem outros. Não alterar código, estágio ou versão como parte da auditoria documental.

## Critérios de aceite

1. Inventariar o conjunto completo de documentos dentro do escopo e registrar caminhos revisados e achados em relatório bilíngue.
2. Conferir instruções de instalação, operação, comandos, permissões, estados de saúde, filas/rewards, recuperação, segurança, versões de runtime, distribuição de releases e solução de problemas contra código, testes, CI e evidências realmente verificadas.
3. Corrigir contradições, caminhos/comandos antigos, links quebrados, instruções duplicadas ou obsoletas, terminologia pouco clara e afirmações sem suporte. Se faltar evidência, marcar como não verificado ou manter a pendência aberta, sem inferir comportamento.
4. Revisar a documentação do usuário em busca de navegação orientada a tarefas, seções concisas, hierarquia visual legível, exemplos úteis e terminologia consistente. Manter detalhes técnicos em referências específicas de desenvolvimento.
5. Manter cada documento afetado em inglês equivalente ao correspondente pt-BR, com links recíprocos de idioma e comandos, caminhos, IDs de stories, datas, exemplos e evidências correspondentes.
6. Manter changelogs públicos legíveis para pessoas sem conhecimento técnico e changelogs operacionais precisos para manutenção; não usar a auditoria para reescrever a versão ou promover o estágio.
7. Executar contratos de documentação/links/localização e gates aplicáveis do projeto. Registrar comandos e resultados reais na story e nos dois relatórios; não declarar conclusão se alguma validação obrigatória estiver bloqueada.
8. Concluir revisão independente de `$aiox-qa` sem defeitos documentais críticos/altos pendentes. A story só fica pronta quando todas as correções aprovadas estiverem nos dois idiomas e o relatório listar itens explicitamente adiados.

## Entregáveis

- `docs/audits/documentation-consistency.md` e `docs/pt-BR/audits/documentation-consistency.md`
- Documentos-fonte corrigidos e seus pares de idioma
- Índice de stories e roadmap bilíngues atualizados
- Entradas pertinentes de changelog e evidências de validação

## Fora de escopo

- Implementação de produto, produção de capturas/GIF, tradução para novos locales, criação de release/tag, promoção de estágio ou alteração de comportamento aprovado.
