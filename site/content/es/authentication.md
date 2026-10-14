---
description: Decide quién puede abrir Gresbase, cómo funcionan las sesiones y cómo cambiar la contraseña del administrador.
---

## Tres formas de entrar {#regimes}

Gresbase tiene tres regímenes de acceso. El que se aplica depende de tu configuración.

| Régimen | Cuándo | Quién entra |
| --- | --- | --- |
| Sin login | No hay cuenta en el entorno ni en `gresbase.json`, y el modo libre está apagado | Peticiones con un `Host` local o incluido en `GRESBASE_ALLOWED_HOSTS` |
| Cuenta de administrador | `GRESBASE_USER` y `GRESBASE_PASSWORD`, o la cuenta creada en el asistente | Quien conozca ese usuario y contraseña |
| Modo libre | `GRESBASE_MODE_FREE`, o elegido en el asistente | Cualquiera con credenciales válidas de PostgreSQL |

El modo libre tiene su propia página: [Modo libre](./free-mode.md).

## Sin login {#no-login}

Sin cuenta, Gresbase solo responde a peticiones cuya cabecera `Host` sea `localhost`, `127.0.0.1` o `[::1]`. Es lo que pasa en el inicio rápido, que publica el puerto en `127.0.0.1`.

Cualquier otro `Host` recibe un `403`. El navegador muestra una página **Acceso bloqueado** que explica qué configurar. La API responde con el código de error `forbidden`. `/healthz` queda abierto para que los healthchecks de contenedores funcionen desde cualquier dirección.

Para aceptar otro nombre sin login, añádelo a `GRESBASE_ALLOWED_HOSTS`, separado por comas. Cada entrada vale para el nombre del host o para el `host:puerto` exacto.

```yaml title="docker-compose.yml"
    environment:
      GRESBASE_ALLOWED_HOSTS: gresbase.lan,192.168.1.20
```

:::warning
Sin login, cualquiera que llegue por un host permitido tiene acceso completo de administrador. Úsalo solo en una máquina o red que controles. La comprobación del `Host` también frena ataques de DNS rebinding desde páginas que visites.
:::

Si arranca sin cuenta, el log muestra un aviso `LOGIN DISABLED` con los hosts aceptados.

## Cuenta de administrador {#account}

Hay un único administrador, y puede venir de dos sitios.

- **Variables de entorno.** Define `GRESBASE_USER` y `GRESBASE_PASSWORD`. Van las dos o ninguna: si falta una, Gresbase no arranca.
- **Asistente de configuración.** El asistente puede crear la cuenta. Gresbase la guarda en `gresbase.json` como hash argon2id, nunca la contraseña en sí.

Si existen las dos, mandan las variables de entorno. Las contraseñas creadas desde la app deben tener entre 8 y 256 caracteres.

Con una cuenta activa, Gresbase acepta cualquier `Host`. La pantalla de acceso pide **Usuario** y **Contraseña**, y se entra con **Entrar**.

## Sesiones {#sessions}

Una sesión es una cookie firmada llamada `gresbase_session`.

- Es `HttpOnly` y `SameSite=Strict`.
- Es `Secure` cuando la petición llega por HTTPS, o con la cabecera `X-Forwarded-Proto: https` de un proxy. El HTTP normal en `localhost` sigue funcionando.
- Su ruta es la ruta base de la app (`/` por defecto, ver `GRESBASE_BASE_PATH`).

`GRESBASE_SESSION_TTL` fija cuánto dura una sesión. Por defecto son `12h`. Acepta duraciones de Go como `30m`, `8h` o `168h`.

Para salir, usa el botón **Cerrar sesión** de la barra lateral, de la pantalla de Ajustes o de la paleta de comandos. Gresbase pregunta antes. Si el grid tiene cambios sin guardar, el diálogo dice cuántos se perderán, y una transacción SQL abierta se revierte.

### El secreto de sesión {#session-secret}

`GRESBASE_SESSION_SECRET` firma las cookies. Necesita al menos 32 caracteres.

Si lo dejas vacío, Gresbase genera uno en el primer arranque y lo guarda sellado en `gresbase.json`. Así las sesiones sobreviven a los reinicios, siempre que `/data` se pueda escribir.

Las sesiones se cierran para todos cuando:

- el directorio de datos no se puede escribir, porque el secreto generado solo dura hasta el siguiente reinicio;
- cambias `GRESBASE_SESSION_SECRET`;
- cambias `GRESBASE_SECRET_KEY`, porque el secreto guardado ya no se puede descifrar y se sustituye por otro.

## Demasiados intentos {#rate-limit}

Gresbase permite 5 intentos fallidos por minuto por cada IP de cliente. Después responde `429` con la cabecera `Retry-After`, y la pantalla dice: *Demasiados intentos. Espera un minuto y vuelve a probar.*

Solo cuentan los fallos: usuario o contraseña incorrectos, contraseña actual incorrecta, una conexión del modo libre que falla o un token de setup incorrecto. Los intentos buenos no cuentan. El mismo contador cubre el login, el cambio de contraseña, la entrada en modo libre y el asistente.

:::note
La IP es la del otro extremo de la conexión. Por defecto Gresbase ignora `X-Forwarded-For`, así que nadie puede falsearla para saltarse el límite. Detrás de un proxy inverso, pon el proxy en `GRESBASE_TRUSTED_PROXIES` (IP o CIDR): en las peticiones que llegan de él, Gresbase toma el cliente de `X-Forwarded-For`, leído desde la derecha y saltando los proxies de confianza. Así cada cliente tiene su propio límite. Sin esa variable, todos los clientes comparten la IP del proxy y los mismos 5 intentos fallidos.
:::

## Cambiar la contraseña {#change-password}

Sirve para la cuenta creada en el asistente.

:::steps
### Abre Ajustes

Pulsa **Ajustes** (el icono del engranaje) al pie de la barra lateral. La sección **Seguridad** muestra la **Cuenta** con la que has entrado.

### Rellena el formulario

Escribe la **Contraseña actual**, la **Contraseña nueva** (al menos 8 caracteres) y **Repite la contraseña**.

### Guarda

Pulsa **Cambiar contraseña**. Gresbase lo confirma con *Contraseña cambiada. Las demás sesiones se han cerrado.*
:::

Tu sesión sigue abierta. Las demás, en cualquier dispositivo, tendrán que volver a entrar.

Si la cuenta viene de `GRESBASE_USER` y `GRESBASE_PASSWORD`, el formulario no aparece. La pantalla indica que el administrador lo definen esas variables. Cambia las variables y reinicia Gresbase: las sesiones abiertas con la contraseña anterior dejan de valer.

## Páginas relacionadas {#related}

- [Modo libre](./free-mode.md)
- [Seguridad y red](./security.md)
- [Asistente de configuración](./setup-wizard.md)
- [Variables de entorno](./environment.md)
