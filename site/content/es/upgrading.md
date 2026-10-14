---
description: Cambia a otra versión de Gresbase sin perder los ajustes, las conexiones guardadas ni las consultas guardadas.
---

## Antes de empezar {#before-you-start}

Todo lo que guarda Gresbase está en el volumen `/data`. Una actualización nunca toca tus bases de PostgreSQL.

Antes, haz una copia de `/data`. Al actualizar, `gresbase.json` puede reescribirse en un formato que una versión anterior no sabe leer. Lo tienes en [Copias de seguridad](./backups.md).

## Actualizar el contenedor {#upgrade}

:::steps
### Elige la versión {#pick}

Cada versión publica la imagen con estas etiquetas (`.goreleaser.yaml`). Para la versión 0.3.0:

| Etiqueta | A qué apunta |
| --- | --- |
| `0.3.0` | Exactamente esa versión. No cambia nunca. |
| `0.3` | La 0.3.x más reciente: solo correcciones. |
| `latest` | La versión más reciente de todas, incluida una futura 0.4 o 1.0. |

Antes de la 1.0, una versión menor nueva (0.5) puede cambiar cosas, así que en producción fija la versión menor en la línea `image:`: `{{imageName}}:0.4`. A partir de la 1.0, cada versión tendrá además una etiqueta mayor (`1`): la 1.x más reciente, nunca una versión mayor nueva. El inicio rápido usa `latest`.

### Descarga y recrea {#recreate}

:::tabs
@tab docker-compose.yml {#compose}
```sh
docker compose pull gresbase
docker compose up -d gresbase
```
@tab docker run {#run}
```sh
docker pull {{image}}
docker stop gresbase
docker rm gresbase
docker run -d --name gresbase \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```
:::

Con `docker run`, repite las mismas variables `-e` que usabas. Borrar el contenedor no borra el volumen `gresbase-data`.

### Comprueba la versión {#check}

Ejecuta `docker compose logs gresbase`. La línea `starting gresbase` lleva `version=…`. En la app, **Ajustes** › **Acerca de** muestra la **Versión de Gresbase**.
:::

:::warning
No uses `docker compose down -v` para actualizar. La opción `-v` borra el volumen y, con él, las conexiones guardadas, la cuenta de administrador y las consultas guardadas.
:::

## El volumen entre versiones {#volume}

`gresbase.json` tiene un campo `version`: el esquema del fichero. Esta versión de Gresbase escribe el esquema `1`.

- **Fichero más antiguo:** Gresbase lo migra al abrirlo y lo guarda en el formato nuevo. Un fichero sin `version` (esquema 0) era una lista plana de ajustes y pasa al esquema 1.
- **Fichero más nuevo:** Gresbase no arranca. El log dice `invalid configuration:` y después `/data/gresbase.json: written by a newer Gresbase (schema 2, this one reads up to 1)`, con los números que encuentre.

Para volver a una versión anterior, restaura la copia de `/data` que hiciste antes de actualizar.

Hoy `gresbase.json` usa la versión 1 del formato. `secret.key` (una clave en hexadecimal) y `snippets/` (ficheros `.sql` normales) no tienen versión de formato. Las notas de cada versión dirán si cambia algún formato y si tienes que hacer algo.

## Novedades {#release-notes}

Los cambios de cada versión están en [Cambios](./changelog.md). Léelos antes de actualizar: ahí aparecen los ajustes nuevos y lo que cambia de comportamiento.
