---
description: Write the connection URL, pick an SSL mode, reach your database from the container and give Gresbase a user with only the rights it needs.
---

## The connection URL {#url}

`DATABASE_URL` is a PostgreSQL URL. It must start with `postgres://` or `postgresql://`:

```sh
postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

- The port defaults to `5432` when you leave it out.
- Percent-encode special characters in the user or password: `@` is `%40`, `:` is `%3A`, `/` is `%2F`.
- The `key=value` form (`host=db user=app …`) is not accepted. Use the URL.

If the URL is not valid, Gresbase doesn't start and logs `DATABASE_URL: must be a postgres:// or postgresql:// URL`. The value itself is never printed, because it holds the password.

Without `DATABASE_URL`, you add connections in the [setup wizard](./setup-wizard.md) or in [saved connections](./connections.md). Those forms ask for the same parts one by one. You can also paste a URL in **Connection URL** to fill them.

## What happens at startup {#startup}

With `DATABASE_URL` set, Gresbase connects before it starts serving:

- It retries for up to 30 seconds, in case the database is still starting.
- Wrong credentials, a missing database, an SSL failure or PostgreSQL older than 12 stop it at once.
- If it can't connect, the container exits with a line like `cannot connect to PostgreSQL (dns): … hint: …`.

Gresbase needs PostgreSQL 12 or newer. Every connection shows up in `pg_stat_activity` with `application_name` set to `gresbase`.

## SSL {#ssl}

Add `sslmode` to the URL. Gresbase passes it to the PostgreSQL driver (pgx), which follows libpq:

| `sslmode` | What it does |
| --- | --- |
| `disable` | No encryption. Fine inside a private Docker network. |
| `allow` | Tries without SSL first, then with SSL. |
| `prefer` | Tries SSL first, then without it. This is the default. |
| `require` | Always encrypts, but doesn't check the certificate unless you set `sslrootcert`. |
| `verify-ca` | Encrypts and checks that the certificate is signed by a trusted CA. |
| `verify-full` | Same as `verify-ca`, and also checks the host name. |

The connection forms offer `disable`, `prefer`, `require`, `verify-ca` and `verify-full`, with `prefer` by default.

To check certificates, add these parameters to `DATABASE_URL`:

- `sslrootcert=/certs/ca.pem`: the CA that signed the server certificate. `sslrootcert=system` uses the system CAs and forces `verify-full`.
- `sslcert=/certs/client.pem` and `sslkey=/certs/client.key`: a client certificate, if the server asks for one.

The paths are inside the container, so mount the files:

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secret@db.example.com:5432/app?sslmode=verify-full&sslrootcert=/certs/ca.pem
    volumes:
      - ./certs:/certs:ro
      - gresbase-data:/data
```

The connection forms have no field for certificates: there, `verify-ca` and `verify-full` check against the system CAs.

## Where the database lives {#network}

### In the same Compose file {#same-compose}

Use the service name as the host. Both services share the default network:

```yaml title="docker-compose.yml"
services:
  db:
    image: postgres:17
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app?sslmode=disable
```

### In another Compose project {#other-compose}

Join the network of that project and use its service name. Find the network with `docker network ls`:

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    networks:
      - myapp_default

networks:
  myapp_default:
    external: true
```

### On the host machine {#host}

Inside the container, `localhost` is the container itself, not your machine.

- Docker Desktop (Windows, macOS): use `host.docker.internal` as the host.
- Linux: add `host.docker.internal` yourself, as below. PostgreSQL must also listen on that interface (`listen_addresses`) and allow the client in `pg_hba.conf`.

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DATABASE_URL: postgres://app:secret@host.docker.internal:5432/app
```

## A user with only what it needs {#least-privilege}

Gresbase can do whatever its PostgreSQL user can do. Don't give it a superuser. Create a user for it with the rights you want to use:

```sql
CREATE ROLE gresbase LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE app TO gresbase;
GRANT USAGE ON SCHEMA public TO gresbase;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gresbase;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gresbase;
```

`GRANT … ON ALL TABLES` only covers the tables that exist now. Use `ALTER DEFAULT PRIVILEGES` for the ones you create later. To edit structure (create tables, add columns, indexes), the user must own the tables or have the rights to change them.

## A read-only user {#read-only-user}

To look without touching, grant only `SELECT`:

```sql
CREATE ROLE gresbase_ro LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE app TO gresbase_ro;
GRANT USAGE ON SCHEMA public TO gresbase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gresbase_ro;
ALTER ROLE gresbase_ro SET default_transaction_read_only = on;
```

The last line is optional. Gresbase reads `default_transaction_read_only` when it connects. If it is `on`, Gresbase behaves as in [read-only mode](./read-only.md), the SQL editor included, so the setting can't be turned off from it. The grants are still what really protects the data: any other client with this user can turn that setting off in its own session.

## When the connection fails {#errors}

**Test connection**, the setup wizard and free mode sign-in tell you why a connection failed. The API answers `connection_failed` with one of these reasons:

| Reason | What you see | What to check |
| --- | --- | --- |
| `dns` | The host name doesn't resolve. Check it and that Gresbase can reach that network. | The host name, and that both containers share a network. |
| `connection_refused` | Nothing is listening at that host and port. Check that PostgreSQL is running. | That PostgreSQL is up and the port is right. |
| `authentication` | PostgreSQL rejected the user or password. | The user, the password and `pg_hba.conf`. |
| `ssl` | The SSL negotiation failed. Try another SSL mode. | `sslmode` and the certificates. |
| `database_not_found` | That database doesn't exist. | The database name. |
| `timeout` | The server didn't answer in time. Check the host, the network and firewalls. | Firewalls and routes. The test waits up to 10 seconds. |
| `host_not_allowed` | Couldn't connect to PostgreSQL. Check the details and the Gresbase logs. | The server is not in `GRESBASE_ALLOWED_DB_HOSTS`. |
| `other` | Couldn't connect to PostgreSQL. Check the details and the Gresbase logs. | The Gresbase log has the full error. |

With `DATABASE_URL`, the same reasons appear in the log at startup, with a hint. More cases in [Troubleshooting](./troubleshooting.md).
