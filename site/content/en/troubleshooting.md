---
description: Find the message Gresbase showed you, see why it happened and fix it.
---

## Read the logs first {#logs}

Most problems are explained in the container log:

```sh
docker compose logs gresbase
```

Messages in the log are always in English. Messages in the interface follow your language.

## Gresbase doesn't start {#does-not-start}

The container stops right after starting. The last lines of the log say why.

## Invalid configuration {#invalid-configuration}

An environment variable has a value Gresbase can't use. The log starts with `gresbase: invalid configuration:` and lists every problem at once, one per line. All variables are in [Environment variables](./environment.md).

### Wrong DATABASE_URL {#cfg-database-url}

```text
DATABASE_URL: must be a postgres:// or postgresql:// URL
```

The connection string has another scheme or can't be parsed. Start it with `postgres://`. The value is never printed because it contains the password.

### Only a user or only a password {#cfg-user-password}

```text
GRESBASE_USER/GRESBASE_PASSWORD: set both to enable login, or neither
```

Only one of the two is set. Set both, or remove both.

### Number out of range {#cfg-integer}

```text
GRESBASE_PORT: must be an integer between 1 and 65535 (got "…")
```

Not a number, or out of range. The same message, with its own range, appears for `GRESBASE_DB_PORT` (1–65535), `GRESBASE_SQL_MAX_ROWS` (1–100000), `GRESBASE_MAX_CONNS`, `GRESBASE_MAX_POOLS` and `GRESBASE_MAX_SESSIONS` (1–1000).

### Duration without a unit {#cfg-duration}

```text
GRESBASE_SESSION_TTL: must be a positive duration like 30s or 12h (got "…")
```

Durations need a unit: `30s`, `10m`, `12h`. Same for `GRESBASE_STATEMENT_TIMEOUT`, `GRESBASE_IMPORT_TIMEOUT` and `GRESBASE_POOL_IDLE_TIMEOUT`.

### Not true or false {#cfg-bool}

```text
GRESBASE_READ_ONLY: must be true or false (got "…")
```

Use `true` or `false`. Same for `GRESBASE_MODE_FREE`.

### Value not in the list {#cfg-one-of}

```text
GRESBASE_LANG: must be one of en, es (got "…")
```

Only `en` and `es` exist. `GRESBASE_LOG_LEVEL` takes `debug, info, warn, error`; `GRESBASE_LOG_FORMAT` takes `text, json`.

### Invalid base path {#cfg-base-path}

```text
GRESBASE_BASE_PATH: must be a path like /gresbase (got "…")
```

Start with `/` and use only letters, digits and `.`, `_`, `~`, `-` in each segment.

### Secret or token too short {#cfg-too-short}

```text
GRESBASE_SESSION_SECRET: must be at least 32 characters
GRESBASE_SECRET_KEY: must be at least 32 characters
GRESBASE_SETUP_TOKEN: must be at least 16 characters
```

