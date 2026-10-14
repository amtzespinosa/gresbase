---
description: Expose Gresbase safely, from a single machine to a domain with HTTPS, and know where the real security boundary is.
---

## Start on 127.0.0.1 {#localhost}

Inside the container, Gresbase listens on port `8080` (`GRESBASE_PORT`). The quick start publishes that port on the loopback address only:

```yaml title="docker-compose.yml"
    ports:
      - "127.0.0.1:{{port}}:8080"
```

Only your machine can open it. This is the safe default while there is no login.

:::danger
Never expose Gresbase beyond your machine without login. Set `GRESBASE_USER` and `GRESBASE_PASSWORD`, or create the administrator in the setup wizard. See [Sign-in and accounts](./authentication.md).
:::

Without an account, Gresbase already refuses any `Host` that is not local or listed in `GRESBASE_ALLOWED_HOSTS`. That check guards against mistakes and DNS rebinding. It does not replace a password.

## Behind a reverse proxy with HTTPS {#reverse-proxy}

To reach Gresbase from other machines, put a reverse proxy with HTTPS in front of it.

- Keep the port on `127.0.0.1`, or don't publish it at all and let the proxy reach the container over the Docker network.
- Forward to the container port `8080`.
- Send `X-Forwarded-Proto: https`. Gresbase then marks the session cookie `Secure`.
- Turn on login.

With login on, Gresbase accepts any `Host`, so the proxy can keep or rewrite it.

:::tabs
@tab Caddy {#caddy}
```text title="Caddyfile"
gresbase.example.com {
	reverse_proxy gresbase:8080
}
```
@tab Nginx {#nginx}
```text title="nginx.conf"
server {
    listen 443 ssl;
    server_name gresbase.example.com;

    ssl_certificate     /etc/ssl/gresbase.crt;
    ssl_certificate_key /etc/ssl/gresbase.key;

    # CSV imports accept files of up to 100 MiB.
    client_max_body_size 101m;

    location / {
        proxy_pass http://gresbase:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
@tab Traefik {#traefik}
```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    labels:
      traefik.enable: "true"
      traefik.http.routers.gresbase.rule: Host(`gresbase.example.com`)
      traefik.http.routers.gresbase.entrypoints: websecure
      traefik.http.routers.gresbase.tls: "true"
      traefik.http.services.gresbase.loadbalancer.server.port: "8080"
```
:::

Caddy and Traefik send `X-Forwarded-Proto` on their own. Nginx needs the `proxy_set_header` line, and one more thing:

- **Start it after Gresbase.** Nginx resolves `gresbase` when it starts and stops with `host not found in upstream "gresbase"` if the container isn't there yet. In the same Compose file, give the Nginx service `depends_on: [gresbase]`.

Gresbase uses plain HTTP requests, without WebSockets. These three configurations were tested end to end with Caddy 2, Nginx (stable) and Traefik v3: signing in sets the session cookie with `Secure`, a 144 MB CSV export streams from the first byte, and a 75-second query gets its answer. Caddy and Traefik need no extra settings for that.

### Long queries behind a proxy {#long-requests}

Many proxies cut a request that gets no answer for a while. Nginx waits 60 s by default (`proxy_read_timeout`) and answers `504 Gateway Time-out`. Cloudflare waits 100 s for the response to start and answers `524`.

Gresbase keeps long requests alive on its own. When a SQL query, a CSV import or a structure change has no answer after 10 seconds, Gresbase starts the response and sends a space every 10 seconds until the result is ready. The proxy sees data arriving, so it doesn't cut the request, and you don't need to raise any timeout. A query can run as long as its own timeout allows, up to an hour.

Tested with Nginx (stable) and its default settings: a 75-second query gets its answer, and the first byte arrives at 10 seconds. That is well inside Cloudflare's 100 seconds, which only counts until the response starts.

:::note
Once a response has started, its HTTP status is always `200`. If the query then fails, the error comes in the body, and Gresbase shows it as usual. A tool that calls the API directly should read the body, not only the status. Reloading the page still loses a query that is running, just as without a proxy.
:::

:::note
The sign-in limit counts failed attempts per client IP, taken from the TCP connection. Behind a proxy, set `GRESBASE_TRUSTED_PROXIES` to the proxy's address so each client gets its own limit; otherwise every client shares the proxy's IP and the same 5 failed attempts per minute. See [Too many attempts](./authentication.md#rate-limit).
:::

## Serve it under a sub-path {#base-path}

To serve Gresbase at `https://example.com/gresbase/`, set `GRESBASE_BASE_PATH`:

```yaml title="docker-compose.yml"
    environment:
      GRESBASE_BASE_PATH: /gresbase
```

- It starts with `/` and has one or more segments, such as `/gresbase` or `/tools/db`.
- Each segment uses letters, digits, `.`, `_`, `~` or `-`. A trailing `/` is ignored.
- Any other value stops Gresbase at startup with `must be a path like /gresbase`.

Gresbase removes the prefix itself, so the proxy must forward the full path. In Caddy, use `handle`, not `handle_path`:

```text title="Caddyfile"
example.com {
	handle /gresbase* {
		reverse_proxy gresbase:8080
	}
}
```

A request to `/gresbase` redirects to `/gresbase/`. Paths outside the prefix get `404`.

## Without login on a domain {#allowed-hosts}

If you serve Gresbase without login under a name that is not `localhost`, add that name to `GRESBASE_ALLOWED_HOSTS`. Otherwise every request gets the **Access blocked** page.

Do this only on a network you trust. Anyone who reaches that name has full access.

## Protection built in {#built-in}

- **CSRF.** Every API request other than `GET`, `HEAD` or `OPTIONS` must carry the header `X-Gresbase: 1`. Browsers cannot add it cross-site without a CORS preflight, which Gresbase never allows. The cookie is also `SameSite=Strict`.
- **Security headers.** Every response carries a strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Gresbase cannot be embedded in a frame.
- **Setup token.** While Gresbase is not set up, the setup wizard answers any `Host`. Requests from other machines must send the setup token, printed in the log (as a link with the token after `#`, which never reaches the server or a proxy), printed by `gresbase setup-token` inside the container, or set with `GRESBASE_SETUP_TOKEN` (16 characters or more). A request through a Docker published port is never taken as local: from another machine it can arrive from the same Docker address. See [Setup wizard](./setup-wizard.md).
- **Credentials.** Passwords never appear in logs, errors or API responses. Secrets in `gresbase.json` are encrypted with AES-GCM.

## The real boundary: the Postgres role {#postgres-role}

Gresbase can do whatever the PostgreSQL role it connects with can do. That role is the real limit.

- Connect with a role that only has the permissions you need.
- For a read-only Gresbase, use a role that can only `SELECT`, on top of [read-only mode](./read-only.md).

```sql
CREATE ROLE gresbase_ro LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE app TO gresbase_ro;
GRANT USAGE ON SCHEMA public TO gresbase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gresbase_ro;
```

:::warning
The SQL editor warns before destructive statements such as `DROP` or `DELETE` without `WHERE`. It is a help against slips, not a security barrier. It can be bypassed.
:::

More on roles in [Connecting to PostgreSQL](./connecting.md).

## No telemetry {#no-telemetry}

Gresbase sends no telemetry. It makes no network requests except to the databases you configure. Fonts and scripts are bundled in the image, so it works without internet access.
