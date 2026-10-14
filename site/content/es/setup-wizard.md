---
description: Arranca Gresbase sin DATABASE_URL y configúralo desde el navegador, paso a paso.
---

## Cuándo se abre el asistente {#cuando}

Gresbase arranca en modo configuración cuando se cumple todo esto:

- No hay `DATABASE_URL`.
- No hay conexiones guardadas en `/data/gresbase.json`.
- El asistente no se ha completado nunca.
- `GRESBASE_MODE_FREE` no vale `true`.

En modo configuración, la app solo muestra el asistente. El resto de pantallas espera a que lo termines.

Arráncalo con un Compose sin `DATABASE_URL`:

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    volumes:
      - gresbase-data:/data
    ports:
      - "127.0.0.1:{{port}}:8080"

volumes:
  gresbase-data:
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

:::warning
Monta un volumen en `/data`: el asistente lo guarda todo ahí. Si el directorio de datos no es persistente, avisa con **La configuración no es persistente**, dice por qué (un volumen anónimo, por ejemplo) y la configuración se pierde con el contenedor. Mira [Cuándo avisa Gresbase](./data-volume.md#warnings).
:::

## El token de configuración {#token}

Mientras falta la configuración, cualquiera que llegue al puerto podría hacerla. El token lo impide. Cambia en cada arranque, y hay dos formas de conseguirlo.

**El enlace del log.** Al arrancar, Gresbase escribe una línea `SETUP MODE` con un enlace listo y el token:

```sh
docker compose logs gresbase | grep "SETUP MODE"
```

La línea lleva `path="/setup#token=…"`. Abre esa ruta en la dirección de tu Gresbase, por ejemplo `http://localhost:8080/setup#token=…`, y el asistente rellena el token. El token va detrás de `#`, así que el navegador nunca lo envía al servidor ni a un proxy, y el asistente lo quita de la barra de direcciones.

**Un comando en el contenedor.** Imprime solo el token:

```sh
docker compose exec gresbase /gresbase setup-token
```

El paso **Token de configuración** muestra el mismo comando con el id de tu contenedor (`docker exec <id> /gresbase setup-token`). Solo puede leerlo quien puede ejecutar comandos en el contenedor.

Si prefieres elegir el token tú, define `GRESBASE_SETUP_TOKEN` (mínimo 16 caracteres). En ese caso nunca se escribe en el log, y `setup-token` imprime ese valor.

El asistente solo pide el token cuando la petición no sale de la misma máquina: la conexión tiene que venir de la dirección de loopback y la URL usar `localhost`, `127.0.0.1` o `[::1]`. A través de un puerto publicado por Docker, la conexión suele llegar desde la red de Docker, así que cuenta con el paso **Token de configuración**.

## Recorre el asistente {#pasos}

Abre [http://localhost:{{port}}](http://localhost:{{port}}). El asistente indica en qué punto estás con **Paso 1 de …**.

:::steps
### Bienvenido a Gresbase {#bienvenida}

Elige el **Idioma** y el **Tema**. El idioma que elijas pasa a ser el del servidor, salvo que lo fije `GRESBASE_LANG`.

### Token de configuración {#paso-token}

Pega en **Token** el que viste en el log y pulsa **Siguiente**. Este paso solo aparece cuando hace falta el token.

### ¿Cómo vas a usarlo? {#modo}

Elige una opción:

- **Conexión guardada** (**Recomendado**): una cuenta de administrador y una base que Gresbase recuerda. Luego puedes añadir más conexiones.
- **Modo libre, como Adminer**: cada persona entra con cualquier usuario y contraseña de PostgreSQL. No se guarda nada. Lo tienes en [Modo libre](./free-mode.md).

Con el modo libre, **Guardar y terminar** cierra el asistente aquí.

### Cuenta de administrador {#cuenta}

Escribe un **Usuario** y una **Contraseña** de al menos 8 caracteres, y repítela en **Repite la contraseña**. Con esta cuenta entrarás en Gresbase.

Si están definidas `GRESBASE_USER` y `GRESBASE_PASSWORD`, ellas fijan el administrador y el asistente se salta este paso.

### Conexión a la base de datos {#conexion}

Pega una URL en **URL de conexión** para rellenar los campos, o escribe **Servidor**, **Puerto**, **Base de datos**, **Usuario** y **Contraseña**. Si no los cambias, **Puerto** es 5432 y **SSL** es `prefer`. Marca **Solo lectura** para impedir escrituras en esta conexión.

Pulsa **Probar conexión**. Si va bien, verás **Conectado a PostgreSQL** con la versión y su nivel de soporte. Después pulsa **Guardar y terminar**: Gresbase vuelve a probar la conexión antes de guardarla.

### Todo listo {#listo}

El asistente resume lo que ha guardado. Pulsa **Entrar en Gresbase**. Con una conexión guardada, ya has entrado como administrador.
:::

:::tip
`GRESBASE_DB_HOST`, `GRESBASE_DB_PORT`, `GRESBASE_DB_NAME` y `GRESBASE_DB_USER` fijan esos campos del formulario de conexión. Los campos muestran **Definido por la variable de entorno** y no se pueden cambiar.
:::

## Si falla la prueba de conexión {#falla-la-prueba}

El asistente te dice por qué. Las causas más habituales:

| Mensaje | Qué revisar |
| --- | --- |
| El nombre del servidor no se resuelve. | El nombre, y que Gresbase esté en una red desde la que se llegue a él. |
| No hay nada escuchando en ese servidor y puerto. | Que PostgreSQL esté en marcha y el puerto sea el correcto. |
| PostgreSQL rechazó el usuario o la contraseña. | Las credenciales y el `pg_hba.conf` del servidor. |
| Falló la negociación SSL. | Prueba otro modo de **SSL**. |
| Esa base de datos no existe. | El nombre de la base. |
| El servidor no respondió a tiempo. | El servidor, la red y los cortafuegos. |

PostgreSQL 11 y anteriores se rechazan. Tienes más ayuda en [Solución de problemas](./troubleshooting.md).

## Después del asistente {#despues}

Lo que elegiste queda en `/data/gresbase.json`: la contraseña de la conexión, cifrada, y la del administrador, como hash. El asistente no vuelve a abrirse. Más adelante cambias las cosas en [Ajustes](./settings.md) y en [Conexiones guardadas](./connections.md).
