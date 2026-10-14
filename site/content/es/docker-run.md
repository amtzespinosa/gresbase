---
description: Arranca Gresbase con docker run, sin Compose, y aprende a actualizarlo y pararlo.
---

## Arranca el contenedor {#arranca}

Este comando hace lo mismo que el Compose del [inicio rápido](./quick-start.md):

```sh
docker run -d --name gresbase \
  -e DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
  -e GRESBASE_READ_ONLY=false \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```

| Opción | Para qué |
| --- | --- |
| `-e DATABASE_URL=…` | La base que vas a gestionar. Si no la pones, se abre el [asistente de configuración](./setup-wizard.md). |
| `-p 127.0.0.1:{{port}}:8080` | Publica el puerto 8080 del contenedor solo en tu máquina. |
| `-v gresbase-data:/data` | Conserva ajustes, conexiones guardadas y consultas guardadas entre actualizaciones. |
| `--restart unless-stopped` | Lo vuelve a arrancar tras un fallo o un reinicio, salvo que lo pararas tú. |

Después abre [http://localhost:{{port}}](http://localhost:{{port}}).

:::warning
Sin `-v`, Docker crea para `/data` un volumen anónimo ligado a este contenedor. El siguiente contenedor, por ejemplo tras actualizar, empieza con uno vacío y parece que has perdido los ajustes y las consultas guardadas. Gresbase lo avisa en el log y en la app.
:::

## Llegar a una base en otro contenedor {#misma-red}

Si PostgreSQL corre en un contenedor, mete los dos en la misma red de Docker y usa el nombre del contenedor como servidor:

```sh
docker network create gresbase-net
docker network connect gresbase-net my-postgres
docker run -d --name gresbase --network gresbase-net \
  -e DATABASE_URL=postgres://USER:PASSWORD@my-postgres:5432/DBNAME?sslmode=disable \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```

Cambia `my-postgres` por el nombre de tu contenedor de base de datos.

## Compruébalo {#compruebalo}

```sh
docker logs -f gresbase
docker ps --filter name=gresbase
```

Cuando se conecta, el log muestra `starting gresbase`. `docker ps` lo marca `healthy` cuando pasa el healthcheck que trae la imagen.

Para ver la versión:

```sh
docker exec gresbase /gresbase version
```

## Actualizar {#actualizar}

Tus ajustes viven en el volumen `gresbase-data`, así que puedes sustituir el contenedor sin miedo.

:::steps
### Descarga la imagen nueva {#descarga}

```sh
docker pull {{image}}
```

### Quita el contenedor viejo {#quita}

```sh
docker stop gresbase
docker rm gresbase
```

### Arráncalo otra vez {#arranca-otra-vez}

Lanza el mismo `docker run` de antes, con el mismo volumen.
:::

Antes de saltar de versión, lee [Actualizar](./upgrading.md).

## Parar y borrar {#parar}

```sh
docker stop gresbase     # lo para; docker start gresbase lo recupera
docker rm gresbase       # borra el contenedor y conserva el volumen
docker volume rm gresbase-data   # borra también ajustes y consultas guardadas
```

:::warning
`docker volume rm gresbase-data` borra los ajustes de Gresbase, las conexiones guardadas, la cuenta de administrador y tus consultas guardadas. Los datos de tu PostgreSQL no se tocan.
:::
