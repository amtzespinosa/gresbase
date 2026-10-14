---
description: Let people sign in with their own PostgreSQL user and password, like Adminer, without saving anything on the server.
---

## How it works {#how-it-works}

In free mode, PostgreSQL credentials are the login. There are no Gresbase accounts and no saved connections.

- Each person fills in the connection form and clicks **Connect**.
- Gresbase checks the credentials by connecting to the server.
- Each session gets its own connection. Its password only lives in server memory, never on disk.
- When the session ends or signs out, that connection closes and the password leaves memory.

Restarting Gresbase also ends every free mode session, since the connections only exist in memory.

## Turn it on {#turn-on}

There are two ways:

- Set `GRESBASE_MODE_FREE` to `true`.
- Choose **Free mode, like Adminer** in the [setup wizard](./setup-wizard.md).

`GRESBASE_MODE_FREE` cannot be combined with `DATABASE_URL` or `GRESBASE_USER`. Gresbase refuses to start if you set them together.

If you chose free mode in the wizard and later set `DATABASE_URL`, free mode turns off.

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    environment:
      GRESBASE_MODE_FREE: "true"
      GRESBASE_DB_HOST: db
      GRESBASE_MAX_SESSIONS: "10"
    volumes:
      - gresbase-data:/data
    ports:
      - "127.0.0.1:{{port}}:8080"

volumes:
  gresbase-data:
```

## Sign in {#sign-in}

The screen is called **Connect to PostgreSQL**. It asks for **Host**, **Port**, **Database**, **User**, **Password** and **SSL**. You can also paste a **Connection URL** to fill the fields.

The port defaults to `5432` and SSL to `prefer`. Click **Connect**.

In the sidebar, the **Session options** button (three dots) of the connection card opens a menu. Each option asks for confirmation first:

- **Switch connection** goes back to the connect screen. Connecting again replaces your current connection.
- **Disconnect** ends the session.

### Recent connections {#recent}

The connect screen lists your last five connections under **Recent**. They are kept in your browser (`localStorage`), never on the server. The password is never stored.

## What a free mode user can do {#role}

A free mode session has the role `user`. It browses and edits data, and runs SQL, on its own connection. Postgres permissions decide the rest.

It cannot open the server settings or the saved connections on the Settings screen.

It has its own saved queries. Each user, server, port and database (`user@host:port/database`) has a private folder that no other user sees, not even the administrator. The queries are still there at the next sign in with the same data. See [Saved queries](./sql-editor.md#saved).

The Settings screen only shows the personal preferences (theme, language, grid density) and the **About** section.

`GRESBASE_READ_ONLY` still applies to every free mode connection. See [Read-only mode](./read-only.md).

## Limit the servers {#allowed-db-hosts}

By default, a free mode user can connect to any server Gresbase can reach. Two variables narrow it down.

### Fix the server {#fix-server}

`GRESBASE_DB_HOST` fixes the host of the form, and `GRESBASE_DB_PORT` its port. `GRESBASE_DB_NAME` fixes the database and `GRESBASE_DB_USER` the user. The fields show *Defined by the environment variable* followed by the variable name, and cannot be changed. Gresbase also applies them on the server, whatever the form sends.

With host, database and user fixed, the form only asks for the password: there is no connection URL field and no recent connections, and the cursor starts in **Password**.

```yaml title="docker-compose.yml"
      GRESBASE_MODE_FREE: "true"
      GRESBASE_DB_HOST: db
      GRESBASE_DB_NAME: app
      GRESBASE_DB_USER: app_reader
```

### Allow a list of servers {#allow-list}

`GRESBASE_ALLOWED_DB_HOSTS` takes a comma-separated list of host names, IP addresses or CIDR ranges.

```yaml title="docker-compose.yml"
      GRESBASE_ALLOWED_DB_HOSTS: db,pg.internal,10.0.0.0/8
```

- A host name allows whatever it resolves to.
- An IP or a CIDR allows servers whose address falls inside it.
- Any other server gets `403` with the code `db_host_not_allowed`: *This server isn't allowed. Ask the administrator (GRESBASE_ALLOWED_DB_HOSTS).*

Gresbase pins the DNS answer it checked. A DNS record that changes afterwards cannot point the connection at another server.

:::tip
Without this list, free mode can be used to probe any host and port the container can reach. On a shared server, set it.
:::

## Limit the sessions {#max-sessions}

`GRESBASE_MAX_SESSIONS` caps how many free mode sessions run at once. The default is `10`, and the range is 1 to 1000.

When the cap is reached, new sign-ins get `503` with the code `too_many_sessions`: *Too many people are connected right now. Try again in a while.* Switching connection inside an existing session does not count as a new one.

Each session opens a pool of up to 3 connections to its database.

## Sessions and security {#security}

- Sessions last `GRESBASE_SESSION_TTL`, as in the other modes. See [Sign-in and accounts](./authentication.md#sessions).
- Sign-in attempts share the limit of 5 per minute per client IP. See [Too many attempts](./authentication.md#rate-limit).
- There is no `Host` check in free mode, because the Postgres password is the login.

:::warning
The Postgres password travels in every sign-in. Put Gresbase behind HTTPS before opening it to a network. See [Security and networking](./security.md).
:::
