# User guide

[Leia em português brasileiro](MANUAL_DE_USUARIO-pt_BR.md)

This guide describes the product as it exists in the current project version. The panel and chat replies are currently in Brazilian Portuguese; English and Spanish product translations are planned, not available yet.

## What the bot does

This is a local Twitch chat bot and control panel for organizing Genshin Impact sessions. A streamer can create several named queues, connect each queue to its own Twitch Channel Points reward, admit people manually, call viewers, track service, and follow point-operation status.

The application is intended to run on the streamer's own computer. Queue order and work in progress are saved there and can be recovered after a restart. The bot does not enter a game, contact viewers privately, verify game accounts, take payments, or ask for game passwords.

## Who uses it

| Person | What they can do |
| --- | --- |
| Streamer | Set up the channel, create and manage queues, choose command access, operate the panel, and use every command. |
| Moderator | Use queue-management and account-label commands. Some safe commands can be opened to other roles by the streamer. |
| Viewer | Redeem a queue reward, ask for their own position, leave their own place, and see the commands allowed for their role. A viewer cannot join by typing a command. |

The streamer is identified by the Twitch account connected to this installation. Moderator access comes from Twitch's current chat badge, not from a typed name. Commands from another channel are ignored.

## What you need to get started

- A 64-bit computer with Docker installed and running. On Windows, use Docker Desktop with its WSL 2 setup. On Linux, use Docker Engine and the Compose v2 command. macOS instructions are provided, but this project's macOS behavior has not been validated.
- A current browser on the same computer.
- An internet connection for the first image download and for Twitch features.
- Access to the project and its current private image package. During this pre-release, Docker may need to sign in to GitHub Container Registry; the project README explains the access step.
- A Twitch account and a confidential app created by the streamer in the Twitch Developer Console.

You do not need to install development tools or prepare a separate service to store the app's information.

### First installation

1. Install Docker for your system, start it, and wait until Docker says it is ready.
2. Obtain the project folder and open a terminal or PowerShell window in that folder.
3. On Linux or macOS, if the start file cannot be run, use `chmod +x iniciar.sh` once.
4. Start the app with `./iniciar.sh` on Linux/macOS or `.\iniciar.bat` in PowerShell. The first start downloads the required files and prepares the local installation.
5. Trust the local certificate created in the `.local` folder, following the operating-system steps in [README](../README.md), then open `https://localhost:3000`.
6. Follow **Conexão do canal** in the panel to connect Twitch. Do not enter Twitch credentials into chat or send them to anyone.

Approximate hardware guidance for this alpha: about 2 CPU cores available to Docker, about 4 GB memory available to Docker during first setup, 8 GB total system memory as a practical target, and about 10 GB free disk space. These are estimates, not guaranteed minimums; needs can change with each version and are updated in the README.

## Connecting Twitch

In the Twitch Developer Console, create a confidential app and register the exact callback address shown by the panel. By default it is `https://localhost:3000/callback`; if the installation uses another port, register the exact address shown there.

Enter the app's Client ID and Client Secret in the panel and choose **Validar e salvar aplicativo**. The panel checks the pair before saving. After that, choose **Conectar com a Twitch** and approve the requested access:

- Manage the channel's custom rewards and redemptions.
- Read chat messages.
- Send chat messages from the connected streamer account.

The secret is masked after saving and cannot be read back from the panel. The channel must be a Twitch Affiliate or Partner and have Channel Points available for queue rewards. If it is not eligible, reward-based queues stay unavailable; the panel explains the reason in Portuguese. Manual-only operation for ineligible channels is a planned separate feature, not available in this version.

Each installation is tied to one Twitch channel and one Twitch app. Reconnecting that same channel is supported. Changing the channel or app while records exist is blocked so old rewards are not silently reassigned.

## Creating and preparing a queue

Use **Nova fila** in the panel. A new queue has a unique command name, a display title, and a Twitch custom reward created specifically for this bot. It does not adopt a reward from another app, even if that reward already exists in the channel.

You can set the queue name and aliases, reward title and description, point cost, UID mode, Twitch's own per-stream/per-viewer limits and cooldown, call text, call timeout, account switching, and point policies. Queue names use 2–24 lowercase English letters, numbers, and hyphens. The initial queue is closed while its reward is being prepared. Open it only after the panel reports the reward is ready.

