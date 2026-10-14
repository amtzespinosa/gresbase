---
description: Back up and restore what Gresbase keeps in /data, so a lost volume doesn't cost you your connections and saved queries.
---

## What to back up {#what}

Gresbase keeps its own state in `/data` (or in `GRESBASE_DATA_DIR`, if you set it):

| Path | What it holds |
| --- | --- |
| `gresbase.json` | Settings changed in the app, saved connections, the administrator account, the mode chosen in the setup wizard. Passwords of saved connections and the session secret are encrypted. |
| `secret.key` | The key that encrypts those secrets. Created on first start when `GRESBASE_SECRET_KEY` is not set. |
| `snippets/` | Saved queries, as `.sql` files. Queries of one connection live in a folder `@<id>/`. |

Back up the three together. `gresbase.json` without its key loses the encrypted secrets.

:::note
This does not back up your databases. They belong to your PostgreSQL server: use `pg_dump` for them.
:::

The SQL editor history and the interface preferences live in each browser, not in `/data`. A backup does not include them.

## Back up a Docker volume {#backup}

The Gresbase image has no shell or `tar`, so a throwaway container does the copy. Stop Gresbase first so the files don't change mid-copy.

:::steps
### Find the volume name {#volume-name}

Compose prefixes the volume with the project name, for example `myproject_gresbase-data`. List them:

```sh
docker volume ls
```

### Stop Gresbase {#stop}

```sh
docker compose stop gresbase
```

### Copy the volume to a file {#copy}

Replace `gresbase-data` with the name you found. The archive lands in the current folder.

```sh
docker run --rm \
  -v gresbase-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/gresbase-data.tar.gz -C /data .
```

### Start Gresbase again {#start}

```sh
docker compose start gresbase
```
:::

If you mount a host folder instead of a volume (`./data:/data`), copy that folder.

:::warning
The archive contains `secret.key`, which decrypts the saved passwords. Store it as carefully as the passwords themselves.
:::

## Restore {#restore}

:::steps
### Stop Gresbase {#restore-stop}

```sh
docker compose stop gresbase
```

### Unpack the archive into the volume {#unpack}

This empties the volume first, then extracts the copy.

```sh
docker run --rm \
  -v gresbase-data:/data \
  -v "$PWD":/backup \
  alpine sh -c "rm -rf /data/* /data/.[!.]* ; tar xzf /backup/gresbase-data.tar.gz -C /data"
```

The image runs as user `65532`, which must be able to write in `/data`. The archive keeps owners and permissions, so the extracted files, and `/data` itself, stay owned by `65532`, even in a new, empty volume. No `chown` is needed.

### Start Gresbase {#restore-start}

```sh
docker compose start gresbase
```
:::

If the restored copy comes from a newer Gresbase, an older one refuses to start. See [Upgrading](./upgrading.md#volume).

## The encryption key {#secret-key}

Secrets in `gresbase.json` are sealed with one key. Gresbase takes it from one of two places:

- **`GRESBASE_SECRET_KEY`**, if set. At least 32 characters. The file `secret.key` is then neither read nor created.
- **`secret.key`** in the data directory otherwise. It holds 64 hexadecimal characters and is created on first start.

If the key changes or goes missing, Gresbase still starts, but it can't decrypt what was sealed with the old one:

- Everyone is signed out, unless `GRESBASE_SESSION_SECRET` is set. A new session secret replaces the old one.
- Saved connections lose their password. Edit each one and type it again. See [Saved connections](./connections.md).
- The administrator account keeps working. Its password is stored as a hash, not encrypted.

:::tip
If you set `GRESBASE_SECRET_KEY`, keep it with your other secrets. A backup of `/data` alone can't decrypt anything without it.
:::

A `secret.key` that isn't 64 hexadecimal characters stops Gresbase at startup, with the message `/data/secret.key is not a valid key (64 hex characters)`.
