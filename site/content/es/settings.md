---
description: Cambia los ajustes del servidor desde la app y entiende qué valor manda cuando una variable de entorno define lo mismo.
---

## Abrir la pantalla {#open}

Pulsa **Ajustes** (el icono del engranaje) al pie de la barra lateral.

Todo el mundo ve las preferencias personales y **Acerca de**. Los ajustes del servidor, las conexiones y la cuenta solo los ve el administrador.

:::note
Sin login, la sesión local cuenta como administrador. En modo libre, nadie lo es. Consulta [Inicio de sesión y cuentas](./authentication.md).
:::

## Secciones {#sections}

| Sección | Qué contiene | Quién la ve |
| --- | --- | --- |
| **General** | **Tema**, **Idioma**, **Densidad del grid** y, para el administrador, **Idioma por defecto** | Todos |
| **Conexiones** | Las conexiones guardadas | Administrador |
| **Pools de conexiones** | **Conexiones por pool**, **Pools abiertos**, **Cierre de pools inactivos** | Administrador |
| **Seguridad** | **Cuenta**, el formulario para cambiar la contraseña, **Cerrar sesión**, **Duración de la sesión**, **Hosts permitidos**, **Solo lectura** | Administrador |
| **Editor SQL** | **Timeout por defecto**, **Límite de filas**, **Timeout de importación CSV** | Administrador |
| **Acerca de** | **Versión de Gresbase**, **Versión de PostgreSQL**, enlaces al código fuente y a las licencias | Todos |

El tema, el idioma y la densidad del grid se guardan en tu navegador y solo te afectan a ti. Consulta [Idioma y tema](./preferences.md).

Las conexiones guardadas tienen su propia página: [Conexiones guardadas](./connections.md). La cuenta y la contraseña se explican en [Inicio de sesión y cuentas](./authentication.md#change-password).

## Ajustes del servidor {#server-settings}

Cada ajuste del servidor corresponde a una variable de entorno. Lo que cambies en la app se guarda en `gresbase.json`, dentro del volumen de datos.

| Ajuste | Variable | Por defecto | Se aplica |
| --- | --- | --- | --- |
| **Idioma por defecto** | `GRESBASE_LANG` | `en` | Al momento |
| **Duración de la sesión** | `GRESBASE_SESSION_TTL` | `12h` | Al reiniciar |
| **Hosts permitidos** | `GRESBASE_ALLOWED_HOSTS` | vacío | Al reiniciar |
| **Solo lectura** | `GRESBASE_READ_ONLY` | `false` | Al reiniciar |
| **Timeout por defecto** | `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Al reiniciar |
| **Límite de filas** | `GRESBASE_SQL_MAX_ROWS` | `1000` | Al momento |
| **Timeout de importación CSV** | `GRESBASE_IMPORT_TIMEOUT` | `10m` | Al reiniciar |
| **Conexiones por pool** | `GRESBASE_MAX_CONNS` | `10` | Al reiniciar |
| **Pools abiertos** | `GRESBASE_MAX_POOLS` | `20` | Al reiniciar |
| **Cierre de pools inactivos** | `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | Al reiniciar |

Los valores siguen las mismas reglas que las variables. Las duraciones se escriben como `30s`, `10m` o `12h`. **Límite de filas** admite de 1 a 100000. Si un valor no es válido, verás un error y no se guarda nada.

Los campos de texto y número tienen un botón **Guardar**. **Idioma por defecto** y **Solo lectura** se guardan en cuanto eliges un valor. Si guardas un campo vacío, el ajuste vuelve a su valor por defecto.

Cuando un cambio solo se aplica al reiniciar, el ajuste muestra la etiqueta **Se aplica al reiniciar** hasta que reinicies Gresbase.

Lo demás solo se configura con variables de entorno: `DATABASE_URL`, el puerto, la ruta base, el directorio de datos, las claves y los logs. Consulta [Variables de entorno](./environment.md).

## Qué valor manda {#precedence}

Gresbase lee cada ajuste de tres sitios, en este orden:

1. La variable de entorno, si está definida y no está vacía.
2. El valor guardado desde la app en `gresbase.json`.
3. El valor por defecto.

### Ajustes bloqueados por el entorno {#locked}

Si una variable de entorno define el valor, el campo muestra un candado y el texto *Definido por variable de entorno* seguido del nombre de la variable. El campo queda desactivado.

La API rechaza los cambios en un ajuste bloqueado con un `409` y el código `locked_by_env`: *Este ajuste lo define una variable de entorno y no se puede cambiar aquí.*

Para editarlo desde la app, quita la variable del Compose y vuelve a crear el contenedor.

## Sin volumen de datos {#not-persistent}

Si `/data` no conservaría los ajustes, la pantalla dice por qué. Por ejemplo: *El directorio de datos no se puede escribir: las consultas guardadas y los ajustes viven en memoria y se pierden en cada reinicio. Monta un volumen con nombre en /data (GRESBASE_DATA_DIR) para conservarlos.* Mira [Cuándo avisa Gresbase](./data-volume.md#warnings).

Consulta [El volumen de datos](./data-volume.md).
