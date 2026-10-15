---
description: What changed in each version of Gresbase, newest first.
---

:::note
v0.3.0 is the first public version; v0.1.0 and v0.2.0 were never published.
:::

## v0.4.0 (2026-10-14) {#v0-4-0}

**Search all tables at once.** Type a term and Gresbase looks for it in every table the role can read, and in the names of tables, views and columns. Results arrive table by table as each one answers, and a row opens its table filtered to it, with the matching column highlighted. See [Search all tables](./global-search.md).

### Added {#v0-4-0-added}

- [Global search](./global-search.md): a term in every table the role can read, and in the names of tables, views and columns. Results arrive table by table and can be canceled. A row opens its table filtered to it, with the matching column highlighted. It works read-only, in free mode and behind a proxy.

### Changed {#v0-4-0-changed}

- The Studio edition moves to v0.5 in the roadmap.
- The cell editor is the cell itself: grown over its neighbours, on a light background with a rounded 2 px accent border, and no field box inside.
- Signing out asks first, and says when unsaved grid changes would be lost or an open SQL transaction rolled back.

## v0.3.0 (2026-10-14) {#v0-3-0}

Polish of the base product, and fixes from using it on real projects.

### Added {#v0-3-0-added}

- Structure editing: create tables, and add, rename, retype or drop columns. Also indexes, unique and check constraints, and foreign keys. Every change shows the exact SQL and its warnings before it runs. Drops ask you to type the name.
- Columns: hide, reorder, resize and reset the view. Saved per connection and table, with pinned columns and rows.
- Rectangular selection, copy as TSV, CSV, JSON or `INSERT`, and paste from a spreadsheet into the change queue.
- Table tabs, favorites and recents per connection, also in the command palette.
- SQL editor tabs per connection, and `:name` parameters sent as bound parameters.
- Settings screen with general, connections, security, SQL editor and about sections. Settings set by environment variables are locked.
- Row selection with a click, a resizable table list, and context menus in the table list, the SQL history and saved queries.
- Free mode: private saved queries for each user and server, and a session menu with **Switch connection** and **Disconnect**.
- `GRESBASE_DB_NAME` and `GRESBASE_DB_USER` fix the database and user of the connection forms. With host, database and user fixed, free mode only asks for the password.
- `GRESBASE_TRUSTED_PROXIES`: behind those proxies, the sign-in limit uses the client's own IP.
- Setup token: the log carries a ready `/setup#token=…` link, and `gresbase setup-token` prints the token inside the container.
- Long SQL queries, CSV imports and structure changes stay alive behind Nginx or Cloudflare, with no proxy timeout to raise.

### Changed {#v0-3-0-changed}

- Initial JavaScript halved (510 → 275 KB gzip): heavy screens load on demand. Tablet layout fixes.
- A typed value that doesn't fit its column now blocks saving instead of failing on the server.
- Tables with a primary key show the newest rows first by default.
- Licensed under Apache 2.0.

### Fixed {#v0-3-0-fixed}

- The SQL editor selection was hidden behind the active line.
- The cell editor has a single accent border, both language flags have the same size, and the row panel footer stays at the bottom.
- The `host_not_allowed` connection failure has its own message.
- A relative `GRESBASE_DATA_DIR` no longer shows the warning about data that isn't kept.

### Security {#v0-3-0-security}

- A role with `default_transaction_read_only` could lift it from the SQL editor. The editor now treats that role as read-only.
- The sign-in limit counts only failed attempts.
- The warning about data that isn't kept now detects an anonymous volume, the container layer and tmpfs, and says when the data would be lost.

## v0.2.0 (unreleased) {#v0-2-0}

Compatibility, access and configuration.

### Added {#v0-2-0-added}

- PostgreSQL 12 to 19, with capabilities per version. Notices for legacy and pre-release servers, and a clear refusal of 11 and older.
- Zero mandatory variables: settings in `gresbase.json`, with encrypted secrets. Environment variables win over the file, and the file over the defaults.
- Local administrator account and a password change that ends the other sessions.
- Connection manager: one pool per connection, and idle pools are closed.
- Setup wizard on first start, protected by a setup token unless the request is local.
- Free mode, like Adminer (`GRESBASE_MODE_FREE`), with `GRESBASE_ALLOWED_DB_HOSTS` and session limits.
- Saved connections with color labels, a selector in the connection card and in <kbd>⌘</kbd> <kbd>K</kbd>, and one connection per browser tab.

### Fixed {#v0-2-0-fixed}

- The destructive SQL detector flags `MERGE … THEN DELETE/UPDATE` and an unconditional `WHEN NOT MATCHED BY SOURCE`.
- Canceling a query while it waited for a pool connection was lost.
- Idle pool timing used the wall clock.
- Test containers no longer stall when the disk is under pressure.

## v0.1.0 (2026-10-10, unreleased) {#v0-1-0}

First version (MVP).

### Added {#v0-1-0-added}

- One image and one binary with the frontend embedded. Configuration through environment variables, `/healthz` and `gresbase healthcheck`.
- Floating, collapsible sidebar, light, dark and auto themes, English and Spanish, and state kept in the URL.
- Optional sign-in with signed cookies, rate limiting, a CSRF header and a `Host` guard when there is no sign-in.
- Table browser and data grid: filters, multi-column sort, keyset pagination, exact count, long and binary values, and the equivalent SQL.
- Safe editing: change queue with a diff, one transaction per save, conflict detection, undo and redo, cascade impact, and typed confirmation to empty or delete a table.
- Structure and relations tabs, generated DDL, foreign key jumps and "referenced by".
- SQL editor: autocomplete, run one statement or all, cancel, error position, transactions, confirmation for destructive SQL, history and saved queries.
- Command palette (<kbd>⌘</kbd> <kbd>K</kbd>) and keyboard shortcuts help.
- CSV and JSON export in streaming, and CSV import into existing tables with a per-row error report.
- Read-only mode in two layers.
- Column and row pinning, kept per table in the browser.

### Hardening before release {#v0-1-0-hardening}

- CSV export runs a parameterized query and writes the CSV in Go.
- An open SQL transaction is rolled back when you leave the page. On load, the editor offers to resume or roll back the ones still open.
- CSV import has its own timeout (`GRESBASE_IMPORT_TIMEOUT`, `10m` by default) and stops when the client disconnects.
- SQL autocomplete suggests unqualified columns from the tables in the current statement.
- Generated DDL includes the sequences of `serial` columns and their `OWNED BY`.
- Dark theme: muted text reaches a 4.5:1 contrast on edited cells.

The full list is in [CHANGELOG.md](https://github.com/amtzespinosa/gresbase/blob/main/CHANGELOG.md).
