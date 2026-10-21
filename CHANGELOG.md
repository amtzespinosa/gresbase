# Changelog

v0.3.0 is the first public version; v0.1.0 and v0.2.0 were never published.

## v0.4.1 (2026-10-21)

A fix for signing in again in free mode.

### Fixed

- Free mode: signing in again after the session expired opened the previous page on the ended
  session's connection and showed no database until signing out and in again. A link, bookmark or
  return page with a connection that no longer exists now opens the same screen on the session's own.

### Changed

- The image describes itself: its labels carry a description, the documentation link and the license,
  shown on its registry page and by `docker inspect`.

## v0.4.0 (2026-10-14)

**Search all tables at once.** Type a term and Gresbase looks for it in every table the role can read,
and in the names of tables, views and columns. Results arrive table by table as each one answers, and a
row opens its table filtered to it, with the matching column highlighted.

### Added

- Global search: a term in every table the role can read (text with `ILIKE`, exact numbers, uuids and
  dates), and in the names of tables, views and columns. Results stream table by table with progress
  and can be canceled; a row opens its table filtered to it, with the matching column highlighted.
  Schemas can be limited and stay in the URL; large tables are opt-in; a table that is too slow can be
  retried with more time. It works read-only, in free mode and behind Nginx or Cloudflare.

### Changed

- The Studio edition moves to v0.5 in the roadmap.
- The cell editor is the cell itself: grown over its neighbours, on a light background with a rounded
  2 px accent border, and no field box inside.
- Signing out asks first, and says when unsaved grid changes would be lost or an open SQL transaction
  rolled back.

## v0.3.0 (2026-10-14)

Polish of the base product, and fixes from using it on real projects.

### Added

- Structure editing: create tables; add, rename, retype (with `USING`), drop columns, `NOT NULL` and
  defaults; rename, comment and move tables; indexes (ordered columns, unique, method, partial,
  `CONCURRENTLY`), unique and check constraints and foreign keys with `NOT VALID` and validate. Every
  change shows the exact SQL and its warnings before running; drops ask for the typed name.
- Columns: hide, reorder (drag or keyboard), resize, "Reset view"; saved per connection and table
  together with pinned columns and rows.
- Rectangular selection, copy as TSV/CSV/JSON/`INSERT`, paste from a spreadsheet into the change queue
  (one undo step, extra rows inserted on request, invalid values marked and blocking save).
- Table tabs (close, close others, reorder, Alt+W), favorites and recents per connection, also in ⌘K.
- SQL editor tabs per connection and `:name` parameters sent as bound parameters.
- Settings screen: general, connections, security (change password), SQL editor and about; settings
  defined by environment variables are locked; grid density.
- Row selection with a click, a resizable table list, context menus in the table list, the SQL history
  and saved queries, and an own checkbox with 24 px targets.
- Free mode: private saved queries per user and server (`snippets/.private/`), and a session menu with
  "Switch connection" and "Disconnect", each confirmed.
- `GRESBASE_DB_NAME` and `GRESBASE_DB_USER` fix the database and user of the connection forms; with host,
  database and user fixed, free mode only asks for the password.
- `GRESBASE_TRUSTED_PROXIES`: behind those proxies the sign-in limit uses the client IP from
  `X-Forwarded-For`.
- Setup token: the log carries a `/setup#token=…` link, and `gresbase setup-token` prints the token
  inside the container.
- Long SQL queries, CSV imports and structure changes stay alive behind Nginx or Cloudflare with
  heartbeats; no proxy timeout to raise.

### Changed

- Initial JavaScript halved (510 → 275 KB gzip) by loading heavy screens on demand; tablet layout fixes.
- A typed value that does not fit its column now blocks save instead of failing on the server.
- Tables with a primary key show the newest rows first by default.
- Licensed under Apache 2.0.

### Fixed

- The SQL editor selection was hidden by the active line.
- Single accent border on the cell editor; flags with the same size; the row panel footer stays at the
  bottom.
- Own message for the `host_not_allowed` connection failure.
- A relative `GRESBASE_DATA_DIR` no longer shows the "data is not persistent" warning.

### Security

- A role with `default_transaction_read_only` could lift it from the SQL editor (`SET … = off`); the
  editor now treats that role as read-only.
- The sign-in limit counts only failed attempts.
- The "data is not persistent" warning now detects an anonymous volume, the container layer and tmpfs,
  and says when the data would be lost.

## v0.2.0 (unreleased)

Compatibility, access and configuration.

### Added

- PostgreSQL 12 to 19 (19 against its beta while in pre-release); capabilities per version, notices for
  legacy and pre-release servers, clear refusal of 11 and older. `docs/compatibility.md`.
- Zero mandatory variables: settings in `gresbase.json` (environment > file > default) with encrypted
  secrets; `GET/PATCH /api/v1/settings`.
- Local administrator account (argon2id) and password change that ends other sessions.
- Connection manager: one pool per connection, routes `/api/v1/c/{connection}/…`, idle pools closed.
- Setup wizard on first start, protected by a setup token unless the request is local.
- Free mode like Adminer (`GRESBASE_MODE_FREE`), with `GRESBASE_ALLOWED_DB_HOSTS` and session limits.
- Saved connections with color labels, selector in the connection card and ⌘K, one connection per
  browser tab, saved queries per connection.

### Fixed

- The destructive-SQL detector flags `MERGE … THEN DELETE/UPDATE` and unconditional
  `WHEN NOT MATCHED BY SOURCE`.
- Canceling a query while it waited for a pool connection was lost.
- Idle pool timing used the wall clock.
- Test containers no longer stall under disk pressure (data on tmpfs, `initdb --no-sync`).

## v0.1.0 (2026-10-10, unreleased)

First version (MVP).

### Added

- Single image and binary that embeds the frontend; configuration through environment variables,
  `/healthz` and `gresbase healthcheck`, startup with retries and clear connection errors.
- App shell: floating, collapsible sidebar, light/dark/auto themes, English and Spanish, stateful URLs.
- Optional login with signed cookies, rate limiting, CSRF header and a `Host` guard when there is no login.
- Table browser and data grid: filters, multi-column sort, keyset pagination, exact count, long and
  binary values, equivalent SQL.
- Safe editing: change queue with diff, one transaction per save, conflict detection, undo/redo before
  and after saving, cascade impact, typed confirmation to empty or delete a table.
- Structure and relations tabs, generated DDL, foreign key jumps and "referenced by".
- SQL editor: autocomplete, run statement or all, cancel, error position, transaction mode,
  destructive-SQL confirmation, history and saved queries.
- Command palette (⌘K) and keyboard shortcuts help.
- CSV/JSON export in streaming and CSV import into existing tables with a per-row error report.
- Read-only mode in two layers.
- Column and row pinning, persisted per table in the browser.
- Wide sample table and a `postgres_fdw` foreign table in the sample seed.

### Hardening before release

- CSV export runs a parameterized query and writes the CSV in Go (no values inside the SQL).
- An open SQL transaction is rolled back when the page is left (`fetch` with `keepalive`), and the editor
  offers to resume or roll back transactions still open when it loads.
- CSV import has its own timeout (`GRESBASE_IMPORT_TIMEOUT`, default `10m`) and stops when the client
  disconnects.
- SQL autocomplete suggests unqualified columns from the tables in the current statement.
- Generated DDL includes the sequences of `serial` columns and their `OWNED BY`.
- Dark theme: muted text reaches 4.5:1 contrast on edited cells.
