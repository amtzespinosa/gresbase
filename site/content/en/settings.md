---
description: Change the server settings from the app, and know which value wins when an environment variable sets the same thing.
---

## Open the screen {#open}

Click **Settings** (the gear icon) at the bottom of the sidebar.

Everyone sees the personal preferences and **About**. The server settings, connections and account only appear for the administrator.

:::note
Without login, the local session counts as administrator. In free mode, nobody is. See [Sign-in and accounts](./authentication.md).
:::

## Sections {#sections}

| Section | What it holds | Who sees it |
| --- | --- | --- |
| **General** | **Theme**, **Language**, **Grid density**, and **Default language** for the administrator | Everyone |
| **Connections** | The saved connections | Administrator |
| **Database pools** | **Connections per pool**, **Open pools**, **Idle pool timeout** | Administrator |
| **Security** | **Account**, the change password form, **Sign out**, **Session duration**, **Allowed hosts**, **Read-only** | Administrator |
| **SQL editor** | **Default timeout**, **Row limit**, **CSV import timeout** | Administrator |
| **About** | **Gresbase version**, **PostgreSQL version**, links to the source code and the licenses | Everyone |

Theme, language and grid density are stored in your browser. They only affect you. See [Language and theme](./preferences.md).

Saved connections have their own page: [Saved connections](./connections.md). The account and password are covered in [Sign-in and accounts](./authentication.md#change-password).

## Server settings {#server-settings}

Each server setting matches an environment variable. The app stores your changes in `gresbase.json`, in the data volume.

| Setting | Variable | Default | Applies |
| --- | --- | --- | --- |
| **Default language** | `GRESBASE_LANG` | `en` | At once |
| **Session duration** | `GRESBASE_SESSION_TTL` | `12h` | On restart |
| **Allowed hosts** | `GRESBASE_ALLOWED_HOSTS` | empty | On restart |
| **Read-only** | `GRESBASE_READ_ONLY` | `false` | On restart |
| **Default timeout** | `GRESBASE_STATEMENT_TIMEOUT` | `30s` | On restart |
| **Row limit** | `GRESBASE_SQL_MAX_ROWS` | `1000` | At once |
| **CSV import timeout** | `GRESBASE_IMPORT_TIMEOUT` | `10m` | On restart |
| **Connections per pool** | `GRESBASE_MAX_CONNS` | `10` | On restart |
| **Open pools** | `GRESBASE_MAX_POOLS` | `20` | On restart |
| **Idle pool timeout** | `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | On restart |

Values follow the same rules as the variables. Durations look like `30s`, `10m` or `12h`. **Row limit** accepts 1 to 100000. A value Gresbase cannot accept shows an error and nothing is saved.

Text and number fields have a **Save** button. **Default language** and **Read-only** save as soon as you pick a value. Saving an empty field returns the setting to its default.

When a change only applies on restart, the setting shows an **Applies on restart** badge until you restart Gresbase.

Everything else stays in environment variables only: `DATABASE_URL`, the port, the base path, the data directory, the keys and the logs. See [Environment variables](./environment.md).

## Which value wins {#precedence}

Gresbase reads each setting from three places, in this order:

1. The environment variable, if it is set and not empty.
2. The value saved from the app in `gresbase.json`.
3. The default.

### Settings locked by the environment {#locked}

When an environment variable sets a value, the field shows a lock and the text *Defined by environment variable* followed by the variable name. The field is disabled.

The API rejects changes to a locked setting with `409` and the code `locked_by_env`: *This setting is defined by an environment variable and can't be changed here.*

To edit it from the app, remove the variable from your Compose file and recreate the container.

## Without a data volume {#not-persistent}

If `/data` would not keep the settings, the screen says why. For example: *The data directory is not writable: saved queries and settings live in memory and are lost on every restart. Mount a named volume on /data (GRESBASE_DATA_DIR) to keep them.* See [When Gresbase warns](./data-volume.md#warnings).

See [The data volume](./data-volume.md).
