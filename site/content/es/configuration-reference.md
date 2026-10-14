---
description: Todas las variables, puertos, rutas, endpoints y límites de Gresbase en una sola página.
---

## Variables {#variables}

Todas son opcionales. Los detalles, formatos y ejemplos están en [Variables de entorno](./environment.md). Las marcadas con **Ajustes** también se cambian desde la app; si defines la variable, manda ella y el ajuste queda bloqueado.

| Variable | Por defecto | Efecto |
| --- | --- | --- |
| `DATABASE_URL` | — | Base que se gestiona. Sin ella, conexiones guardadas o el asistente. |
| `GRESBASE_PORT` | `8080` | Puerto en el que escucha Gresbase dentro del contenedor. |
| `GRESBASE_BASE_PATH` | `/` | Sirve bajo un prefijo como `/gresbase`, detrás de un proxy. |
| `GRESBASE_USER` | — | Nombre de la cuenta. Necesita `GRESBASE_PASSWORD`. |
| `GRESBASE_PASSWORD` | — | Contraseña de la cuenta. Necesita `GRESBASE_USER`. |
| `GRESBASE_SESSION_SECRET` | Generado | Firma las cookies de sesión. Mínimo 32 caracteres. Si no la defines, se genera una vez y se guarda cifrada en `gresbase.json`. |
| `GRESBASE_SESSION_TTL` | `12h` | Cuánto dura un inicio de sesión. **Ajustes**. |
| `GRESBASE_TRUSTED_PROXIES` | — | Proxies inversos (IP o CIDR) cuyo `X-Forwarded-For` da la IP del cliente para el límite de intentos. |
| `GRESBASE_ALLOWED_HOSTS` | — | Nombres de `Host` extra aceptados sin login, separados por comas. **Ajustes**. |
| `GRESBASE_READ_ONLY` | `false` | Todas las conexiones rechazan escrituras. **Ajustes**. |
| `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Límite de cada consulta. **Ajustes**. |
| `GRESBASE_IMPORT_TIMEOUT` | `10m` | Límite de una importación CSV. **Ajustes**. |
| `GRESBASE_SQL_MAX_ROWS` | `1000` | Filas por resultado en el editor SQL, de 1 a 100000. **Ajustes**. |
| `GRESBASE_MAX_CONNS` | `10` | Conexiones por pool, de 1 a 1000. **Ajustes**. |
| `GRESBASE_MAX_POOLS` | `20` | Pools abiertos a la vez, de 1 a 1000. **Ajustes**. |
| `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | Un pool sin uso se cierra tras este tiempo. El de `DATABASE_URL` sigue abierto. **Ajustes**. |
| `GRESBASE_DATA_DIR` | `/data` | Carpeta de `gresbase.json`, `secret.key` y `snippets/`. |
| `GRESBASE_SECRET_KEY` | `secret.key` | Clave que cifra los secretos de `gresbase.json`. Mínimo 32 caracteres. |
| `GRESBASE_DB_HOST` | — | Fija el servidor de los formularios de conexión (asistente, modo libre). |
| `GRESBASE_DB_PORT` | — | Fija el puerto de esos formularios. |
| `GRESBASE_DB_NAME` | — | Fija la base de datos de esos formularios. |
| `GRESBASE_DB_USER` | — | Fija el usuario de esos formularios. |
| `GRESBASE_MODE_FREE` | `false` | Modo libre: cada persona entra con sus credenciales de PostgreSQL. |
| `GRESBASE_ALLOWED_DB_HOSTS` | — | Servidores permitidos en modo libre: nombres, IP o CIDR. Vacío permite cualquiera. |
| `GRESBASE_MAX_SESSIONS` | `10` | Sesiones simultáneas en modo libre, de 1 a 1000. |
| `GRESBASE_SETUP_TOKEN` | Aleatorio | Token que pide el asistente desde otras máquinas. Mínimo 16 caracteres. Si no lo defines, se imprime en el log. |
| `GRESBASE_LANG` | `en` | Idioma por defecto de la interfaz: `en` o `es`. **Ajustes**. |
| `GRESBASE_LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error`. |
| `GRESBASE_LOG_FORMAT` | `text` | `text` o `json`. |

Las duraciones llevan unidad: `30s`, `10m`, `12h`. Los cambios en **Ajustes** se aplican al reiniciar, salvo el idioma y el límite de filas, que se aplican al momento.

## Puertos {#ports}

| Puerto | Dónde |
| --- | --- |
| `8080` | Dentro del contenedor (`EXPOSE 8080`). Se cambia con `GRESBASE_PORT`. |
| `{{port}}` | En el anfitrión, en el [Inicio rápido](./quick-start.md), publicado solo en `127.0.0.1`. |

## Rutas {#paths}

| Ruta | Qué es |
| --- | --- |
| `/data` | Directorio de datos, declarado como volumen en la imagen. Lo escribe el usuario `65532`, con el que corre la imagen. |
| `/data/gresbase.json` | Ajustes, conexiones guardadas y cuenta de administrador. Permisos `0600`. |
| `/data/secret.key` | Clave de cifrado, 64 caracteres hexadecimales. No se crea si defines `GRESBASE_SECRET_KEY`. |
| `/data/snippets/` | Consultas guardadas, como ficheros `.sql`. |
| `/licenses/` | `LICENSE`, `NOTICE`, `TRADEMARKS.md` y `THIRD_PARTY_NOTICES.txt`. |
| `/gresbase` | El binario, que también es el punto de entrada de la imagen. |

Cómo copiar `/data` está en [Copias de seguridad](./backups.md).

## Endpoints y comandos {#endpoints}

| Qué | Comportamiento |
| --- | --- |
| `GET /healthz` | `200 {"status":"ok"}`. En modo setup, `200 {"status":"setup"}`. Con `DATABASE_URL`, `503 {"status":"unavailable"}` si esa base no responde en 2 s. Abierto sin login. Bajo `GRESBASE_BASE_PATH`, si lo defines. |
| `gresbase healthcheck` | Consulta el `/healthz` local y sale con `0` o `1`. Solo lee `GRESBASE_PORT` y `GRESBASE_BASE_PATH`. |
| `gresbase version` | Imprime `gresbase <versión>`. También valen `-version` y `--version`. |

La imagen ejecuta la comprobación de salud por su cuenta:

```sh
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 CMD ["/gresbase", "healthcheck"]
```

Para ver la versión de un contenedor en marcha:

```sh
docker compose exec gresbase /gresbase version
```

## Límites {#limits}

| Límite | Valor |
| --- | --- |
| Fichero CSV para importar | 100 MB |
| Filas por página en el grid | 50, 100 o 200; 50 por defecto |
| Filas por resultado en el editor SQL | `GRESBASE_SQL_MAX_ROWS`, 1000 por defecto |
| Texto de una celda del grid | Los primeros 10 KB; el valor completo se carga al pedirlo |
| Consulta guardada | 1 MB |
| Historial del editor SQL | 500 entradas, en cada navegador |
| Intentos fallidos de inicio de sesión | 5 por minuto e IP |
| Conexión a `DATABASE_URL` al arrancar | Reintenta durante 30 s como mucho |
| **Probar conexión** | 10 s |
| Parada | Espera hasta 10 s a las peticiones abiertas |
