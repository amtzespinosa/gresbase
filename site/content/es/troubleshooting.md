---
description: Busca el mensaje que te ha mostrado Gresbase, entiende por qué aparece y arréglalo.
---

## Primero, los logs {#logs}

Casi todos los problemas se explican en el log del contenedor:

```sh
docker compose logs gresbase
```

Los mensajes del log están siempre en inglés. Los de la interfaz siguen tu idioma.

## Gresbase no arranca {#does-not-start}

El contenedor se para nada más arrancar. Las últimas líneas del log dicen por qué.

## Configuración no válida {#invalid-configuration}

Alguna variable de entorno tiene un valor que Gresbase no puede usar. El log empieza con `gresbase: invalid configuration:` y lista todos los problemas a la vez, uno por línea. Todas las variables están en [Variables de entorno](./environment.md).

### DATABASE_URL incorrecta {#cfg-database-url}

```text
DATABASE_URL: must be a postgres:// or postgresql:// URL
```

La cadena de conexión tiene otro esquema o no se puede leer. Empiézala por `postgres://`. El valor nunca se imprime porque lleva la contraseña.

### Solo usuario o solo contraseña {#cfg-user-password}

```text
GRESBASE_USER/GRESBASE_PASSWORD: set both to enable login, or neither
```

Solo hay una de las dos. Define ambas o quita ambas.

### Número fuera de rango {#cfg-integer}

```text
GRESBASE_PORT: must be an integer between 1 and 65535 (got "…")
```

No es un número o está fuera de rango. El mismo mensaje, con su rango, sale para `GRESBASE_DB_PORT` (1–65535), `GRESBASE_SQL_MAX_ROWS` (1–100000), `GRESBASE_MAX_CONNS`, `GRESBASE_MAX_POOLS` y `GRESBASE_MAX_SESSIONS` (1–1000).

### Duración sin unidad {#cfg-duration}

```text
GRESBASE_SESSION_TTL: must be a positive duration like 30s or 12h (got "…")
```

Las duraciones llevan unidad: `30s`, `10m`, `12h`. Igual para `GRESBASE_STATEMENT_TIMEOUT`, `GRESBASE_IMPORT_TIMEOUT` y `GRESBASE_POOL_IDLE_TIMEOUT`.

### Ni true ni false {#cfg-bool}

```text
GRESBASE_READ_ONLY: must be true or false (got "…")
```

Usa `true` o `false`. Igual para `GRESBASE_MODE_FREE`.

### Valor que no está en la lista {#cfg-one-of}

```text
GRESBASE_LANG: must be one of en, es (got "…")
```

Solo existen `en` y `es`. `GRESBASE_LOG_LEVEL` admite `debug, info, warn, error`; `GRESBASE_LOG_FORMAT`, `text, json`.

### Ruta base no válida {#cfg-base-path}

```text
GRESBASE_BASE_PATH: must be a path like /gresbase (got "…")
```

Empieza por `/` y usa en cada tramo solo letras, cifras y `.`, `_`, `~`, `-`.

### Secreto o token demasiado corto {#cfg-too-short}

```text
GRESBASE_SESSION_SECRET: must be at least 32 characters
GRESBASE_SECRET_KEY: must be at least 32 characters
GRESBASE_SETUP_TOKEN: must be at least 16 characters
```

