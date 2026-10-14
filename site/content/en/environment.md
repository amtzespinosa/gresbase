---
description: Every variable Gresbase reads at startup, with its type, default value and effect.
---

## How Gresbase reads them {#how}

Gresbase reads its configuration from environment variables when it starts. None is required: without `DATABASE_URL` it opens the [setup wizard](./setup-wizard.md).

- Spaces around a value are ignored. An empty value counts as unset.
- **Durations** use Go syntax: a number and a unit (`ms`, `s`, `m`, `h`), such as `30s`, `10m` or `1h30m`. They must be greater than zero.
- **Booleans** accept `true` or `false` (also `1`, `0`, `t`, `f`, `TRUE`, `FALSE`).
- **Lists** are comma separated.

If a value is not valid, Gresbase doesn't start. It prints `invalid configuration:` and one line per problem, for example:

```sh
gresbase: invalid configuration:
GRESBASE_PORT: must be an integer between 1 and 65535 (got "80a")
GRESBASE_USER/GRESBASE_PASSWORD: set both to enable login, or neither
```

## Server {#server}

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | none | URL, e.g. `postgres://app:secret@db:5432/app`. The database to manage. Must start with `postgres://` or `postgresql://`. Its connection appears locked in the app. See [Connecting to PostgreSQL](./connecting.md). |
| `GRESBASE_PORT` | `8080` | Integer, 1–65535, e.g. `9000`. Port Gresbase listens on inside the container. |
| `GRESBASE_BASE_PATH` | `/` | Path, e.g. `/gresbase`. Serves the app under a prefix, for a reverse proxy. Trailing slashes are removed. Each segment may only use letters, digits and `.` `_` `~` `-`. |
| `GRESBASE_TRUSTED_PROXIES` | empty | List of IPs or CIDRs, e.g. `172.18.0.0/16`. Reverse proxies whose `X-Forwarded-For` names the real client for the sign-in limit. Empty trusts no header. See [Too many attempts](./authentication.md#rate-limit). |
| `GRESBASE_ALLOWED_HOSTS` | empty | List of host names, e.g. `db.internal,192.168.1.20`. Extra `Host` names accepted when there is no login. Without login, only `localhost`, `127.0.0.1` and `[::1]` are accepted. The port is ignored. |

## Sign-in and sessions {#sign-in}

| Variable | Default | What it does |
| --- | --- | --- |
| `GRESBASE_USER` | none | Text, e.g. `admin`. Administrator account defined by the environment. Set it together with `GRESBASE_PASSWORD`, or neither. |
| `GRESBASE_PASSWORD` | none | Text, e.g. `a-long-password`. Password of `GRESBASE_USER`. With both set, sign-in is required. |
| `GRESBASE_SESSION_SECRET` | generated | Text, 32+ characters, e.g. the output of `openssl rand -hex 32`. Key that signs session cookies. If unset, Gresbase generates one and keeps it sealed in `gresbase.json`, so sessions survive restarts. |
| `GRESBASE_SESSION_TTL` | `12h` | Duration, e.g. `8h`. How long a sign-in lasts. |

More in [Sign-in and accounts](./authentication.md).

## Database and limits {#database}

| Variable | Default | What it does |
| --- | --- | --- |
| `GRESBASE_READ_ONLY` | `false` | Boolean, e.g. `true`. Every connection refuses writes. See [Read-only mode](./read-only.md). |
| `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Duration, e.g. `2m`. Time limit of each query. |
| `GRESBASE_IMPORT_TIMEOUT` | `10m` | Duration, e.g. `30m`. Time limit of a CSV import, as a whole. |
| `GRESBASE_SQL_MAX_ROWS` | `1000` | Integer, 1–100000, e.g. `5000`. Rows shown per result in the SQL editor. |
| `GRESBASE_MAX_CONNS` | `10` | Integer, 1–1000, e.g. `5`. Connections each pool opens to its database. |
| `GRESBASE_MAX_POOLS` | `20` | Integer, 1–1000, e.g. `50`. Databases with an open pool at the same time. When the limit is reached and no pool is idle, the API answers `too_many_connections`. |
| `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | Duration, e.g. `30m`. An unused pool closes after this time. The pool of `DATABASE_URL` stays open. |

## Data and secrets {#data}

| Variable | Default | What it does |
| --- | --- | --- |
| `GRESBASE_DATA_DIR` | `/data` | Path, e.g. `/var/lib/gresbase`. Where `gresbase.json`, `secret.key` and saved queries live. See [The data volume](./data-volume.md). |
| `GRESBASE_SECRET_KEY` | none | Text, 32+ characters, e.g. a Docker secret. Encrypts the secrets kept in `gresbase.json`. Without it, Gresbase creates `secret.key` in the data directory. |

## Setup and free mode {#setup}

| Variable | Default | What it does |
| --- | --- | --- |
| `GRESBASE_SETUP_TOKEN` | random | Text, 16+ characters, e.g. `my-setup-token-2026`. Unlocks the setup wizard from other machines. If unset, Gresbase generates one on each start and prints it in the log as `setup_token`. |
| `GRESBASE_MODE_FREE` | `false` | Boolean, e.g. `true`. Forces [free mode](./free-mode.md): people sign in with PostgreSQL credentials. |
| `GRESBASE_DB_HOST` | none | Host name or IP, e.g. `db`. Fixes the server of the connection forms (wizard, saved connections, free mode). The form field is locked. |
| `GRESBASE_DB_PORT` | none | Integer, 1–65535, e.g. `5432`. Fixes the port of those forms. Without it, the form uses `5432` unless you type another. |
| `GRESBASE_DB_NAME` | none | Database name, e.g. `app`. Fixes the database of those forms. |
| `GRESBASE_DB_USER` | none | User name, e.g. `app_reader`. Fixes the user of those forms. With host, database and user fixed, [free mode](./free-mode.md#fix-server) only asks for the password. |
| `GRESBASE_ALLOWED_DB_HOSTS` | empty (any) | List of hosts, IPs or CIDRs, e.g. `db,10.0.0.0/8`. Servers allowed in free mode. Others get `db_host_not_allowed`. |
| `GRESBASE_MAX_SESSIONS` | `10` | Integer, 1–1000, e.g. `25`. Free mode sessions at the same time. Beyond that, the API answers `too_many_sessions`. |

`GRESBASE_MODE_FREE=true` can't be combined with `DATABASE_URL` or `GRESBASE_USER`. In free mode, PostgreSQL credentials are the login.

## Language and logs {#logs}

| Variable | Default | What it does |
| --- | --- | --- |
| `GRESBASE_LANG` | `en` | `en` or `es`. Language for visitors who haven't picked one. |
| `GRESBASE_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. Minimum level written to the log. |
| `GRESBASE_LOG_FORMAT` | `text` | `text` or `json`. Log format. `json` suits log collectors. |

Logs never include passwords: `DATABASE_URL` appears with its password replaced by `****`.

## Variables you can also change in Settings {#settings}

Some values can also be changed by the administrator in **Settings**. They are stored in `gresbase.json`. The order of precedence is: environment variable, then `gresbase.json`, then the default.

| Variable | Label in Settings | When it applies |
| --- | --- | --- |
| `GRESBASE_LANG` | Default language | At once |
| `GRESBASE_SESSION_TTL` | Session duration | On restart |
| `GRESBASE_ALLOWED_HOSTS` | Allowed hosts | On restart |
| `GRESBASE_READ_ONLY` | Read-only | On restart |
| `GRESBASE_STATEMENT_TIMEOUT` | Default timeout | On restart |
| `GRESBASE_SQL_MAX_ROWS` | Row limit | At once |
| `GRESBASE_IMPORT_TIMEOUT` | CSV import timeout | On restart |
| `GRESBASE_MAX_CONNS` | Connections per pool | On restart |
| `GRESBASE_MAX_POOLS` | Open pools | On restart |
| `GRESBASE_POOL_IDLE_TIMEOUT` | Idle pool timeout | On restart |

A changed value that needs a restart shows **Applies on restart**. Values from Settings follow the same rules as the variables.

:::note
An environment variable locks its setting. Settings shows it as **Defined by environment variable** followed by the name, and doesn't let you change it. To edit it in the app, remove the variable and recreate the container.
:::

The rest (`DATABASE_URL`, port, base path, accounts, secrets, data directory, free mode and logs) are environment only. More in [Settings screen](./settings.md).

## A full example {#example}

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://gresbase:secret@db:5432/app
      GRESBASE_USER: admin
      GRESBASE_PASSWORD: a-long-password
      GRESBASE_STATEMENT_TIMEOUT: 1m
      GRESBASE_LANG: en
      GRESBASE_LOG_FORMAT: json
    volumes:
      - gresbase-data:/data
    ports:
      - "127.0.0.1:{{port}}:8080"

volumes:
  gresbase-data:
```
