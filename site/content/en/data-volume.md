---
description: What Gresbase keeps in /data, what lives elsewhere, and how to keep that directory safe and writable.
---

## What is in /data {#contents}

Gresbase keeps its own state in one directory, `/data` by default. Change it with `GRESBASE_DATA_DIR`. If it doesn't exist, Gresbase creates it.

| Path | What it holds |
| --- | --- |
| `gresbase.json` | Settings changed in the app, the administrator account, the mode chosen in the setup wizard, saved connections and sealed secrets. |
| `secret.key` | The key that encrypts the secrets of `gresbase.json`. It is created on first start, unless you set `GRESBASE_SECRET_KEY`. |
| `snippets/` | Saved queries, one `.sql` file each. Those of a single connection go in a folder named `@` plus its id; those of free mode users, in `.private/`. |

Inside `gresbase.json`:

- The administrator password is stored only as an argon2id hash.
- Saved connection passwords and the session key are encrypted with AES-GCM. They never appear in clear.
- Settings are stored as plain values. None of them is a secret.

Gresbase writes its files atomically and with `0600` permissions, so only its user can read them.

## What is not in /data {#not-stored}

- **Your database.** Gresbase never copies it. Back it up with your usual tools.
- **SQL history.** It stays in your browser (IndexedDB).
- **Preferences:** theme, language choice, grid density, open tabs and table views. They stay in your browser (`localStorage`). See [Language and theme](./preferences.md).
- **Free mode passwords.** They live in server memory for the session only.

Another browser or a cleared browser starts with an empty history and default preferences.

## Mount a volume {#mount}

Mount a named volume on `/data`, as in the [quick start](./quick-start.md):

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    volumes:
      - gresbase-data:/data

volumes:
  gresbase-data:
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -v gresbase-data:/data \
  {{image}}
```
:::

The image declares `/data` as a volume. If you mount nothing, Docker creates an anonymous one, which you lose by removing the container. Gresbase notices and warns (see [When Gresbase warns](#warnings)).

## Permissions {#permissions}

The image runs as the `nonroot` user, uid `65532`. Its `/data` directory already belongs to that user, so a new named volume works as is.

With a bind mount (a host folder), give the folder to that uid first:

```sh
mkdir -p ./gresbase-data
sudo chown 65532:65532 ./gresbase-data
```

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    volumes:
      - ./gresbase-data:/data
```

## When Gresbase warns {#warnings}

Gresbase checks the mounts of its own container at startup. It warns when `/data` would not keep its files:

| Case | Lost | Log at startup |
| --- | --- | --- |
| No volume: Docker's anonymous one | When the container is removed | `data dir is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on it` |
| No mount at all (an image without `VOLUME`) | When the container is removed | `data dir is inside the container: saved queries and settings are lost when the container is removed. Mount a named volume on it` |
| A `tmpfs` | On every restart | `data dir is a tmpfs: saved queries and settings are lost on every restart` |
| Not writable | On every restart | `data dir is not writable: saved queries and settings live in memory and are lost on every restart` |

A named volume or a host folder (bind mount) gives no warning.

The app says the same, with the reason, in **Settings** (for the administrator), in the saved queries of the SQL editor and in the setup wizard (**Settings are not persistent**, with a Compose snippet). For example: "The data directory is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them."

## If /data is not writable {#not-writable}

Gresbase still starts and works, but keeps everything in memory:

- Settings, saved connections and the administrator account are lost on restart.
- Saved queries go to a temporary folder and are lost too.
- The secret key is random on each start, so sessions end with every restart.

The log and the app warn as in [When Gresbase warns](#warnings): "The data directory is not writable: saved queries and settings live in memory and are lost on every restart. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them."

## The secret key {#secret-key}

Gresbase looks for the key in this order:

1. `GRESBASE_SECRET_KEY`, at least 32 characters. Use it to keep the key out of the volume, for example in a Docker secret.
2. `secret.key` in the data directory: 64 hexadecimal characters, created on first start.

If `secret.key` exists but is not valid, Gresbase doesn't start and says the file is not a valid key (64 hex characters).

:::danger
If you lose the key or change it, the sealed secrets can no longer be decrypted. Gresbase still starts, but every session ends and saved connections lose their password. Edit each connection and type its password again. The administrator account and the settings are not affected.
:::

## Backups {#backups}

Copy `gresbase.json`, `secret.key` and `snippets/` together. Without the matching key, the passwords in a copy of `gresbase.json` are useless. If you use `GRESBASE_SECRET_KEY`, keep its value with the copy. Step by step in [Backups](./backups.md).

## Versions of gresbase.json {#versions}

`gresbase.json` carries a schema version. A newer Gresbase upgrades an older file when it opens it. An older Gresbase refuses a file written by a newer one, with a message like `written by a newer Gresbase (schema 2, this one reads up to 1)`. See [Upgrading](./upgrading.md).
