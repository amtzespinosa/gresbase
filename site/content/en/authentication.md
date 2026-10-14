---
description: Choose who can open Gresbase, how sessions work and how to change the administrator password.
---

## Three ways to sign in {#regimes}

Gresbase has three sign-in regimes. Which one applies depends on your configuration.

| Regime | When | Who gets in |
| --- | --- | --- |
| No login | No account in the environment or in `gresbase.json`, and free mode off | Requests with a local `Host` or one listed in `GRESBASE_ALLOWED_HOSTS` |
| Administrator account | `GRESBASE_USER` and `GRESBASE_PASSWORD`, or the account created in the setup wizard | Whoever knows that username and password |
| Free mode | `GRESBASE_MODE_FREE`, or chosen in the setup wizard | Anyone with valid PostgreSQL credentials |

Free mode has its own page: [Free mode](./free-mode.md).

## No login {#no-login}

Without an account, Gresbase only answers requests whose `Host` header is `localhost`, `127.0.0.1` or `[::1]`. That covers the quick start, where the port is published on `127.0.0.1`.

Any other `Host` gets a `403`. The browser shows an **Access blocked** page that explains what to set. API calls get the `forbidden` error code. `/healthz` stays open so container healthchecks work from any address.

To accept another name without login, add it to `GRESBASE_ALLOWED_HOSTS`, comma separated. An entry matches the host name, or the exact `host:port`.

```yaml title="docker-compose.yml"
    environment:
      GRESBASE_ALLOWED_HOSTS: gresbase.lan,192.168.1.20
```

:::warning
Without login, anyone who reaches an allowed host has full administrator access. Use it only on a machine or network you control. The check on `Host` also blocks DNS rebinding attacks from web pages you visit.
:::

At startup without an account, the log prints a `LOGIN DISABLED` warning with the accepted hosts.

## Administrator account {#account}

There is one administrator. It comes from one of two places.

- **Environment variables.** Set `GRESBASE_USER` and `GRESBASE_PASSWORD`. Set both or neither: one without the other stops Gresbase at startup.
- **Setup wizard.** The wizard can create the account. Gresbase stores it in `gresbase.json` as an argon2id hash, never the password itself.

If both exist, the environment variables win. Passwords created in the app need between 8 and 256 characters.

Once there is an account, Gresbase accepts any `Host`. The sign-in screen asks for **Username** and **Password**, then **Sign in**.

## Sessions {#sessions}

A session is a signed cookie called `gresbase_session`.

- It is `HttpOnly` and `SameSite=Strict`.
- It is `Secure` when the request arrives over HTTPS, or with the header `X-Forwarded-Proto: https` from a proxy. Plain HTTP on `localhost` keeps working.
- Its path is the base path of the app (`/` by default, see `GRESBASE_BASE_PATH`).

`GRESBASE_SESSION_TTL` sets how long a session lasts. The default is `12h`. It takes a Go duration such as `30m`, `8h` or `168h`.

Sign out with the **Sign out** button in the sidebar, on the Settings screen or in the command palette. Gresbase asks first. If the grid has unsaved changes, the dialog says how many will be lost, and an open SQL transaction is rolled back.

### The session secret {#session-secret}

`GRESBASE_SESSION_SECRET` signs the cookies. It needs at least 32 characters.

If you leave it empty, Gresbase generates one on first start and stores it sealed in `gresbase.json`. Sessions then survive restarts, as long as `/data` is writable.

Sessions end for everyone when:

- the data directory is not writable, because the generated secret only lives until the next restart;
- you change `GRESBASE_SESSION_SECRET`;
- you change `GRESBASE_SECRET_KEY`, because the stored secret can no longer be decrypted and a new one replaces it.

## Too many attempts {#rate-limit}

Gresbase allows 5 failed attempts per minute for each client IP. After that it answers `429` with a `Retry-After` header, and the screen says: *Too many attempts. Wait a minute and try again.*

Only failures count: a wrong user or password, a wrong current password, a free mode connection that fails, or a wrong setup token. Successful attempts don't. The same counter covers sign-in, password changes, free mode sign-in and the setup wizard.

:::note
The IP is the direct peer of the connection. By default `X-Forwarded-For` is ignored, so it cannot be forged to dodge the limit. Behind a reverse proxy, list the proxy in `GRESBASE_TRUSTED_PROXIES` (IPs or CIDRs): for requests that come from it, Gresbase takes the client from `X-Forwarded-For`, read from the right, skipping the trusted proxies. Each client then has its own limit. Without it, every client shares the proxy's IP and the same 5 failed attempts.
:::

## Change the password {#change-password}

This works for the account created in the setup wizard.

:::steps
### Open Settings

Click **Settings** (the gear icon) at the bottom of the sidebar. The **Security** section shows the **Account** you are signed in as.

### Fill in the form

Type the **Current password**, then the **New password** (at least 8 characters) and **Confirm password**.

### Save

Click **Change password**. Gresbase confirms with *Password changed. Other sessions have been signed out.*
:::

Your own session stays open. Every other session, on any device, must sign in again.

If the account comes from `GRESBASE_USER` and `GRESBASE_PASSWORD`, the form is not shown. The screen says the administrator is defined by those variables. Change the variables and restart Gresbase: sessions signed in with the old password stop working.

## Related pages {#related}

- [Free mode](./free-mode.md)
- [Security and networking](./security.md)
- [Setup wizard](./setup-wizard.md)
- [Environment variables](./environment.md)