Use a longer value. You can also remove `GRESBASE_SESSION_SECRET` and let Gresbase generate one. Changing `GRESBASE_SECRET_KEY` has consequences: read [Backups](./backups.md#secret-key) first.

### Invalid network in GRESBASE_ALLOWED_DB_HOSTS {#cfg-cidr}

```text
GRESBASE_ALLOWED_DB_HOSTS: "…" is not a valid CIDR
```

An entry with `/` must be a network such as `10.0.0.0/8`.

### Free mode with a fixed database or account {#cfg-mode-free}

```text
GRESBASE_MODE_FREE: cannot be combined with DATABASE_URL or GRESBASE_USER: in free mode Postgres credentials are the login
```

Free mode has no fixed database and no fixed account. Remove `DATABASE_URL` and `GRESBASE_USER`, or turn free mode off.

## Can't reach the database at startup {#cannot-connect}

With `DATABASE_URL` set, Gresbase connects before it starts serving. While the server doesn't answer it logs `database not ready, retrying` and tries again for up to 30 seconds. Then it stops with:

```text
gresbase: cannot connect to PostgreSQL (<reason>): <error from the driver>
hint: <what to check>
```

`authentication`, `database_not_found`, `ssl` and `unsupported_version` stop at once: retrying won't fix them. More in [Connecting to PostgreSQL](./connecting.md). The hint for each reason:

### dns {#reason-dns}

```text
the host name in DATABASE_URL does not resolve; check it and that both containers share a network
```

### connection_refused {#reason-refused}

```text
nothing is listening at that host and port; check that Postgres is running and the port is right
```

### authentication {#reason-authentication}

```text
Postgres rejected the user or password in DATABASE_URL (or pg_hba.conf does not allow this client)
```

### ssl {#reason-ssl}

```text
the SSL negotiation failed; adjust sslmode in DATABASE_URL (disable, prefer, require, verify-full)
```

### database_not_found {#reason-database}

```text
the database in DATABASE_URL does not exist; create it or fix the name
```

### timeout {#reason-timeout}

```text
the server did not answer in time; check the host, the network and firewalls
```

### unsupported_version {#reason-unsupported}

```text
Gresbase needs PostgreSQL 12 or newer; upgrade the server or use an older tool
```

## Problems with the data volume {#data-files}

### File from a newer version {#newer-file}

```text
/data/gresbase.json: written by a newer Gresbase (schema 2, this one reads up to 1)
```

A newer version wrote the file. Run that version again, or restore a backup. See [Upgrading](./upgrading.md#volume).

### Broken gresbase.json {#invalid-json}

```text
/data/gresbase.json: invalid JSON: …
```

The file was edited by hand and broken. Fix the JSON or restore a backup.

### Invalid secret.key {#invalid-key}

```text
/data/secret.key is not a valid key (64 hex characters)
```

The key file was changed. Restore it from a backup. See [Backups](./backups.md#secret-key).

## Warnings in the log {#warnings}

### LOGIN DISABLED {#login-disabled}

```sh
LOGIN DISABLED: only requests with a local Host (localhost, 127.0.0.1, [::1]) or GRESBASE_ALLOWED_HOSTS are accepted. Set GRESBASE_USER and GRESBASE_PASSWORD before exposing Gresbase beyond this machine.
```

There is no account: neither `GRESBASE_USER` and `GRESBASE_PASSWORD`, nor an administrator created in the setup wizard. That is fine on your own machine. Before opening Gresbase to a network, set up an account: see [Sign-in and accounts](./authentication.md).

### SETUP MODE and the setup token {#setup-token}

```sh
SETUP MODE: no database configured. Open Gresbase in a browser to set it up; requests from other machines need the setup token
```

Gresbase has no connection yet, so it starts the setup wizard. The same line carries a ready link, `path="/setup#token=…"`, and `setup_token=…`, unless you set `GRESBASE_SETUP_TOKEN`. `docker compose exec gresbase /gresbase setup-token` prints the token too. Opening the wizard from the same machine needs no token. From another one, the wizard asks for it. See [Setup wizard](./setup-wizard.md).

If the wizard says **The setup token is not valid. Copy it again from the logs.**, copy the value again. A new token is generated on each start unless `GRESBASE_SETUP_TOKEN` is set.

### Data dir is an anonymous volume {#data-dir-anonymous}

```sh
data dir is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on it
```

The container runs without `-v` (or without `volumes:` in Compose), so Docker gave `/data` an anonymous volume. It works, but the next container starts empty. The app shows: **The data directory is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them.** Mount a named volume; see [The data volume](./data-volume.md#mount).

### Data dir is not writable {#data-dir-not-writable}

```sh
data dir is not writable: saved queries and settings live in memory and are lost on every restart
```

Gresbase can't write in `/data`. It keeps working, but settings and saved queries live in memory or in a temporary folder. **Settings** shows **The data directory is not writable: saved queries and settings live in memory and are lost on every restart. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them.**

Mount a volume at `/data`. With a host folder, it must be writable by user `65532`, which the image runs as:

```sh
sudo chown -R 65532:65532 ./data
```

## Access blocked {#access-blocked}

The browser shows a page titled **Access blocked**:

Gresbase has no login configured, so it only answers on `localhost`. Set `GRESBASE_USER` and `GRESBASE_PASSWORD` to enable login, or add this host to `GRESBASE_ALLOWED_HOSTS`.

Without an account, Gresbase only answers requests addressed to `localhost`, `127.0.0.1` or `[::1]`. You opened it with another name or IP. Fix it in one of these ways:

- Open it as `http://localhost:{{port}}`.
- Set `GRESBASE_USER` and `GRESBASE_PASSWORD`, or create an administrator in the setup wizard.
- Add the name you use to `GRESBASE_ALLOWED_HOSTS`, for example `gresbase.internal`. Only on a network you trust.

The API answers the same requests with `403 forbidden`. `/healthz` stays open so health checks work.

## Errors in the app {#app-errors}

The interface shows these messages. The code in the first column is what the API returns.

| Code | Message | What to do |
| --- | --- | --- |
| `read_only` | Gresbase is in read-only mode, so changes are blocked. | Read-only is on, globally or for that connection. See [Read-only mode](./read-only.md). |
| `timeout` | The query took too long and was stopped. | The query went over the statement timeout (30 s by default). Raise it in the SQL editor or with `GRESBASE_STATEMENT_TIMEOUT`. |
| `canceled` | The query was canceled. | Someone stopped the query. Run it again. |
| `conflict` | Someone changed this data in the meantime. Reload and try again. | The row changed after you loaded it. Reload, check the new values and edit again. |
| `no_primary_key` | This table has no primary key, so its rows can't be edited. | Gresbase needs a primary key to find each row. Add one, or edit with SQL. |
| `not_writable` | Views and other non-table relations can't be edited. | Edit the underlying table instead. |
| `not_undoable` | This change can't be undone safely. | Triggers or cascades touched other data. Fix it by hand if needed. |
| `confirmation_required` | This statement can destroy data. Confirm before running it. | The SQL editor detected a destructive statement. Confirm it if you meant it. |
| `pg_error` | PostgreSQL returned an error. | The detail comes from PostgreSQL. Fix the statement or the value. |
| `locked_by_env` | This setting is defined by an environment variable and can't be changed here. | Change the variable and restart the container. |
| `too_many_connections` | Too many databases are open at once. Try again in a moment. | `GRESBASE_MAX_POOLS` was reached and no pool was idle. Wait, or raise the limit. |
| `too_many_sessions` | Too many people are connected right now. Try again in a while. | Free mode reached `GRESBASE_MAX_SESSIONS`. Wait, or raise the limit. |
| `db_host_not_allowed` | This server isn't allowed. Ask the administrator (GRESBASE_ALLOWED_DB_HOSTS). | In free mode, that server is not in `GRESBASE_ALLOWED_DB_HOSTS`. |
| `unsupported_version` | Gresbase needs PostgreSQL 12 or newer. | The server is PostgreSQL 11 or older. |
| `rate_limited` | Too many attempts. Wait a minute and try again. | More than 5 sign-in attempts in a minute from the same IP. Wait a minute. |
| `unauthorized` | Your session has ended. Sign in again. | The session expired (`GRESBASE_SESSION_TTL`) or the password changed. |
| `forbidden` | You don't have access to this. | Your role can't do this, or the host isn't allowed without login. |
| `setup_required` | Gresbase is not set up yet. | Finish the [setup wizard](./setup-wizard.md). |
| `internal` | Something went wrong on the server. Check the logs. | Read the container log. |
| — | Can't reach Gresbase. Check that it's running. | The browser got no answer. Check the container is up. |

### Connection failed {#connection-failed}

**Test connection** and the free-mode sign-in show **Couldn't connect to PostgreSQL.** with the reason:

| Message | What to check |
| --- | --- |
| The host name doesn't resolve. Check it and that Gresbase can reach that network. | The host name, and that the Gresbase container is on the same Docker network. |
| Nothing is listening at that host and port. Check that PostgreSQL is running. | PostgreSQL is running, and the port is right (5432 by default). |
| PostgreSQL rejected the user or password. | The credentials, and that `pg_hba.conf` allows this client. |
| The SSL negotiation failed. Try another SSL mode. | The SSL mode. Some servers require SSL, others don't offer it. |
| That database doesn't exist. | The database name. |
| The server didn't answer in time. Check the host, the network and firewalls. | Firewalls and routes between Gresbase and the server. |
| This server isn't on the allowed list. Use one of the allowed servers or ask the administrator (GRESBASE_ALLOWED_DB_HOSTS). | The server's address falls outside `GRESBASE_ALLOWED_DB_HOSTS`. Use one of the allowed servers, or ask whoever runs Gresbase to add it. |
| Couldn't connect to PostgreSQL. Check the details and the Gresbase logs. | Any other cause. The log has the full error. |
