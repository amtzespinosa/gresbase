---
description: Deja que cada persona entre con su propio usuario y contraseña de PostgreSQL, como en Adminer, sin guardar nada en el servidor.
---

## Cómo funciona {#how-it-works}

En modo libre, las credenciales de PostgreSQL son el login. No hay cuentas de Gresbase ni conexiones guardadas.

- Cada persona rellena el formulario de conexión y pulsa **Conectar**.
- Gresbase comprueba las credenciales conectándose al servidor.
- Cada sesión tiene su propia conexión. La contraseña solo vive en la memoria del servidor, nunca en disco.
- Al terminar la sesión o desconectarse, esa conexión se cierra y la contraseña sale de la memoria.

Reiniciar Gresbase también cierra todas las sesiones del modo libre, porque las conexiones solo existen en memoria.

## Activarlo {#turn-on}

Hay dos formas:

- Pon `GRESBASE_MODE_FREE` a `true`.
- Elige **Modo libre, como Adminer** en el [asistente de configuración](./setup-wizard.md).

`GRESBASE_MODE_FREE` no se puede combinar con `DATABASE_URL` ni con `GRESBASE_USER`. Si los defines juntos, Gresbase no arranca.

Si elegiste el modo libre en el asistente y después defines `DATABASE_URL`, el modo libre se desactiva.

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

## Entrar {#sign-in}

La pantalla se llama **Conectar a PostgreSQL**. Pide **Servidor**, **Puerto**, **Base de datos**, **Usuario**, **Contraseña** y **SSL**. También puedes pegar una **URL de conexión** para rellenar los campos.

El puerto por defecto es `5432` y el SSL, `prefer`. Pulsa **Conectar**.

En la barra lateral, el botón **Opciones de la sesión** (tres puntos) de la tarjeta de conexión abre un menú. Cada opción pide confirmación antes:

- **Cambiar de conexión** vuelve a la pantalla de conexión. Al conectar otra vez, la nueva conexión sustituye a la actual.
- **Desconectar** cierra la sesión.

### Conexiones recientes {#recent}

La pantalla de conexión muestra tus cinco últimas conexiones en **Recientes**. Se guardan en tu navegador (`localStorage`), nunca en el servidor. La contraseña no se guarda nunca.

## Qué puede hacer un usuario del modo libre {#role}

Una sesión del modo libre tiene el rol `user`. Puede explorar y editar datos, y ejecutar SQL, en su propia conexión. Lo demás lo deciden los permisos de Postgres.

No puede abrir los ajustes del servidor ni las conexiones guardadas en la pantalla de Ajustes.

Tiene sus propias consultas guardadas. Cada usuario, servidor, puerto y base de datos (`usuario@servidor:puerto/base`) tiene una carpeta privada que no ve ningún otro usuario, ni siquiera el administrador. Las consultas siguen ahí la próxima vez que entres con los mismos datos. Consulta [Consultas guardadas](./sql-editor.md#saved).

La pantalla de Ajustes solo muestra las preferencias personales (tema, idioma, densidad del grid) y la sección **Acerca de**.

`GRESBASE_READ_ONLY` se sigue aplicando a todas las conexiones del modo libre. Consulta [Modo solo lectura](./read-only.md).

## Limitar los servidores {#allowed-db-hosts}

Por defecto, quien use el modo libre puede conectarse a cualquier servidor al que llegue Gresbase. Dos variables lo acotan.

### Fijar el servidor {#fix-server}

`GRESBASE_DB_HOST` fija el servidor del formulario, y `GRESBASE_DB_PORT`, su puerto. `GRESBASE_DB_NAME` fija la base de datos y `GRESBASE_DB_USER`, el usuario. Esos campos muestran *Definido por la variable de entorno* seguido del nombre de la variable, y no se pueden cambiar. Gresbase también los aplica en el servidor, mande lo que mande el formulario.

Con servidor, base de datos y usuario fijados, el formulario solo pide la contraseña: no aparece el campo de URL de conexión ni las conexiones recientes, y el cursor empieza en **Contraseña**.

```yaml title="docker-compose.yml"
      GRESBASE_MODE_FREE: "true"
      GRESBASE_DB_HOST: db
      GRESBASE_DB_NAME: app
      GRESBASE_DB_USER: app_reader
```

### Permitir una lista de servidores {#allow-list}

`GRESBASE_ALLOWED_DB_HOSTS` admite una lista separada por comas de nombres de host, direcciones IP o rangos CIDR.

```yaml title="docker-compose.yml"
      GRESBASE_ALLOWED_DB_HOSTS: db,pg.internal,10.0.0.0/8
```

- Un nombre de host permite las direcciones a las que resuelve.
- Una IP o un CIDR permiten los servidores cuya dirección cae dentro.
- Cualquier otro servidor recibe un `403` con el código `db_host_not_allowed`: *Este servidor no está permitido. Pregunta al administrador (GRESBASE_ALLOWED_DB_HOSTS).*

Gresbase fija la respuesta DNS que comprobó. Si el registro DNS cambia después, la conexión no puede acabar en otro servidor.

:::tip
Sin esta lista, el modo libre sirve para tantear cualquier host y puerto al que llegue el contenedor. En un servidor compartido, defínela.
:::

## Limitar las sesiones {#max-sessions}

`GRESBASE_MAX_SESSIONS` limita cuántas sesiones del modo libre hay a la vez. Por defecto son `10`, y admite de 1 a 1000.

Al llegar al límite, las nuevas entradas reciben un `503` con el código `too_many_sessions`: *Hay demasiadas personas conectadas ahora mismo. Inténtalo dentro de un rato.* Cambiar de conexión dentro de una sesión abierta no cuenta como una nueva.

Cada sesión abre un pool de hasta 3 conexiones a su base.

## Sesiones y seguridad {#security}

- Las sesiones duran `GRESBASE_SESSION_TTL`, igual que en los otros modos. Consulta [Inicio de sesión y cuentas](./authentication.md#sessions).
- Los intentos comparten el límite de 5 por minuto por IP de cliente. Consulta [Demasiados intentos](./authentication.md#rate-limit).
- En modo libre no se comprueba el `Host`, porque la contraseña de Postgres es el login.

:::warning
La contraseña de Postgres viaja en cada entrada. Pon Gresbase detrás de HTTPS antes de abrirlo a una red. Consulta [Seguridad y red](./security.md).
:::