- **Open:** asks Twitch to accept new redemptions. The panel shows the operation as pending until Twitch confirms it.
- **Close:** pauses new reward redemptions. Existing viewers can still be called and served; manual additions remain possible.
- **Archive:** hides the queue from `!filas` and pauses its reward. Existing entries stay available to the streamer in the panel and can still be served. Unarchiving leaves it closed.
- **Delete:** requires confirmation. The app pauses the reward, requests cancellation for every pending redemption, waits for confirmations, and only then removes the Twitch reward. If an operation is uncertain or fails, deletion stays pending for recovery. Queue history is retained.

Twitch currently permits up to 50 custom rewards for a channel; the panel warns as the channel approaches that limit. Archived rewards still count until removed from Twitch.

## Joining a queue

There are two ways to enter:

1. **Reward redemption:** a viewer redeems that queue's dedicated Channel Points reward. This spends the displayed points while the request is pending.
2. **Manual addition:** the streamer or a moderator adds a Twitch login in the panel or with `!<queue> add <user> [UID]`. The viewer cannot add themselves through chat or the panel.

There can be only one active place per viewer in the same queue, but the viewer may be active in other queues. New standard entries go to the end of their waiting line. A manually verified priority place is placed in the priority line, which is served before the standard line; order within each line remains first-in, first-out. The priority feature records the operator and a category such as PIX/external payment, Bits, or subscription. It does not verify or process that benefit. Manual entries never create Channel Points refund or consumption requests.

## After someone joins: order, UID, and privacy

The panel and chat show waiting, called, and in-service people separately. A waiting position is numbered continuously. `!<queue> posicao` reports only the sender's own place or active state; `!<queue> sair` affects only the sender's own entry.

UID is optional or required according to the queue's setting:

- **Oculto / hidden:** the reward does not ask for a UID, manual UID input is discarded, and the bot must not display or retain it for that queue.
- **Visível / visible:** the reward asks for a UID. The accepted format is exactly nine ASCII digits, after trimming spaces at the beginning and end. A manually added viewer may omit it.

This format check does not prove that the game account exists or identify its server. A UID is a public game identifier, not a password. Never send a game password, login details, email, URL, or other private text to the bot. Share sensitive coordination privately outside this application. The streamer controls whether a visible UID appears in the chat list, call message, or OBS widget. Switching a queue to hidden removes stored UIDs and pending call text that could contain one.

## Calling and serving viewers

Use `!<queue> proximo [1-10]` to call one viewer or a group. If fewer people are waiting, the bot calls the available people and reports the actual count. A call message is sent to chat using the configured safe placeholders: `{user}`, `{queue}`, `{position}`, `{uid}`, and `{account}`.

The absence timer starts only after Twitch confirms the first call message was sent. If delivery fails, the panel shows that the call needs attention; no absence decision is made until a call is confirmed. A retry does not silently extend an existing deadline.

Use `!<queue> atender [user]` to start service. Starting service stops the absence timer. Use `!<queue> concluir [user]` when the work is finished. If a call times out before service starts, the entry becomes **Ausente**; whether its points are requested back depends on the queue setting.

## How Channel Points are returned or consumed

“Requested” or “pending” means the bot has asked Twitch to change the redemption and is waiting for confirmation. It does not mean the points have already been returned or consumed. The panel's **Operações financeiras** page shows pending, confirmed, uncertain, or conflicting operations.

| Situation | Redemption result requested |
| --- | --- |
| Remove a waiting reward entry, or the viewer leaves while waiting | Cancel the redemption; points return after Twitch confirms. |
| Complete a reward entry after service | Fulfill the redemption; points are consumed after Twitch confirms. |
| Remove a called/in-service viewer by an operator | Controlled by **Solicitar reembolso ao remover pessoa chamada/em atendimento**; default is on. |
| Viewer leaves after being called or while in service | Controlled by **Solicitar reembolso se a pessoa chamada sair**; default is off. |
| A called viewer does not begin service in time | Controlled by **Solicitar reembolso quando houver ausência**; default is off. |
| Clear a queue or delete it | Requests cancellation for all active reward entries, regardless of the three options above. |
| Manually added entry | No Twitch points are involved. |

Starting service alone does not consume points; completion does. An externally confirmed cancellation or completion is recorded without sending a second request. If Twitch's final state cannot be confirmed or conflicts with the requested result, the panel keeps the issue visible for review. Removing a reward is delayed until outstanding cancellations are confirmed because deleting a reward too early can affect its pending redemptions.

