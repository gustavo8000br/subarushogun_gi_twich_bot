# Arquivos e módulos
[English](../../front-end-architecture/files-and-modules.md)


```text
apps/web/public/
  index.html       estrutura semântica e regiões nomeadas
  styles.css       estilos responsivos do painel local
  app.js           cliente API com sessão, renderização e handlers
```

`app.js` renderiza projeções explícitas da API usando construção DOM e `textContent`. Não passar nomes/mensagens não confiáveis por `innerHTML`. Consultar estado local em intervalo limitado; não adicionar WebSocket ao painel. Mutações são requisições explícitas com token CSRF, chave de idempotência e revisão aplicável.
