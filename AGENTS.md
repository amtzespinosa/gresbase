# Gresbase — guide for contributors and coding agents

Gresbase is a web UI for any PostgreSQL, deployed as one more container in a `docker-compose`: a single
image, zero mandatory variables (environment variables or a setup wizard) and a modern, minimal interface.
It replaces Adminer or pgAdmin in your own projects.

Read these before changing anything:

| Document | What for |
| --- | --- |
| `docs/spec.md` | What the app does (features and roadmap). Source of truth for scope. |
| `docs/design.md` | How it looks: tokens, layout, components, logo. |
| `docs/compatibility.md` | What works on each Postgres version (12–19). Update it when that changes. |
| `docs/decisions.md` | Decisions taken and why (architecture record). Add an entry for a new one. |
| `CONTRIBUTING.md` | How to propose changes. |
| `site/README.md` | The website and the user documentation (`site/content/`). |

`docs/` is written in Spanish; code, comments, commits, README and CHANGELOG are in English.

## Scope

- Do not add features outside the roadmap in `docs/spec.md` without discussing them first.
- PostgreSQL 12 to 19: full support on 14–18 and 19, legacy on 12 and 13 (features limited by
  capabilities, with a notice); 11 and older are not supported. Every new feature works on all of them from
  day one: what only exists in newer versions is enabled through capabilities.
  `task test:go:all` runs the Go tests against every version.
- No product telemetry. The app never makes network requests except to the configured database.
- It must work offline: no CDNs or Google Fonts at runtime.

## Stack

**Backend (Go, latest stable, `go.mod` sets the version)**
- Router `github.com/go-chi/chi/v5`; logs with `log/slog`.
- Postgres with `github.com/jackc/pgx/v5` (`pgxpool`, `pgconn` for COPY and cancellation).
- Integration tests with `github.com/testcontainers/testcontainers-go` against a real Postgres.
- TypeScript types generated from Go structs with `tygo` into `web/src/lib/api/types.gen.ts`.
- `CGO_ENABLED=0`. Nothing that needs cgo.

**Frontend (`web/`, pnpm)**
- React + Vite + TypeScript in `strict` mode.
- TanStack Router (state in the URL, search params validated with `zod`), TanStack Query,
  TanStack Table + TanStack Virtual.
- CodeMirror 6 with `@codemirror/lang-sql` (PostgreSQL dialect).
- Tailwind CSS v4 with the CSS variables of `docs/design.md`; Radix UI primitives; `cmdk` for the ⌘K
  palette; `lucide-react` icons.
- i18n with `i18next` + `react-i18next`; `web/src/locales/en.json` and `es.json`.
- Simple client state with `zustand`.
- Tests with Vitest + Testing Library + MSW; e2e with Playwright.

## Repository layout

```
cmd/gresbase/            main.go (server and the healthcheck, setup-token, version subcommands)
internal/
  config/                environment variables, validation, masked DSN, gresbase.json store
  server/                chi router, middleware, routes
  api/                   HTTP handlers per area (tables, rows, sql, snippets, auth…)
  auth/                  sessions, login, Host guard, CSRF
  pg/                    pool, introspect/, rows/, write/, sqlexec/, sqlguard/, export/, importcsv/
  snippets/              saved queries as .sql files
  ui/                    embedded frontend and SPA fallback
  pgtest/                testcontainers helpers and test data
web/src/                 routes/, features/, components/ui/, lib/api/, locales/
web/e2e/                 Playwright scenarios (config in web/playwright.config.ts)
deploy/                  development database, example and demo compose files, seed/
site/                    website and user documentation (EN and ES)
assets/brand/            logos (source of truth)
docs/                    spec, design, compatibility, decisions (Spanish)
```

## Development environment

You only need Docker and git: every toolchain runs in the development container.

```
docker compose -f dev.compose.yml up -d --build
docker compose -f dev.compose.yml exec -T workspace bash -lc "task test"
```

- Docker is available inside `workspace` through `DOCKER_HOST=tcp://docker:2375`, an isolated
  `docker:dind` daemon. Containers started there (testcontainers, the development database, image smoke
  tests) publish their ports on the `docker` host, not on `localhost`.
- The development database is reached with `DEV_DATABASE_URL` (`docker:54329` inside the container).
- Development servers listen on `GRESBASE_DEV_HOST` (`0.0.0.0` in the container) and are published on the
  host at `http://localhost:18080` (Gresbase) and `http://localhost:15173` (Vite); change them with
  `GRESBASE_HOST_PORT` and `VITE_HOST_PORT`.
- Use git from your own machine; the container has no credentials.
- `.gitattributes` forces LF line endings.

## Commands (Taskfile)