## Available chat commands

The product command text is currently Portuguese. Replace `<queue>` with the queue's configured lowercase name or alias.

### Viewers

| Command | Who can use it | What it does |
| --- | --- | --- |
| `!<queue>` or `!<queue> lista` | Roles allowed for that command | Shows up to five waiting people, how many remain, and called/in-service people. |
| `!<queue> comandos` | Everyone | Shows commands allowed for the sender's role in that queue. |
| `!<queue> posicao` | Roles allowed for that command | Shows the sender's own position or state. |
| `!<queue> sair` | Roles allowed for that command | Leaves the sender's own active place. |
| `!filas` | Roles allowed for that command | Lists visible queues, including closed queues; excludes archived/deleted queues. |
| `!conta` | Roles allowed for that command | Shows the current account label. |
| `!queue comandos` | Everyone | Lists global and queue commands allowed for the sender's role. |

### Streamer and moderators

These queue-management actions are reserved to the streamer and moderators and cannot be opened to other roles:

| Command | What it does |
| --- | --- |
| `!<queue> add <user> [UID]` | Adds a person manually by Twitch login. A chat-added entry is standard priority. |
| `!<queue> remover <user>` | Removes a person's active entry. |
| `!<queue> proximo [1-10]` | Calls up to ten waiting people; default is one. |
| `!<queue> atender [user]` | Starts a called person's service. |
| `!<queue> concluir [user]` | Completes a called or in-service entry. |
| `!<queue> mover <user> <position>` | Reorders a waiting person inside their current priority line. |
| `!<queue> abrir` / `!<queue> fechar` | Opens or pauses new reward redemptions. |
| `!<queue> limpar` | Previews how many active people and reward cancellations would be affected. |
| `!<queue> limpar confirmar` | Confirms that preview for the same operator and queue, within 15 seconds, if the entries have not changed. |
| `!conta <name>` | Sets the current account label. |
| `!conta reset` | Restores the default account label. |
| `!queue ping` | Replies `Pong 🏓`, the running version, and the most recently measured Twitch response time. Streamer/moderator only. |

The streamer always has access. For supported commands, the streamer chooses an explicit list of allowed roles in **Comandos do chat**. Selected roles work independently; there is no automatic role inheritance. VIP access also depends on the separate VIP-management setting. Viewer commands have a five-second per-person cooldown; management commands do not. Replies are kept within Twitch's 500-character message limit. The parser accepts upper/lowercase and repeated spaces, and accepts `posicao`/`posição` and `proximo`/`próximo`.

## Current account

`!conta` shows the label, initially **Streamer**. The streamer or a moderator can set it with `!conta <name>` or restore the initial label with `!conta reset`. The name is a live display label, not a game login or credential.

With **Trocar conta automaticamente ao chamar uma pessoa** enabled for a queue, calling exactly one person switches the label to that viewer's display name. Calling a group never switches it. When the entry that owns the automatic switch ends, the label returns to the default. Finishing a different entry does not change it. A manual label lasts until reset or the next eligible one-person automatic switch, subject to the current owner entry.

## The control panel

The local panel is at `https://localhost:3000` by default. It includes:

- An overview with local service and Twitch connection status.
- **Filas e atendimentos** for queue members, calling, service, removal, reordering, and recent history.
- **Nova fila** for creating a dedicated reward-backed queue.
- **Operações financeiras** for pending/confirmed/uncertain point actions and recovery.
- **Comandos do chat** for the command catalog and allowed roles.
- **Widgets do OBS** for local stream labels and queue information.
- **Configurações** for account labels.
- **Conexão do canal** during setup or when reconnecting is needed; otherwise, it shows the connected account and recovery actions.

The OBS page creates local Browser Source widgets for one selected value or fixed text. Each widget link is shown only once when created or regenerated. Keep it private; revoke or replace it if exposed. The verified OBS setup is Ubuntu 24.04 with OBS Studio 32.2.2 and CEF 127. Windows and macOS OBS certificate behavior has not been verified.

## Stopping or restarting the bot

Close the app with `docker compose stop`; this pauses the app without deleting its saved information. Start it again with `docker compose start`. Restarting the computer or app preserves queues and pending operations. After reconnecting, the app checks Twitch and resumes recoverable work. Anything whose final points state cannot be confirmed remains visible for operator review.

