# Users and primary tasks
[Português brasileiro](../pt-BR/front-end-spec/users-and-primary-tasks.md)


The streamer/operator uses the browser on the same computer to set up Twitch, inspect integration health, create and operate queues, manage chat commands and OBS widgets, resolve uncertain point operations, and review history. The panel is an authenticated operator surface; it is not a public viewer portal. The OBS overlay is served by the same Next.js application on a separate route and bundle (`/overlay`), authenticated by a per-widget capability link, and never exposes panel data or controls.
