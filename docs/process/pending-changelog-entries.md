# Pending changelog entries (not yet released)

[Português brasileiro](../pt-BR/process/pending-changelog-entries.md)

`docs/VERSIONING.md` forbids an `Unreleased` section in the public changelogs, and the published `v0.3.0-beta` section must stay as released (2026-11-06). Entries for the next version wait here and move into the new `## vX.Y.Z-beta` section (both languages, with the colored category squares) when `@devops` cuts the next bump (D-12, 2026-11-14).

## 🟦 Changed

- The `db` and `bot` containers now use `restart: unless-stopped`. Existing installations only receive it after `docker compose up -d`, which recreates `db` and `bot`.

Portuguese text for the same entry: `docs/pt-BR/process/pending-changelog-entries.md`.

Note: this entry had been added by mistake to the already published `v0.3.0-beta` section in the working tree of the old branch; that edit must not be carried to the new branch.
