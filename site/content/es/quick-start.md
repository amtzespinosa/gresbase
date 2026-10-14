---
description: Arranca Gresbase con Docker Compose, apúntalo a tu base de datos PostgreSQL y ábrelo en el navegador.
---

## Antes de empezar {#antes-de-empezar}

- Docker con Compose v2 (`docker compose version` debe responder).
- Una base de datos PostgreSQL a la que llegue el contenedor y un usuario para conectarte. PostgreSQL 12 o posterior (mira las [versiones compatibles](./introduction.md)).

:::tip
Para echar un vistazo antes, arranca la demo con una base de ejemplo. Solo necesita Docker:

```sh
curl -fsSLO https://raw.githubusercontent.com/amtzespinosa/gresbase/main/deploy/docker-compose.demo.yml
docker compose -f docker-compose.demo.yml up -d
```

Después abre `http://localhost:8080`. `docker compose -f docker-compose.demo.yml down -v` la borra.
:::

:::note
Si PostgreSQL corre en la misma máquina pero fuera de Docker, `localhost` dentro del contenedor no es tu máquina. Usa `host.docker.internal` en Docker Desktop o la IP del equipo.
:::

## Instalar y arrancar {#instalar}

:::steps
### Crea el fichero de Compose {#crea-el-fichero}

Guárdalo en una carpeta vacía como `docker-compose.yml`. Si no usas Compose, la pestaña *docker run* hace lo mismo con un solo comando.

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://USER:PASSWORD@HOST:5432/DBNAME
      GRESBASE_READ_ONLY: "false"
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
  -e DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
  -e GRESBASE_READ_ONLY=false \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

Dentro del contenedor, Gresbase escucha en el puerto 8080. La línea `ports` lo publica como {{port}} y solo en tu máquina.

### Apunta a tu base de datos {#apunta-a-tu-base}

Sustituye `USER`, `PASSWORD`, `HOST` y `DBNAME` en `DATABASE_URL`. Tiene que empezar por `postgres://` o `postgresql://`. Si la contraseña lleva caracteres como `@`, `:` o `/`, codifícalos para URL (`@` pasa a ser `%40`).

Añade `?sslmode=disable` al final si tu servidor no usa SSL, por ejemplo un contenedor `postgres` en la misma red de Compose. Tienes más opciones en [Conectar con PostgreSQL](./connecting.md).

### Arráncalo {#arrancalo}

```sh title="Terminal"
docker compose up -d
docker compose logs -f gresbase
```

Cuando está listo, el log muestra `starting gresbase`. Si la base aún no responde, Gresbase reintenta durante 30 segundos como mucho y luego se cierra explicando el motivo. Una contraseña incorrecta, una base que no existe o un fallo de SSL lo paran en el acto. Con `restart: unless-stopped`, Docker lo vuelve a arrancar.

### Abre Gresbase {#abrelo}

Entra en [http://localhost:{{port}}](http://localhost:{{port}}). La tarjeta de conexión, abajo en la barra lateral, muestra un punto verde cuando Gresbase llega a tu base de datos. Si sale rojo, verás **No se puede conectar con la base**.
:::

## Comprueba que está sano {#comprueba}

La imagen trae un healthcheck que llama a `/healthz` cada 10 segundos. Tras el primer arranque, `docker compose ps` debería mostrar el contenedor como `healthy`.

```sh
docker compose ps
```

## Quién puede abrirlo {#acceso}

Este Compose no define ninguna cuenta, así que no hay login. En ese caso Gresbase solo responde a peticiones dirigidas a `localhost`, `127.0.0.1` o `[::1]`, y la barra lateral muestra **Solo este equipo**.

Para abrirlo a otras personas, define una cuenta con `GRESBASE_USER` y `GRESBASE_PASSWORD` y pon HTTPS delante. Lo explican [Inicio de sesión y cuentas](./authentication.md) y [Seguridad y red](./security.md).

:::warning
No publiques el puerto en todas las interfaces (`0.0.0.0`) sin una cuenta y sin HTTPS delante. Las contraseñas y los datos viajarían en claro.
:::

## Explorar sin cambiar nada {#solo-lectura}

:::tip
Pon `GRESBASE_READ_ONLY` a `"true"` para explorar una base de producción sin riesgo. Gresbase rechaza cualquier escritura y sus sesiones en la base también son de solo lectura. En la barra lateral aparece el distintivo **Solo lectura**. Más en [Modo solo lectura](./read-only.md).
:::

## Conserva el volumen de datos {#volumen}

Gresbase guarda sus propios datos en `/data`: `gresbase.json` con los ajustes y las conexiones guardadas, `secret.key`, que cifra los secretos que hay dentro, y tus consultas guardadas. Los datos de tu PostgreSQL nunca van ahí. Los detalles están en [El volumen de datos](./data-volume.md).

:::warning
Si borras el volumen (`docker compose down -v`), pierdes esa configuración y tus consultas guardadas, y se cierran todas las sesiones.
:::

## La configuración de un vistazo {#configuracion}

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `DATABASE_URL` | — | Cadena de conexión de la base que vas a gestionar. Sin ella se abre el [asistente de configuración](./setup-wizard.md). |
| `GRESBASE_READ_ONLY` | `false` | Bloquea cualquier escritura en la base. |
| `GRESBASE_USER` / `GRESBASE_PASSWORD` | — | Cuenta para iniciar sesión. Se definen las dos o ninguna. |
| `GRESBASE_SECRET_KEY` | Se genera en `/data/secret.key` | Cifra los secretos de `gresbase.json`. Mínimo 32 caracteres. |

Todas las opciones están en [Variables de entorno](./environment.md).

## Siguientes pasos {#siguientes-pasos}

- Haz el [recorrido rápido](./tour.md) por las pantallas principales.
- Escribe tu primera consulta en el [editor SQL](./sql-editor.md) y ejecútala con <kbd>⌘</kbd> <kbd>↵</kbd> (<kbd>Ctrl</kbd> <kbd>↵</kbd> en Windows y Linux).
- Antes de abrirlo a tu red, lee [Seguridad y red](./security.md).
