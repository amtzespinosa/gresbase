---
description: Start Gresbase without DATABASE_URL and set it up from the browser, step by step.
---

## When the wizard opens {#when}

Gresbase starts in setup mode when all of these are true:

- `DATABASE_URL` is not set.
- There are no saved connections in `/data/gresbase.json`.
- The wizard was never completed.
- `GRESBASE_MODE_FREE` is not `true`.

In setup mode the wizard is the only thing the app does. Every other screen waits until you finish it.

Start it with a Compose file without `DATABASE_URL`:

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
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
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

:::warning
Mount a volume on `/data`. The wizard saves everything there. Without a persistent data directory it warns **Settings are not persistent**, says why (an anonymous volume, for example) and the setup is lost with the container. See [When Gresbase warns](./data-volume.md#warnings).
:::

## The setup token {#token}

While setup is pending, anyone who reaches the port could set Gresbase up. A token prevents that. The token changes on every start. There are two ways to get it.

**The link in the log.** At startup Gresbase writes a `SETUP MODE` line with a ready link and the token:

```sh
docker compose logs gresbase | grep "SETUP MODE"
```

The line carries `path="/setup#token=…"`. Open that path on your Gresbase address, for example `http://localhost:8080/setup#token=…`, and the wizard fills in the token. The token goes after `#`, so the browser never sends it to the server or to a proxy, and the wizard removes it from the address bar.

**A command in the container.** It prints only the token:

```sh
docker compose exec gresbase /gresbase setup-token
```

The **Setup token** step shows the same command with your container's id (`docker exec <id> /gresbase setup-token`). Only someone who can run commands in the container can read it.

To choose the token yourself, set `GRESBASE_SETUP_TOKEN` (at least 16 characters). Then it's never written to the log, and `setup-token` prints that value.

The wizard asks for the token only when the request doesn't come from the same machine. That means the connection comes from the loopback address and the URL uses `localhost`, `127.0.0.1` or `[::1]`. Through a Docker published port, the connection usually comes from Docker's network, so expect the **Setup token** step.

## Go through the wizard {#steps}

Open [http://localhost:{{port}}](http://localhost:{{port}}). The wizard shows the step you're on as **Step 1 of …**.

:::steps
### Welcome to Gresbase {#welcome}

Pick the **Language** and the **Theme**. The language you choose becomes the server's default, unless `GRESBASE_LANG` sets it.

### Setup token {#token-step}

Paste the token from the log into **Token** and press **Next**. This step only appears when the token is needed.

### How will you use it? {#mode}

Choose one:

- **Saved connection** (**Recommended**): an administrator account and a database Gresbase remembers. You can add more connections later.
- **Free mode, like Adminer**: each person signs in with any PostgreSQL user and password. Nothing is saved. See [Free mode](./free-mode.md).

With free mode, **Save and finish** ends the wizard here.

### Administrator account {#account}

Type a **Username** and a **Password** of at least 8 characters, and repeat it in **Confirm password**. You'll sign in to Gresbase with this account.

If `GRESBASE_USER` and `GRESBASE_PASSWORD` are set, they define the administrator and this step is skipped.

### Database connection {#connection}

Paste a URL into **Connection URL** to fill the fields, or type **Host**, **Port**, **Database**, **User** and **Password**. **Port** is 5432 and **SSL** is `prefer` unless you change them. Tick **Read-only** to block writes on this connection.

Press **Test connection**. On success you'll see **Connected to PostgreSQL** with the version and its support level. Then press **Save and finish**: Gresbase tests the connection again before saving.

### All set {#done}

The wizard sums up what it saved. Press **Enter Gresbase**. With a saved connection, you're already signed in as the administrator.
:::

:::tip
`GRESBASE_DB_HOST`, `GRESBASE_DB_PORT`, `GRESBASE_DB_NAME` and `GRESBASE_DB_USER` fix those fields of the connection form. The fields show **Defined by the environment variable** and can't be changed.
:::

## If the connection test fails {#test-fails}

The wizard tells you why. The most common causes:

| Message | What to check |
| --- | --- |
| The host name doesn't resolve. | The host name, and that Gresbase is on a network that can reach it. |
| Nothing is listening at that host and port. | That PostgreSQL is running and the port is right. |
| PostgreSQL rejected the user or password. | The credentials, and `pg_hba.conf` on the server. |
| The SSL negotiation failed. | Try another **SSL** mode. |
| That database doesn't exist. | The database name. |
| The server didn't answer in time. | The host, the network and firewalls. |

PostgreSQL 11 and older are refused. More help in [Troubleshooting](./troubleshooting.md).

## After the wizard {#after}

The choices are saved in `/data/gresbase.json`: the connection password encrypted, the administrator password as a hash. The wizard doesn't open again. You change things later in [Settings](./settings.md) and [Saved connections](./connections.md).
