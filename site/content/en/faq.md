---
description: Short answers to the questions people ask before and after installing Gresbase.
---

## Does Gresbase send telemetry? {#telemetry}

No. Gresbase makes no network requests except to the databases you connect it to.

## Does it work offline? {#offline}

Yes. Fonts, icons and the whole interface are inside the image. Nothing loads from a CDN.

## Which PostgreSQL versions does it support? {#postgres-versions}

12 to 19. Versions 14 to 18 have full support. 12 and 13 work with some features limited, and the connection card says so. 19 is tested against its pre-release builds. Gresbase refuses 11 and older with **Gresbase needs PostgreSQL 12 or newer.**

## Can I manage several databases? {#several-databases}

Yes. The administrator can save several connections and switch between them. Each browser tab can use a different one. See [Saved connections](./connections.md).

In [free mode](./free-mode.md), each person signs in with their own PostgreSQL credentials.

## Can I make it read-only? {#read-only}

Yes, for every connection with `GRESBASE_READ_ONLY=true`, or for one saved connection. Gresbase blocks writes twice: in the PostgreSQL session and in its own API. See [Read-only mode](./read-only.md).

## Where does Gresbase store its data? {#data}

In `/data` inside the container: `gresbase.json`, `secret.key` and the `snippets/` folder. Mount a volume there to keep it. Your databases stay in PostgreSQL. See [The data volume](./data-volume.md) and [Backups](./backups.md).

## Can I use it without Docker? {#without-docker}

Yes, by building the binary from source. It is one file with the interface inside. Outside a container, set `GRESBASE_DATA_DIR` to a writable folder: the default is `/data`. See [Building from source](./building.md).

## Do I need to set any variable? {#variables}

No. Without `DATABASE_URL`, Gresbase starts a setup wizard in the browser. See [Setup wizard](./setup-wizard.md).

## Which languages does it speak? {#languages}

English and Spanish. Each person can pick one; `GRESBASE_LANG` sets the default.

## What license does it use? {#license}

Apache 2.0. The name and the logo are not covered by it. See [License](./license.md).
