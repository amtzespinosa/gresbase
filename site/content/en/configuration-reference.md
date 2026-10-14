---
description: Every variable, port, path, endpoint and limit of Gresbase on one page.
---

## Variables {#variables}

All of them are optional. Details, formats and examples are in [Environment variables](./environment.md). The ones marked **Settings** can also be changed in the app; the variable wins and locks the setting.

| Variable | Default | Effect |
| --- | --- | --- |
| `DATABASE_URL` | — | Database to manage. Without it, saved connections or the setup wizard. |
| `GRESBASE_PORT` | `8080` | Port Gresbase listens on inside the container. |
| `GRESBASE_BASE_PATH` | `/` | Serve under a prefix such as `/gresbase`, behind a proxy. |
| `GRESBASE_USER` | — | Account name. Needs `GRESBASE_PASSWORD`. |
| `GRESBASE_PASSWORD` | — | Account password. Needs `GRESBASE_USER`. |
| `GRESBASE_SESSION_SECRET` | Generated | Signs session cookies. At least 32 characters. If unset, generated once and kept encrypted in `gresbase.json`. |
| `GRESBASE_SESSION_TTL` | `12h` | How long a sign-in lasts. **Settings**. |
| `GRESBASE_TRUSTED_PROXIES` | — | Reverse proxies (IPs or CIDRs) whose `X-Forwarded-For` gives the client IP for the sign-in limit. |
| `GRESBASE_ALLOWED_HOSTS` | — | Extra `Host` names accepted without login, comma separated. **Settings**. |
| `GRESBASE_READ_ONLY` | `false` | Every connection refuses writes. **Settings**. |
| `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Limit of each query. **Settings**. |
| `GRESBASE_IMPORT_TIMEOUT` | `10m` | Limit of a CSV import. **Settings**. |
| `GRESBASE_SQL_MAX_ROWS` | `1000` | Rows per result in the SQL editor, 1 to 100000. **Settings**. |
| `GRESBASE_MAX_CONNS` | `10` | Connections per pool, 1 to 1000. **Settings**. |
| `GRESBASE_MAX_POOLS` | `20` | Pools open at the same time, 1 to 1000. **Settings**. |
| `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | An unused pool closes after this. The one of `DATABASE_URL` stays open. **Settings**. |
| `GRESBASE_DATA_DIR` | `/data` | Folder for `gresbase.json`, `secret.key` and `snippets/`. |
| `GRESBASE_SECRET_KEY` | `secret.key` | Key that encrypts the secrets of `gresbase.json`. At least 32 characters. |
| `GRESBASE_DB_HOST` | — | Fixes the server of the connection forms (setup wizard, free mode). |
| `GRESBASE_DB_PORT` | — | Fixes the port of those forms. |
| `GRESBASE_DB_NAME` | — | Fixes the database of those forms. |
| `GRESBASE_DB_USER` | — | Fixes the user of those forms. |
| `GRESBASE_MODE_FREE` | `false` | Free mode: people sign in with their PostgreSQL credentials. |
| `GRESBASE_ALLOWED_DB_HOSTS` | — | Servers allowed in free mode: names, IPs or CIDRs. Empty allows any. |
| `GRESBASE_MAX_SESSIONS` | `10` | Simultaneous free-mode sessions, 1 to 1000. |
| `GRESBASE_SETUP_TOKEN` | Random | Token the setup wizard asks for from other machines. At least 16 characters. When unset, it is printed in the log. |
| `GRESBASE_LANG` | `en` | Default interface language: `en` or `es`. **Settings**. |
| `GRESBASE_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |
| `GRESBASE_LOG_FORMAT` | `text` | `text` or `json`. |

Durations take a unit: `30s`, `10m`, `12h`. Settings marked **Settings** apply on restart, except the language and the row limit, which apply at once.

## Ports {#ports}

| Port | Where |
| --- | --- |
| `8080` | Inside the container (`EXPOSE 8080`). Change it with `GRESBASE_PORT`. |
| `{{port}}` | On the host in the [Quick start](./quick-start.md), published only on `127.0.0.1`. |

## Paths {#paths}

| Path | What it is |
| --- | --- |
| `/data` | Data directory, declared as a volume in the image. Writable by user `65532`, which the image runs as. |
| `/data/gresbase.json` | Settings, saved connections, administrator account. File mode `0600`. |
| `/data/secret.key` | Encryption key, 64 hexadecimal characters. Not created when `GRESBASE_SECRET_KEY` is set. |
| `/data/snippets/` | Saved queries as `.sql` files. |
| `/licenses/` | `LICENSE`, `NOTICE`, `TRADEMARKS.md` and `THIRD_PARTY_NOTICES.txt`. |
| `/gresbase` | The binary, which is also the image entrypoint. |

How to copy `/data` is in [Backups](./backups.md).

## Endpoints and commands {#endpoints}

| What | Behaviour |
| --- | --- |
| `GET /healthz` | `200 {"status":"ok"}`. In setup mode, `200 {"status":"setup"}`. With `DATABASE_URL`, `503 {"status":"unavailable"}` if that database doesn't answer within 2 s. Open without login. Under `GRESBASE_BASE_PATH` if set. |
| `gresbase healthcheck` | Requests the local `/healthz` and exits with `0` or `1`. It only reads `GRESBASE_PORT` and `GRESBASE_BASE_PATH`. |
| `gresbase version` | Prints `gresbase <version>`. `-version` and `--version` work too. |

The image runs the health check on its own:

```sh
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 CMD ["/gresbase", "healthcheck"]
```

To check the version of a running container:

```sh
docker compose exec gresbase /gresbase version
```

## Limits {#limits}

| Limit | Value |
| --- | --- |
| CSV file to import | 100 MB |
| Rows per page in the grid | 50, 100 or 200; 50 by default |
| Rows per result in the SQL editor | `GRESBASE_SQL_MAX_ROWS`, 1000 by default |
| Text shown in a grid cell | First 10 KB; the full value loads on demand |
| Saved query | 1 MB |
| SQL editor history | 500 entries, in each browser |
| Failed sign-in attempts | 5 per minute and IP |
| Connecting to `DATABASE_URL` at startup | Retries for up to 30 s |
| **Test connection** | 10 s |
| Shutdown | Waits up to 10 s for open requests |
