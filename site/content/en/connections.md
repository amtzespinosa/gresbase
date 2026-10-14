---
description: Keep several databases in one Gresbase, tell them apart by color and switch between them in each browser tab.
---

## What a saved connection is {#what}

A saved connection is a database that Gresbase remembers: server, port, database, user, password and SSL mode. You can have several, next to the one in `DATABASE_URL`.

Only the administrator manages them, in **Settings**, section **Connections**. Free mode has no saved connections: each person signs in with their own credentials (see [Free mode](./free-mode.md)).

## Add a connection {#add}

:::steps
### Open the form

Go to **Settings** and click **Add connection** in the **Connections** section. The **New connection** dialog opens.

### Name it and pick a color

Type a **Name**, such as "Production" or "Staging". If you leave it empty, Gresbase uses the database name. Pick a **Label color**.

### Fill in the database

Type **Host**, **Port**, **Database**, **User** and **Password**, and choose the **SSL** mode. You can also paste a URL in **Connection URL** to fill the fields. Tick **Read-only** if this connection must never write.

### Test and save

Click **Test connection**. If it works, you see "Connected to PostgreSQL" and the version. Then click **Save connection**.
:::

If the test fails, the message says why. The reasons are listed in [Connecting to PostgreSQL](./connecting.md#errors).

## Label colors {#colors}

Each connection has a label color: **Gray**, **Red**, **Orange**, **Green**, **Blue** or **Purple**. Gray is the default.

The color shows as a stripe on the connection card of the sidebar, and as a dot in the selector and in Settings. Use it to tell production from test at a glance. For example, red for production and green for your local copy.

## Switch connection {#switch}

When there is more than one connection, the connection card of the sidebar shows a **Switch connection** button. It lists every connection with its color, its status and its PostgreSQL version.

- Each browser tab works on its own connection. The address carries it (`/c/<id>/…`), so two tabs can show two databases.
- In Settings, the connection of the current tab shows the **This tab** badge.
- The [command palette](./command-palette.md) has a **Connections** group with **Switch to** followed by each name.

When you open Gresbase without choosing, it uses the `DATABASE_URL` connection or, without it, the first saved one.

## Edit or delete {#edit}

Each saved connection has two buttons in Settings: **Edit** and **Delete**, followed by its name.

- When editing, leave **Password** empty to keep the current one. Gresbase never sends a saved password back to the browser.
- Saving closes the open connections to that database. The next request uses the new details.
- Deleting asks for confirmation. Gresbase forgets the connection and its password. The database itself is not touched.

## The DATABASE_URL connection {#database-url}

If `DATABASE_URL` is set, its connection appears first in the list, in gray, named after its database. It shows a lock: "Defined by DATABASE_URL: it can only be changed in the environment." To change it, edit the variable and recreate the container.

## Per-connection read-only {#read-only}

**Read-only** in the form only affects that connection. `GRESBASE_READ_ONLY` affects all of them, whatever each connection says. Read-only connections show the **Read-only** badge in Settings. The details are in [Read-only mode](./read-only.md).

## Fixed server {#fixed-server}

With `GRESBASE_DB_HOST`, `GRESBASE_DB_PORT`, `GRESBASE_DB_NAME` or `GRESBASE_DB_USER`, the form's **Host**, **Port**, **Database** or **User** field is locked to that value. It shows "Defined by the environment variable" and the variable's name. This keeps every connection on the same server.

## Where they are stored {#storage}

Saved connections live in `gresbase.json`, in the data directory. Passwords are encrypted with AES-GCM using the secret key (`GRESBASE_SECRET_KEY` or `secret.key`). Saved queries that belong to one connection go in a folder named `@` plus its id.

:::warning
If the data directory is not writable, saved connections live in memory and disappear on restart. If the secret key changes, saved passwords can no longer be read: edit each connection and type its password again. See [The data volume](./data-volume.md).
:::

## Pools and limits {#pools}

Gresbase opens a pool for a connection the first time someone uses it. Each pool opens up to `GRESBASE_MAX_CONNS` connections. At most `GRESBASE_MAX_POOLS` pools are open at once. A pool unused for `GRESBASE_POOL_IDLE_TIMEOUT` closes, except the one of `DATABASE_URL`. See [Environment variables](./environment.md).