| Command | What it does |
| --- | --- |
| `task dev` | Development Postgres + backend with reload + Vite |
| `task dev:db` | Only the development Postgres with sample data |
| `task build` | Builds the frontend and the binary with the frontend embedded |
| `task test` | `test:go` + `test:web` |
| `task test:go` | Go tests (integration tests need Docker; `PG_VERSION` picks the image, 17 by default) |
| `task test:go:all` | Go tests against Postgres 12–19, one after another, with a summary |
| `task test:web` | Vitest |
| `task e2e` | Resets the development database, builds and runs Playwright against the binary |
| `task lint` | `golangci-lint`, `eslint`, `tsc --noEmit`, `prettier`, generated files check, `actionlint` |
| `task gen` | Regenerates `types.gen.ts` (tygo) and `deploy/docker-compose.demo.yml` |
| `task licenses` | Regenerates `docs/third-party-licenses.md` and `web/public/licenses/` |
| `task ci:quick` | Lint, generated files, Go on PG 18, Vitest, full e2e on PG 18 |
| `task ci:full` | `ci:quick` + Go 12–19, e2e on 12/17/18, smoke on 19, binary, image and `scripts/smoke-docker.sh` |

Run `task ci:quick` before opening a pull request. GitHub Actions runs the same checks.

## Security rules (mandatory)

1. **Identifiers always escaped** with `pgx.Identifier{schema, name}.Sanitize()`. Never concatenate table
   or column names received from the client, and check that they exist in the introspection first.
2. **Values always parameterized** (`$1`, `$2`…). Never interpolate values into SQL. Only exception:
   structure-editing DDL (`internal/pg/write/structure.go`), which takes no parameters: defaults and
   comments go as an escaped `E'…'` literal through `literal()` (after rejecting NUL), types are resolved
   with `to_regtype()`/`format_type()`, and no client expression is accepted except the condition of a
   check or of a partial index: `expression()` keeps it as a single parenthesized group, the preview shows
   it as is, and all that DDL runs with the extended protocol (`execOne`), which accepts one statement.
3. **Types on write:** values arrive as text and are cast in SQL to the catalog type
   (`$1::<format_type>`), never to a type sent by the client.
4. **Credentials:** never in logs, errors, API responses or panic messages. Use `config.RedactedDSN()`;
   a test checks it. Secrets stored in `gresbase.json` are encrypted with AES-GCM (`config.Store`), and no
   setting returned by `GET /settings` is a secret.
5. **Read-only** (`GRESBASE_READ_ONLY=true`, a connection's own read-only, or a role with
   `default_transaction_read_only`): enforced in two layers, connections with
   `default_transaction_read_only=on` and a `403 read_only` in the API before touching the database.
6. **Timeouts:** every query has a `statement_timeout` (30 s by default), except streaming exports, which
   are canceled when the client disconnects.
7. **Without authentication** (no `GRESBASE_USER`/`GRESBASE_PASSWORD` and no saved administrator) only
   requests whose `Host` is `localhost`, `127.0.0.1` or `[::1]` (plus `GRESBASE_ALLOWED_HOSTS`) are
   accepted, against accidental exposure and DNS rebinding.
   **Setup mode** (no connection and the wizard not completed): the SPA, `/api/v1/config` and
   `/api/v1/setup*` answer any `Host`; setup `POST`s need the setup token (the `/setup#token=…` link in
   the log, `gresbase setup-token` inside the container, or `GRESBASE_SETUP_TOKEN`) unless the request is
   local (`auth.Local`: loopback peer **and** local `Host`). Every other route answers `409 setup_required`.
   **Free mode** (`GRESBASE_MODE_FREE` or chosen in the wizard): no Host guard, because the Postgres
   credentials are the login (`POST /api/v1/auth/connect`). Each session has its own `adhoc` connection
   (the password only in memory, inside its DSN); the session lives as long as that connection
   (`Manager.Owns`). Role `user`: no settings (`auth.RequireAdmin`); its saved queries are private, in
   `snippets/.private/<hash of user@server:port/database>` (`snippets.Store.Private`). With
   `GRESBASE_ALLOWED_DB_HOSTS`, `pg.RestrictHosts` pins DNS resolution to the allowed addresses.
8. **CSRF:** `SameSite=Strict` cookies and the `X-Gresbase: 1` header required on non-GET requests.
   **Accounts:** passwords only as argon2id hashes (`auth.HashPassword`); the cookie carries a fingerprint
   of the credential, so changing the password ends the other sessions. Admin routes go behind
   `auth.RequireAdmin`. The sign-in limit counts only failed attempts, per client IP; behind
   `GRESBASE_TRUSTED_PROXIES` the IP comes from `X-Forwarded-For`, read from the right.
