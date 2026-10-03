# Files and modules
[Português brasileiro](../pt-BR/front-end-architecture/files-and-modules.md)


```text
apps/web/public/
  index.html       semantic shell and named regions
  styles.css       responsive local operator styling
  app.js           session-aware API client, screen rendering and event handlers
```

`app.js` renders explicit API projections using DOM construction and `textContent`. Keep untrusted names/messages away from `innerHTML`. Poll local state at a bounded interval; do not add panel WebSockets. Mutations are explicit requests with CSRF token, idempotency key and applicable state revision.
