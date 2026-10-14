---
description: Run Gresbase with Docker Compose, point it at your PostgreSQL database and open it in your browser.
---

## Before you start {#before-you-start}

- Docker with Compose v2 (`docker compose version` should answer).
- A PostgreSQL database the container can reach, and a user to connect with. PostgreSQL 12 or newer (see [supported versions](./introduction.md)).

:::tip
To look around first, start the demo with a sample database. It needs only Docker:

```sh
curl -fsSLO https://raw.githubusercontent.com/amtzespinosa/gresbase/main/deploy/docker-compose.demo.yml
docker compose -f docker-compose.demo.yml up -d
```

Then open `http://localhost:8080`. `docker compose -f docker-compose.demo.yml down -v` removes it.
:::

:::note
If PostgreSQL runs on the same machine but outside Docker, `localhost` inside the container is not your machine. Use `host.docker.internal` on Docker Desktop, or the host's IP address.
:::

## Install and start {#install}

:::steps
### Create the Compose file {#create-the-file}

Save this in an empty folder as `docker-compose.yml`. If you don't use Compose, the *docker run* tab does the same in one command.

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://USER:PASSWORD@HOST:5432/DBNAME
      GRESBASE_READ_ONLY: "false"
    volumes:
      - gresbase-data:/data
    ports:
      - "127.0.0.1:{{port}}:8080"

volumes:
  gresbase-data:
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -e DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
  -e GRESBASE_READ_ONLY=false \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

Gresbase listens on port 8080 inside the container. The `ports` line publishes it as {{port}}, only on your machine.

### Point it at your database {#point-it}

Replace `USER`, `PASSWORD`, `HOST` and `DBNAME` in `DATABASE_URL`. It must start with `postgres://` or `postgresql://`. If the password contains characters such as `@`, `:` or `/`, percent-encode them (`@` becomes `%40`).

Add `?sslmode=disable` at the end if your server doesn't use SSL, for example a `postgres` container on the same Compose network. More options in [Connecting to PostgreSQL](./connecting.md).

### Start it {#start-it}

```sh title="Terminal"
docker compose up -d
docker compose logs -f gresbase
```

The log shows `starting gresbase` when it's ready. If the database doesn't answer yet, Gresbase retries for up to 30 seconds and then exits with the reason. A wrong password, a missing database or an SSL error stops it at once. With `restart: unless-stopped`, Docker starts it again.

### Open Gresbase {#open-it}

Go to [http://localhost:{{port}}](http://localhost:{{port}}). The connection card at the bottom of the sidebar shows a green dot when Gresbase can reach your database. A red one comes with **Can't reach the database**.
:::

## Check that it's healthy {#check}

The image has a health check that calls `/healthz` every 10 seconds. After the first start, `docker compose ps` should show the container as `healthy`.

```sh
docker compose ps
```

## Who can open it {#access}

This Compose file has no account, so there is no login. Gresbase then only answers requests addressed to `localhost`, `127.0.0.1` or `[::1]`, and the sidebar shows **This computer only**.

To open it to other people, set an account with `GRESBASE_USER` and `GRESBASE_PASSWORD` and put HTTPS in front. See [Sign-in and accounts](./authentication.md) and [Security and networking](./security.md).

:::warning
Don't publish the port on every interface (`0.0.0.0`) without an account and HTTPS in front. Passwords and data would travel in clear text.
:::

## Browse without changing anything {#read-only}

:::tip
Set `GRESBASE_READ_ONLY` to `"true"` to explore a production database safely. Gresbase rejects every write, and its database sessions are read-only too. A **Read-only** badge shows in the sidebar. More in [Read-only mode](./read-only.md).
:::

## Keep the data volume {#data-volume}

Gresbase keeps its own data in `/data`: `gresbase.json` with settings and saved connections, `secret.key` that encrypts the secrets inside it, and your saved queries. Your PostgreSQL data never lives there. Details in [The data volume](./data-volume.md).

:::warning
Removing the volume (`docker compose down -v`) deletes that configuration and your saved queries, and signs everyone out.
:::

## Configuration at a glance {#configuration}

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | — | Connection string of the database to manage. Without it, the [setup wizard](./setup-wizard.md) opens. |
| `GRESBASE_READ_ONLY` | `false` | Blocks every write to the database. |
| `GRESBASE_USER` / `GRESBASE_PASSWORD` | — | Account to sign in with. Set both or neither. |
| `GRESBASE_SECRET_KEY` | Generated in `/data/secret.key` | Encrypts the secrets in `gresbase.json`. At least 32 characters. |

All the options are in [Environment variables](./environment.md).

## Next steps {#next-steps}

- [Take the quick tour](./tour.md) of the main screens.
- Write your first query in the [SQL editor](./sql-editor.md) and run it with <kbd>⌘</kbd> <kbd>↵</kbd> (<kbd>Ctrl</kbd> <kbd>↵</kbd> on Windows and Linux).
- Before opening it to your network, read [Security and networking](./security.md).
