---
description: Move to a new Gresbase version without losing your settings, saved connections or saved queries.
---

## Before you start {#before-you-start}

Everything Gresbase keeps lives in the `/data` volume. Your PostgreSQL databases are never touched by an upgrade.

Make a copy of `/data` first. Upgrading can rewrite `gresbase.json` in a format an older version can't read. See [Backups](./backups.md).

## Upgrade the container {#upgrade}

:::steps
### Pick the version {#pick}

Each release publishes the image with these tags (`.goreleaser.yaml`). For version 0.3.0:

| Tag | What it points to |
| --- | --- |
| `0.3.0` | Exactly that version. It never changes. |
| `0.3` | The newest 0.3.x: fixes only. |
| `latest` | The newest version of all, including a future 0.4 or 1.0. |

Before 1.0, a new minor version (0.4) may change things, so in production pin the minor version in the `image:` line: `{{imageName}}:0.3`. From 1.0 on, each release also gets a major tag (`1`): the newest 1.x, never a new major version. The quick start uses `latest`.

### Pull and recreate {#recreate}

:::tabs
@tab docker-compose.yml {#compose}
```sh
docker compose pull gresbase
docker compose up -d gresbase
```
@tab docker run {#run}
```sh
docker pull {{image}}
docker stop gresbase
docker rm gresbase
docker run -d --name gresbase \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

With `docker run`, repeat the same `-e` variables you used before. Removing the container does not remove the `gresbase-data` volume.

### Check the version {#check}

Run `docker compose logs gresbase`. The `starting gresbase` line includes `version=…`. In the app, **Settings** › **About** shows **Gresbase version**.
:::

:::warning
Never run `docker compose down -v` to upgrade. The `-v` flag deletes the volume, and with it the saved connections, the administrator account and the saved queries.
:::

## The data volume across versions {#volume}

`gresbase.json` carries a `version` field: the schema of the file. This version of Gresbase writes schema `1`.

- **Older file:** Gresbase migrates it when it opens it and saves it in the new format. A file without `version` (schema 0) was a flat list of settings; it becomes schema 1.
- **Newer file:** Gresbase refuses to start. The log says `invalid configuration:` followed by `/data/gresbase.json: written by a newer Gresbase (schema 2, this one reads up to 1)`, with the numbers it found.

To go back to an older version, restore the copy of `/data` you made before upgrading.

Today `gresbase.json` uses version 1 of the format. `secret.key` (a key in hex) and `snippets/` (plain `.sql` files) have no format version. The release notes of each version will say if a format changes and whether you need to do anything.

## What's new {#release-notes}

Each version's changes are in the [Changelog](./changelog.md). Read it before upgrading: it lists new settings and behaviour that changed.