Use the provided updater (`atualizar.bat` or `./atualizar.sh`) only with a clean project folder. It updates the current `main` version and preserves saved information. The uninstaller (`desinstalar.bat` or `./desinstalar.sh`) asks whether to keep or delete saved information. Deleting it removes queues, history, Twitch connection details, and local secrets. Do not use Docker's volume-removal option as a normal stop or update.

## Common problems

| What you see | What to do |
| --- | --- |
| The browser warns about the local certificate | Follow the certificate trust step for your system in the README, then restart the browser and reopen `https://localhost:3000`. Do not switch to an insecure address. |
| Panel says Twitch needs reconnection | Open **Conexão do canal**, reconnect the same channel, and approve the requested access. The panel and saved work remain available while reconnecting. |
| Channel is ineligible or points rewards are unavailable | Only Twitch Affiliates/Partners with Channel Points can use reward-backed queues in this version. Manual-only ineligible-channel support is planned, not yet available. |
| A reward is pending or an operation is uncertain | Open **Operações financeiras** or **Conexão do canal**, review the message, and use its retry/sync/recovery action. Do not assume points changed until confirmed. |
| A reward redemption does not appear in the queue | Confirm that the viewer redeemed this bot's own reward, that the queue is open, and that the channel connection is healthy. Other apps' rewards are not adopted. Use **Sincronizar agora** on the connection page when available. |
| A chat command is ignored | Check the queue spelling, command list with `!queue comandos` or `!<queue> comandos`, and the sender's allowed role. Management commands require streamer/moderator access. |
| A viewer cannot join | There is no viewer self-join command. They must redeem the queue reward or be added by the streamer/moderator. |
| Queue is closed | New reward redemptions are paused. The streamer/moderator can use `!<queue> abrir`; existing people can still be served. |
| A call did not start an absence timer | The bot starts it only after chat confirms the call message. Check the call in the panel and retry the notification if offered. |
| Startup or update reports that the project folder has local changes | Save those changes separately before using the updater; it intentionally refuses to replace a modified project folder. |

## Privacy and safety

The app is intended to listen only on this computer by default. The saved queue data and connection secrets stay in local app storage. Anyone with access to the computer or its saved app files may be able to access that information; local storage is not a promise of disk encryption.

The app uses Twitch account identity, chat role badges, queue entries, optional public game UID, reward status, and the minimum connection details needed to run. It should not receive passwords, Twitch secrets in chat, Genshin login details, payment receipts, or private messages. Chat text is treated as untrusted input; rejected text is not meant to be repeated back.

For a visible UID queue, tell viewers clearly that the UID may be shown publicly. Use the visibility settings for the queue list, call message, and OBS widget. If a one-time OBS link is exposed, revoke or regenerate it. Do not share installation folders, saved data, or local secret files publicly.

## What is not available yet

**Available now:** local queue management, reward-based admissions for eligible channels, manual admissions, audited operator-verified priority, command permissions, point-operation tracking, account labels, Twitch recovery controls, and local OBS widgets on the verified platform.

**Planned, not available in this version:** product-wide Portuguese/English/Spanish translation and community translation catalogs; manual-only queue operation for channels ineligible for Channel Points; multi-channel operation; Discord/private messaging; automatic verification or processing of PIX, Bits, or subscriptions; and public OBS hosting.

There is no viewer self-enrollment command, game-account verification, payment collection, or second bot account.

## Items to confirm

- The project includes automated tests and local integration evidence. A complete eligible-channel live session that creates/opens a reward, receives a viewer redemption, and confirms real cancellation/fulfillment has not been verified.
- An authorized read-only Twitch health check was recorded, but it does not verify reward writes, chat delivery, or real points changes.
- Invalid-UID redemptions are recorded for cancellation without creating a queue entry. The current chat handler was not found to send the specific explanatory message described in the original product requirements.
- Windows first-run testing reported a repeated input-redirection warning in the helper. A proposed automated check exists, but a later manual Windows run has not confirmed the warning is gone.
- macOS setup and OBS certificate trust have not been tested by this project.
- FND-8 translation is a planning draft. The panel/chat remain Portuguese-only; commands such as `!queue` are not yet translated.
- The current uninstaller choices and updater were described from the checked-in scripts; this guide task did not run them.

## How this guide was verified

This guide was compared with the [project README](../README.md), [integration notes](integrations.md), [story progress](stories.md), and the current queue, command, and recovery behavior. Planned work was not presented as available.
