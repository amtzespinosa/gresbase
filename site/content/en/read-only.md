---
description: Open a database to look without risk of changing anything, for every connection or for a single one.
---

## Turn it on {#turn-on}

There are three ways, from broadest to narrowest:

- **For every connection:** set `GRESBASE_READ_ONLY=true`. It covers `DATABASE_URL`, saved connections and free mode sessions.
- **From the app:** the administrator can switch on **Read-only** in **Settings**. It has the same effect as the variable and applies on restart. If the variable is set, the setting is locked.
- **For one saved connection:** tick **Read-only** in its form. See [Saved connections](./connections.md#read-only).

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
      GRESBASE_READ_ONLY: "true"
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -e DATABASE_URL=postgres://app:secret@db:5432/app \
  -e GRESBASE_READ_ONLY=true \
  {{image}}
```
:::

## Two layers {#layers}

Read-only mode works at two levels, so a gap in one is covered by the other:

1. **In PostgreSQL.** Every connection opens with `default_transaction_read_only=on`. PostgreSQL itself refuses any write.
2. **In the API.** Before touching the database, Gresbase refuses edits, imports, structure changes and SQL transactions with a `403` and the `read_only` code.

The SQL editor runs every statement inside a read-only transaction. It refuses `BEGIN`, `COMMIT`, `ROLLBACK` and similar statements, so a query can't step out of it.

## What you see {#ui}

The sidebar shows the **Read-only** badge. Its tooltip says: "Read-only mode is on: nothing here can change your data. Saved queries still work."

These controls disappear:

- Editing cells, inserting and deleting rows. The table shows **Read-only** with the hint "Gresbase is in read-only mode, so rows can't be edited."
- The **New table** button.
- The table actions menu: **Rename…**, **Edit comment…**, **Move to schema…**, **Empty table…** and **Delete table…**.
- **Import CSV** and, in the table's context menu, **Import CSV…**.
- Structure editing.
- The **Transaction mode** switch of the SQL editor.

Browsing, filtering, exporting and running `SELECT` queries still work. You can still save queries: they live in the data volume, not in the database.

If a write reaches the API anyway, the message is "Gresbase is in read-only mode, so changes are blocked."

## A read-only PostgreSQL user {#postgres-role}

Gresbase also notices when the PostgreSQL user (or the database) has `default_transaction_read_only` set to `on`. The interface then behaves as above, and so does the SQL editor: it runs every statement in a read-only transaction, refuses `BEGIN`, `COMMIT` and the like, and has no transaction mode. A `SET default_transaction_read_only = off` or a `BEGIN READ WRITE` cannot lift it. See [Connecting to PostgreSQL](./connecting.md#read-only-user).

:::warning
Read-only mode and the warnings before destructive SQL help you avoid mistakes. They are not a security barrier. What really protects your data is the PostgreSQL user that Gresbase connects with: if the data must not change, give it only `SELECT`.
:::
