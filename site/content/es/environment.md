---
description: Todas las variables que Gresbase lee al arrancar, con su tipo, su valor por defecto y lo que hacen.
---

## Cómo las lee Gresbase {#how}

Gresbase toma su configuración de variables de entorno al arrancar. Ninguna es obligatoria: sin `DATABASE_URL` abre el [asistente de configuración](./setup-wizard.md).

- Los espacios alrededor del valor se ignoran. Un valor vacío cuenta como no definido.
- Las **duraciones** siguen la sintaxis de Go: un número y una unidad (`ms`, `s`, `m`, `h`), como `30s`, `10m` o `1h30m`. Tienen que ser mayores que cero.
- Los **booleanos** aceptan `true` o `false` (también `1`, `0`, `t`, `f`, `TRUE`, `FALSE`).
- Las **listas** van separadas por comas.

Si un valor no es válido, Gresbase no arranca. Escribe `invalid configuration:` y una línea por problema, por ejemplo:

```sh
gresbase: invalid configuration:
GRESBASE_PORT: must be an integer between 1 and 65535 (got "80a")
GRESBASE_USER/GRESBASE_PASSWORD: set both to enable login, or neither
```

## Servidor {#server}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `DATABASE_URL` | ninguno | URL, p. ej. `postgres://app:secreto@db:5432/app`. La base que vas a gestionar. Empieza por `postgres://` o `postgresql://`. Su conexión aparece bloqueada en la app. Mira [Conectar con PostgreSQL](./connecting.md). |
| `GRESBASE_PORT` | `8080` | Entero, 1–65535, p. ej. `9000`. Puerto en el que escucha Gresbase dentro del contenedor. |
| `GRESBASE_BASE_PATH` | `/` | Ruta, p. ej. `/gresbase`. Sirve la app bajo un prefijo, para un proxy inverso. Se quitan las barras finales. Cada tramo solo admite letras, dígitos y `.` `_` `~` `-`. |
| `GRESBASE_TRUSTED_PROXIES` | vacía | Lista de IP o CIDR, p. ej. `172.18.0.0/16`. Proxies inversos cuyo `X-Forwarded-For` dice el cliente real para el límite de intentos. Vacía no se fía de ninguna cabecera. Consulta [Demasiados intentos](./authentication.md#rate-limit). |
| `GRESBASE_ALLOWED_HOSTS` | vacía | Lista de nombres de host, p. ej. `db.interno,192.168.1.20`. Nombres de `Host` extra aceptados cuando no hay login. Sin login solo valen `localhost`, `127.0.0.1` y `[::1]`. El puerto no cuenta. |

## Inicio de sesión y sesiones {#sign-in}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `GRESBASE_USER` | ninguno | Texto, p. ej. `admin`. Cuenta de administrador definida por el entorno. Va junto a `GRESBASE_PASSWORD`: las dos o ninguna. |
| `GRESBASE_PASSWORD` | ninguno | Texto, p. ej. `una-contraseña-larga`. Contraseña de `GRESBASE_USER`. Con las dos definidas, hay que iniciar sesión. |
| `GRESBASE_SESSION_SECRET` | generado | Texto, 32+ caracteres, p. ej. salida de `openssl rand -hex 32`. Clave que firma las cookies de sesión. Si no la defines, Gresbase genera una y la guarda cifrada en `gresbase.json`, así las sesiones sobreviven a un reinicio. |
| `GRESBASE_SESSION_TTL` | `12h` | Duración, p. ej. `8h`. Cuánto dura un inicio de sesión. |

Más en [Inicio de sesión y cuentas](./authentication.md).

## Base de datos y límites {#database}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `GRESBASE_READ_ONLY` | `false` | Booleano, p. ej. `true`. Todas las conexiones rechazan escrituras. Mira [Modo solo lectura](./read-only.md). |
| `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Duración, p. ej. `2m`. Tiempo máximo de cada consulta. |
| `GRESBASE_IMPORT_TIMEOUT` | `10m` | Duración, p. ej. `30m`. Tiempo máximo de una importación CSV completa. |
| `GRESBASE_SQL_MAX_ROWS` | `1000` | Entero, 1–100000, p. ej. `5000`. Filas por resultado en el editor SQL. |
| `GRESBASE_MAX_CONNS` | `10` | Entero, 1–1000, p. ej. `5`. Conexiones que abre cada pool contra su base. |
| `GRESBASE_MAX_POOLS` | `20` | Entero, 1–1000, p. ej. `50`. Bases con un pool abierto a la vez. Si se alcanza el límite y no hay pools inactivos, la API responde `too_many_connections`. |
| `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | Duración, p. ej. `30m`. Un pool sin uso se cierra pasado este tiempo. El de `DATABASE_URL` sigue abierto. |

## Datos y secretos {#data}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `GRESBASE_DATA_DIR` | `/data` | Ruta, p. ej. `/var/lib/gresbase`. Dónde viven `gresbase.json`, `secret.key` y las consultas guardadas. Mira [El volumen de datos](./data-volume.md). |
| `GRESBASE_SECRET_KEY` | ninguno | Texto, 32+ caracteres, p. ej. un secreto de Docker. Cifra los secretos que se guardan en `gresbase.json`. Sin ella, Gresbase crea `secret.key` en el directorio de datos. |

## Asistente y modo libre {#setup}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `GRESBASE_SETUP_TOKEN` | aleatorio | Texto, 16+ caracteres, p. ej. `mi-token-de-setup-2026`. Desbloquea el asistente desde otras máquinas. Si no lo defines, Gresbase genera uno en cada arranque y lo escribe en el log como `setup_token`. |
| `GRESBASE_MODE_FREE` | `false` | Booleano, p. ej. `true`. Fuerza el [modo libre](./free-mode.md): se entra con credenciales de PostgreSQL. |
| `GRESBASE_DB_HOST` | ninguno | Nombre de host o IP, p. ej. `db`. Fija el servidor de los formularios de conexión (asistente, conexiones guardadas, modo libre). El campo queda bloqueado. |
| `GRESBASE_DB_PORT` | ninguno | Entero, 1–65535, p. ej. `5432`. Fija el puerto de esos formularios. Sin ella, el formulario usa `5432` salvo que escribas otro. |
| `GRESBASE_DB_NAME` | ninguno | Nombre de la base, p. ej. `app`. Fija la base de datos de esos formularios. |
| `GRESBASE_DB_USER` | ninguno | Nombre de usuario, p. ej. `app_reader`. Fija el usuario de esos formularios. Con servidor, base y usuario fijados, el [modo libre](./free-mode.md#fix-server) solo pide la contraseña. |
| `GRESBASE_ALLOWED_DB_HOSTS` | vacía (cualquiera) | Lista de hosts, IP o CIDR, p. ej. `db,10.0.0.0/8`. Servidores permitidos en modo libre. Los demás reciben `db_host_not_allowed`. |
| `GRESBASE_MAX_SESSIONS` | `10` | Entero, 1–1000, p. ej. `25`. Sesiones de modo libre a la vez. Por encima, la API responde `too_many_sessions`. |

`GRESBASE_MODE_FREE=true` no se puede combinar con `DATABASE_URL` ni con `GRESBASE_USER`. En modo libre, el login son las credenciales de PostgreSQL.

## Idioma y logs {#logs}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `GRESBASE_LANG` | `en` | `en` o `es`. Idioma para quien aún no ha elegido uno. |
| `GRESBASE_LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error`. Nivel mínimo que se escribe en el log. |
| `GRESBASE_LOG_FORMAT` | `text` | `text` o `json`. Formato del log. `json` encaja con los recolectores de logs. |

El log nunca lleva contraseñas: `DATABASE_URL` aparece con la contraseña cambiada por `****`.

## Variables que también se cambian en Ajustes {#settings}

El administrador puede cambiar algunos valores en **Ajustes**. Se guardan en `gresbase.json`. Manda primero la variable de entorno, luego `gresbase.json` y por último el valor por defecto.

| Variable | Nombre en Ajustes | Cuándo se aplica |
| --- | --- | --- |
| `GRESBASE_LANG` | Idioma por defecto | Al momento |
| `GRESBASE_SESSION_TTL` | Duración de la sesión | Al reiniciar |
| `GRESBASE_ALLOWED_HOSTS` | Hosts permitidos | Al reiniciar |
| `GRESBASE_READ_ONLY` | Solo lectura | Al reiniciar |
| `GRESBASE_STATEMENT_TIMEOUT` | Timeout por defecto | Al reiniciar |
| `GRESBASE_SQL_MAX_ROWS` | Límite de filas | Al momento |
| `GRESBASE_IMPORT_TIMEOUT` | Timeout de importación CSV | Al reiniciar |
| `GRESBASE_MAX_CONNS` | Conexiones por pool | Al reiniciar |
| `GRESBASE_MAX_POOLS` | Pools abiertos | Al reiniciar |
| `GRESBASE_POOL_IDLE_TIMEOUT` | Cierre de pools inactivos | Al reiniciar |

Si cambias un valor que necesita reinicio, verás **Se aplica al reiniciar**. Lo que guardas en Ajustes pasa las mismas comprobaciones que la variable.

:::note
Una variable de entorno bloquea su ajuste. Ajustes lo muestra como **Definido por variable de entorno** seguido del nombre y no deja cambiarlo. Para editarlo desde la app, quita la variable y recrea el contenedor.
:::

El resto (`DATABASE_URL`, puerto, ruta base, cuentas, secretos, directorio de datos, modo libre y logs) solo se define en el entorno. Más en [Pantalla de ajustes](./settings.md).

## Un ejemplo completo {#example}

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://gresbase:secreto@db:5432/app
      GRESBASE_USER: admin
      GRESBASE_PASSWORD: una-contraseña-larga
      GRESBASE_STATEMENT_TIMEOUT: 1m
      GRESBASE_LANG: es
      GRESBASE_LOG_FORMAT: json
    volumes:
      - gresbase-data:/data
    ports:
      - "127.0.0.1:{{port}}:8080"

volumes:
  gresbase-data:
```