Usa un valor más largo. `GRESBASE_SESSION_SECRET` también puedes quitarla y dejar que Gresbase genere una. Cambiar `GRESBASE_SECRET_KEY` tiene consecuencias: lee antes [Copias de seguridad](./backups.md#secret-key).

### Red no válida en GRESBASE_ALLOWED_DB_HOSTS {#cfg-cidr}

```text
GRESBASE_ALLOWED_DB_HOSTS: "…" is not a valid CIDR
```

Una entrada con `/` tiene que ser una red, como `10.0.0.0/8`.

### Modo libre con base o cuenta fijas {#cfg-mode-free}

```text
GRESBASE_MODE_FREE: cannot be combined with DATABASE_URL or GRESBASE_USER: in free mode Postgres credentials are the login
```

El modo libre no tiene base ni cuenta fijas. Quita `DATABASE_URL` y `GRESBASE_USER`, o desactiva el modo libre.

## No llega a la base al arrancar {#cannot-connect}

Con `DATABASE_URL` definida, Gresbase se conecta antes de empezar a servir. Mientras el servidor no responde, escribe `database not ready, retrying` y lo reintenta durante 30 segundos como mucho. Después se detiene con:

```text
gresbase: cannot connect to PostgreSQL (<motivo>): <error del driver>
hint: <qué revisar>
```

`authentication`, `database_not_found`, `ssl` y `unsupported_version` se detienen al momento: reintentar no los arregla. Más en [Conectar con PostgreSQL](./connecting.md). La pista de cada motivo:

### dns {#reason-dns}

```text
the host name in DATABASE_URL does not resolve; check it and that both containers share a network
```

### connection_refused {#reason-refused}

```text
nothing is listening at that host and port; check that Postgres is running and the port is right
```

### authentication {#reason-authentication}

```text
Postgres rejected the user or password in DATABASE_URL (or pg_hba.conf does not allow this client)
```

### ssl {#reason-ssl}

```text
the SSL negotiation failed; adjust sslmode in DATABASE_URL (disable, prefer, require, verify-full)
```

### database_not_found {#reason-database}

```text
the database in DATABASE_URL does not exist; create it or fix the name
```

### timeout {#reason-timeout}

```text
the server did not answer in time; check the host, the network and firewalls
```

### unsupported_version {#reason-unsupported}

```text
Gresbase needs PostgreSQL 12 or newer; upgrade the server or use an older tool
```

## Problemas con el volumen de datos {#data-files}

### Fichero de una versión más nueva {#newer-file}

```text
/data/gresbase.json: written by a newer Gresbase (schema 2, this one reads up to 1)
```

Lo escribió una versión más nueva. Vuelve a esa versión o restaura una copia. Lo explica [Actualizar](./upgrading.md#volume).

### gresbase.json roto {#invalid-json}

```text
/data/gresbase.json: invalid JSON: …
```

Alguien editó el fichero a mano y lo rompió. Corrige el JSON o restaura una copia.

### secret.key no válido {#invalid-key}

```text
/data/secret.key is not a valid key (64 hex characters)
```

El fichero de la clave ha cambiado. Restáuralo desde una copia. Lo explica [Copias de seguridad](./backups.md#secret-key).

## Avisos en el log {#warnings}

### LOGIN DISABLED {#login-disabled}

```sh
LOGIN DISABLED: only requests with a local Host (localhost, 127.0.0.1, [::1]) or GRESBASE_ALLOWED_HOSTS are accepted. Set GRESBASE_USER and GRESBASE_PASSWORD before exposing Gresbase beyond this machine.
```

No hay ninguna cuenta: ni `GRESBASE_USER` y `GRESBASE_PASSWORD`, ni un administrador creado en el asistente. En tu propia máquina no pasa nada. Antes de abrir Gresbase a una red, crea una cuenta: lo tienes en [Inicio de sesión y cuentas](./authentication.md).

### SETUP MODE y el token de configuración {#setup-token}

```sh
SETUP MODE: no database configured. Open Gresbase in a browser to set it up; requests from other machines need the setup token
```

Gresbase aún no tiene ninguna conexión, así que arranca el asistente. La misma línea lleva un enlace listo, `path="/setup#token=…"`, y `setup_token=…`, salvo que definas `GRESBASE_SETUP_TOKEN`. `docker compose exec gresbase /gresbase setup-token` también imprime el token. Desde la misma máquina, el asistente no pide token. Desde otra, sí. Más en [Asistente de configuración](./setup-wizard.md).

Si el asistente dice **El token de configuración no es válido. Vuelve a copiarlo de los logs.**, cópialo otra vez. Cada arranque genera un token nuevo, salvo que tengas `GRESBASE_SETUP_TOKEN`.

### El directorio de datos es un volumen anónimo {#data-dir-anonymous}

```sh
data dir is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on it
```

El contenedor corre sin `-v` (o sin `volumes:` en Compose), así que Docker ha dado a `/data` un volumen anónimo. Funciona, pero el siguiente contenedor empieza vacío. La app muestra: **El directorio de datos es un volumen anónimo: las consultas guardadas y los ajustes se pierden al borrar el contenedor. Monta un volumen con nombre en /data (GRESBASE_DATA_DIR) para conservarlos.** Monta un volumen con nombre; mira [El volumen de datos](./data-volume.md#mount).

### El directorio de datos no se puede escribir {#data-dir-not-writable}

```sh
data dir is not writable: saved queries and settings live in memory and are lost on every restart
```

Gresbase no puede escribir en `/data`. Sigue funcionando, pero los ajustes y las consultas guardadas viven en memoria o en una carpeta temporal. **Ajustes** muestra **El directorio de datos no se puede escribir: las consultas guardadas y los ajustes viven en memoria y se pierden en cada reinicio. Monta un volumen con nombre en /data (GRESBASE_DATA_DIR) para conservarlos.**

Monta un volumen en `/data`. Si es una carpeta del anfitrión, tiene que poder escribirla el usuario `65532`, que es con el que corre la imagen:

```sh
sudo chown -R 65532:65532 ./data
```

## Acceso bloqueado {#access-blocked}

El navegador muestra una página con el título **Acceso bloqueado**:

Gresbase no tiene login configurado, así que solo responde en `localhost`. Define `GRESBASE_USER` y `GRESBASE_PASSWORD` para activar el login, o añade este host a `GRESBASE_ALLOWED_HOSTS`.

Sin cuenta, Gresbase solo atiende peticiones dirigidas a `localhost`, `127.0.0.1` o `[::1]`, y lo has abierto con otro nombre o IP. Tienes tres salidas:

- Ábrelo como `http://localhost:{{port}}`.
- Define `GRESBASE_USER` y `GRESBASE_PASSWORD`, o crea un administrador en el asistente.
- Añade el nombre que usas a `GRESBASE_ALLOWED_HOSTS`, por ejemplo `gresbase.internal`. Solo en una red de confianza.

La API responde a esas peticiones con `403 forbidden`. `/healthz` sigue abierto para que funcionen las comprobaciones de salud.

## Errores en la app {#app-errors}

La interfaz muestra estos mensajes. El código de la primera columna es el que devuelve la API.

| Código | Mensaje | Qué hacer |
| --- | --- | --- |
| `read_only` | Gresbase está en modo solo lectura: no se pueden hacer cambios. | El solo lectura está activo, para todo o para esa conexión. Lo explica [Modo solo lectura](./read-only.md). |
| `timeout` | La consulta tardaba demasiado y se ha detenido. | Superó el límite por sentencia (30 s por defecto). Súbelo en el editor SQL o con `GRESBASE_STATEMENT_TIMEOUT`. |
| `canceled` | Se ha cancelado la consulta. | Alguien detuvo la consulta. Vuelve a lanzarla. |
| `conflict` | Alguien ha cambiado estos datos mientras tanto. Recarga y vuelve a intentarlo. | La fila cambió después de cargarla. Recarga, revisa los valores nuevos y vuelve a editar. |
| `no_primary_key` | Esta tabla no tiene clave primaria, así que sus filas no se pueden editar. | Gresbase necesita una clave primaria para localizar cada fila. Añade una o edita con SQL. |
| `not_writable` | Las vistas y lo que no sea una tabla no se pueden editar. | Edita la tabla de la que sale. |
| `not_undoable` | Este cambio no se puede deshacer de forma segura. | Triggers o cascadas tocaron otros datos. Corrígelo a mano si hace falta. |
| `confirmation_required` | Esta sentencia puede destruir datos. Confírmala antes de ejecutarla. | El editor SQL detectó una sentencia destructiva. Confírmala si es lo que querías. |
| `pg_error` | PostgreSQL ha devuelto un error. | El detalle viene de PostgreSQL. Corrige la sentencia o el valor. |
| `locked_by_env` | Este ajuste lo define una variable de entorno y no se puede cambiar aquí. | Cambia la variable y reinicia el contenedor. |
| `too_many_connections` | Hay demasiadas bases abiertas a la vez. Inténtalo de nuevo en un momento. | Se alcanzó `GRESBASE_MAX_POOLS` sin ningún pool inactivo. Espera o sube el límite. |
| `too_many_sessions` | Hay demasiadas personas conectadas ahora mismo. Inténtalo dentro de un rato. | El modo libre llegó a `GRESBASE_MAX_SESSIONS`. Espera o sube el límite. |
| `db_host_not_allowed` | Este servidor no está permitido. Pregunta al administrador (GRESBASE_ALLOWED_DB_HOSTS). | En modo libre, ese servidor no está en `GRESBASE_ALLOWED_DB_HOSTS`. |
| `unsupported_version` | Gresbase necesita Postgres 12 o superior. | El servidor es PostgreSQL 11 o anterior. |
| `rate_limited` | Demasiados intentos. Espera un minuto y vuelve a probar. | Más de 5 intentos de entrada en un minuto desde la misma IP. Espera un minuto. |
| `unauthorized` | Tu sesión ha terminado. Vuelve a entrar. | La sesión caducó (`GRESBASE_SESSION_TTL`) o cambió la contraseña. |
| `forbidden` | No tienes acceso a esto. | Tu rol no puede hacerlo, o el host no está permitido sin login. |
| `setup_required` | Gresbase aún no está configurado. | Termina el [asistente de configuración](./setup-wizard.md). |
| `internal` | Algo ha fallado en el servidor. Revisa los logs. | Mira el log del contenedor. |
| — | No se puede contactar con Gresbase. Comprueba que está en marcha. | El navegador no recibió respuesta. Comprueba que el contenedor está levantado. |

### No se pudo conectar {#connection-failed}

**Probar conexión** y la entrada del modo libre muestran **No se pudo conectar a PostgreSQL.** con el motivo:

| Mensaje | Qué revisar |
| --- | --- |
| El nombre del servidor no se resuelve. Revísalo y comprueba que Gresbase llega a esa red. | El nombre del servidor y que el contenedor de Gresbase está en la misma red de Docker. |
| No hay nada escuchando en ese servidor y puerto. Comprueba que PostgreSQL está en marcha. | Que PostgreSQL está en marcha y que el puerto es el correcto (5432 por defecto). |
| PostgreSQL rechazó el usuario o la contraseña. | Las credenciales, y que `pg_hba.conf` admite a este cliente. |
| Falló la negociación SSL. Prueba otro modo de SSL. | El modo SSL. Hay servidores que lo exigen y otros que no lo ofrecen. |
| Esa base de datos no existe. | El nombre de la base. |
| El servidor no respondió a tiempo. Revisa el servidor, la red y los cortafuegos. | Cortafuegos y rutas entre Gresbase y el servidor. |
| Este servidor no está en la lista de permitidos. Usa uno de los permitidos o pídeselo al administrador (GRESBASE_ALLOWED_DB_HOSTS). | La dirección del servidor queda fuera de `GRESBASE_ALLOWED_DB_HOSTS`. Usa uno de los servidores permitidos o pide a quien gestiona Gresbase que lo añada. |
| No se pudo conectar a PostgreSQL. Revisa los datos y los logs de Gresbase. | Cualquier otra causa. El log tiene el error completo. |