9. The destructive SQL detector is a UX aid, not a security barrier. The real boundary is the Postgres
   role, and the documentation says so.

## API

- Prefix `/api/v1`, JSON, `snake_case` on the wire and in TS: `types.gen.ts` (tygo) uses the JSON names.
  Structs that travel through the API live in `wire.go`/`types.go` files listed in `tygo.yaml`; `task gen`
  regenerates them.
- Errors always look like this:
  `{"error": {"code": "read_only", "message": "…", "detail": "…", "hint": "…", "position": 12, "pg_code": "25006"}}`.
  `code` is stable and the frontend translates it; `message` is for logs and debugging. The codes are in
  `internal/api/respond.go`.
- **Connections:** database routes exist twice: `/api/v1/…` (the default connection, `Manager.DefaultID`)
  and `/api/v1/c/{connection}/…`. A middleware resolves the connection (`connections.Manager.Acquire`) into
  the context (`connections.From`); no handler uses a global pool. Catalog, types, SQL transactions and
  undo are per connection (`connections.Conn`).
- **The frontend always uses `/api/v1/c/{connection}/…`:** screens live under `/c/$connectionId/…` and
  `lib/api/client.ts` prefixes every database route with the tab's connection (`apiPath`), so two tabs can
  work on different connections.
- **Saved connections:** `GET /api/v1/connections`; `POST`/`PUT`/`DELETE` and `POST /connections:test`
  admin only. The password is sealed in `gresbase.json` and never returned; in `PUT` an empty password
  keeps the saved one.
- A `409 conflict` on write also carries `error.conflict`; a `409 confirmation_required` from
  `/sql/execute` carries `error.analysis`. Errors of each SQL statement travel inside its result (`200`),
  with `position` in UTF-16 units of the sent text.
- **Long requests** (`/sql/execute`, CSV import, `/structure`) go behind `api.Heartbeat`: with no answer
  after 10 s the server sends `200` and a space every 10 s so proxies don't cut them; a later error arrives
  as a `200` with `{"error": …}`, which `api()` throws as an `ApiError`.
- **Global search** (`POST /search`, `internal/pg/search`): the answer is NDJSON, one event per line
  (`start`, then `table` or `skipped` per table, then `done`), flushed as each table finishes, with
  `X-Accel-Buffering: no` and `Cache-Control: no-store, no-transform` so proxies pass it on at once. Each
  table runs in its own read-only transaction with its own `statement_timeout`; only tables and columns
  the role can `SELECT` are listed. Names of tables and columns are searched in the browser, from the SQL
  completions.
- `/sql/execute` accepts `params` (values of the editor's `:name` parameters), sent as untyped bound
  parameters, never written into the SQL.

### Values on the wire

| Postgres type | JSON |
| --- | --- |
| `NULL` | `null` |
| `bool` | `true` / `false` |
| `int2`, `int4`, `float4`, `float8` | number (NaN/±Infinity as text) |
| `int8`, `numeric`, `money` | **text** (no precision loss in JS) |
| `json`, `jsonb` | the JSON value itself |
| dates, times, `interval`, `uuid`, enums, `inet`, etc. | text in Postgres output format (`DateStyle=ISO`) |
| arrays | JSON array with each element encoded by its type |
| `bytea` | `{"$bytea": {"size": 1234, "hex_preview": "deadbeef…"}}` (up to 32 bytes in hex) |
| long text (> 10 KB in the grid) | `{"$text": "<first 10 KB>", "truncated": true, "size": 23456}`; full value with `rows/value` |

Writes (`changesets`) accept values with the same encoding; in `expected`, cells that only describe the
value (`$bytea`, truncated `$text`) are not compared.

## Code conventions

- Commits follow Conventional Commits (`feat(rows): keyset pagination`).
- Go: small packages, errors wrapped with `%w`, `context.Context` in everything that touches the network or
  the database, no mutable globals, table-driven tests.
- TypeScript: no `any`; small components; data hooks in `lib/api`; no business logic in UI components.
- **No hardcoded visible text** in components: everything goes through i18n (EN and ES). A test checks that
  `en.json` and `es.json` have the same keys.
- The UI follows `docs/design.md`: floating cards, no top bar, color tokens, self-hosted Geist and Geist
  Mono.
- Accessibility: every control usable with the keyboard, `aria-label` on icon buttons, visible focus.

## Definition of done

- [ ] Tests for what is new; `task ci:quick` green.
- [ ] No untranslated text; generated files up to date (`task gen`).
- [ ] If dependencies change: `task licenses` (only licenses compatible with Apache 2.0).
- [ ] User-facing changes documented in `site/content/` in English and Spanish (`npm run check` green).
- [ ] If a convention changed, this file updated in the same commit.
