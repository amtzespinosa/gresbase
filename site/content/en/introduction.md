---
description: What Gresbase is, who it's for, what it leaves out and what you need to run it.
---

## What Gresbase is {#what-it-is}

Gresbase is a web manager for PostgreSQL. It ships as one Docker image that you add to your `docker-compose.yml` next to your database.

It replaces tools like Adminer or pgAdmin in your own projects. You browse and edit tables, change their structure, import and export data, and run SQL from the browser.

- **One image, no required variables.** Configure it with environment variables or with the [setup wizard](./setup-wizard.md).
- **Safe by default.** Edits wait as pending changes until you review and save them, and you can undo.
- **Keyboard first.** Shortcuts everywhere and a command palette on <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> on macOS).
- **English and Spanish**, light and dark theme.
- **No telemetry.** The app only talks to the databases you configure. It works without internet access: fonts and scripts are inside the image.

## Who it's for {#who-its-for}

Developers and small teams who run PostgreSQL in Docker and want a clean, fast UI for their data. You keep it on your machine, or put it behind your own HTTPS proxy with an account.

## What it doesn't do {#what-it-doesnt-do}

Gresbase covers day-to-day work with data and tables. Some things are planned for later versions and aren't in the app yet:

- Managing PostgreSQL roles, extensions, functions, triggers, RLS policies or enums from the interface. You can still run that SQL in the [SQL editor](./sql-editor.md).
- Backing up your databases. Gresbase only keeps its own settings in `/data`; your data's backups are up to you (see [Backups](./backups.md)).
- Teams: there is one administrator account, no per-user roles, invitations or SSO. [Free mode](./free-mode.md) lets each person sign in with their own PostgreSQL user instead.
- A visual schema, metrics or a visual `EXPLAIN`.
- Other engines. Gresbase is PostgreSQL only.

:::note
The real security boundary is the PostgreSQL role Gresbase connects with. Give it only the privileges it needs. See [Connecting to PostgreSQL](./connecting.md).
:::

## Requirements {#requirements}

- **Docker**, with Compose if you follow the [quick start](./quick-start.md). Plain [`docker run`](./docker-run.md) works too.
- **A PostgreSQL server** the container can reach, and a user to connect with.

### Supported PostgreSQL versions {#postgres-versions}

| Version | Support |
| --- | --- |
| 14, 15, 16, 17, 18 | Full |
| 19 | Full. While it's in beta, the connection card warns that it's a pre-release. |
| 12, 13 | Legacy: everything works, a few features depend on the version, and the connection card warns you. |
| 11 and older | Not supported. Gresbase refuses to connect and says why. |

Features that only exist in newer PostgreSQL versions turn on by themselves when the server has them. For example, `MERGE` needs PostgreSQL 15.
