---
description: Qué guarda Gresbase en /data, qué vive en otro sitio y cómo mantener ese directorio a salvo y con permiso de escritura.
---

## Qué hay en /data {#contents}

Gresbase guarda su propio estado en un directorio, `/data` por defecto. Se cambia con `GRESBASE_DATA_DIR`. Si no existe, Gresbase lo crea.

| Ruta | Qué contiene |
| --- | --- |
| `gresbase.json` | Los ajustes cambiados desde la app, la cuenta de administrador, el modo elegido en el asistente, las conexiones guardadas y los secretos cifrados. |
| `secret.key` | La clave que cifra los secretos de `gresbase.json`. Se crea en el primer arranque, salvo que definas `GRESBASE_SECRET_KEY`. |
| `snippets/` | Las consultas guardadas, un fichero `.sql` cada una. Las de una sola conexión van en una carpeta llamada `@` más su id; las de los usuarios del modo libre, en `.private/`. |

Dentro de `gresbase.json`:

- La contraseña del administrador solo se guarda como hash argon2id.
- Las contraseñas de las conexiones guardadas y la clave de sesión van cifradas con AES-GCM. Nunca aparecen en claro.
- Los ajustes se guardan tal cual. Ninguno es un secreto.

Gresbase escribe sus ficheros de forma atómica y con permisos `0600`, así que solo su usuario puede leerlos.

## Qué no hay en /data {#not-stored}

- **Tu base de datos.** Gresbase nunca la copia. Haz su copia con tus herramientas de siempre.
- **El historial SQL.** Se queda en tu navegador (IndexedDB).
- **Las preferencias:** tema, idioma elegido, densidad del grid, pestañas abiertas y vistas de tabla. Se quedan en tu navegador (`localStorage`). Mira [Idioma y tema](./preferences.md).
- **Las contraseñas del modo libre.** Viven en la memoria del servidor solo durante la sesión.

Otro navegador, o uno con los datos borrados, empieza con el historial vacío y las preferencias por defecto.

## Monta un volumen {#mount}

Monta un volumen con nombre en `/data`, como en el [inicio rápido](./quick-start.md):

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    volumes:
      - gresbase-data:/data

volumes:
  gresbase-data:
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -v gresbase-data:/data \
  {{image}}
```
:::

La imagen declara `/data` como volumen. Si no montas nada, Docker crea uno anónimo, que pierdes al borrar el contenedor. Gresbase lo detecta y avisa (mira [Cuándo avisa Gresbase](#warnings)).

## Permisos {#permissions}

La imagen corre con el usuario `nonroot`, uid `65532`. Su directorio `/data` ya es de ese usuario, así que un volumen con nombre nuevo funciona tal cual.

Con un bind mount (una carpeta del equipo), dale antes la carpeta a ese uid:

```sh
mkdir -p ./gresbase-data
sudo chown 65532:65532 ./gresbase-data
```

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    volumes:
      - ./gresbase-data:/data
```

## Cuándo avisa Gresbase {#warnings}

Al arrancar, Gresbase mira los montajes de su propio contenedor. Avisa cuando `/data` no conservaría sus ficheros:

| Caso | Se pierde | Log al arrancar |
| --- | --- | --- |
| Sin volumen: el anónimo de Docker | Al borrar el contenedor | `data dir is an anonymous volume: saved queries and settings are lost when the container is removed. Mount a named volume on it` |
| Sin ningún montaje (una imagen sin `VOLUME`) | Al borrar el contenedor | `data dir is inside the container: saved queries and settings are lost when the container is removed. Mount a named volume on it` |
| Un `tmpfs` | En cada reinicio | `data dir is a tmpfs: saved queries and settings are lost on every restart` |
| No se puede escribir | En cada reinicio | `data dir is not writable: saved queries and settings live in memory and are lost on every restart` |

Con un volumen con nombre o una carpeta del host (bind mount) no avisa.

La app dice lo mismo, con el motivo, en **Ajustes** (para el administrador), en las consultas guardadas del editor SQL y en el asistente (**La configuración no es persistente**, con un fragmento de Compose). Por ejemplo: «El directorio de datos es un volumen anónimo: las consultas guardadas y los ajustes se pierden al borrar el contenedor. Monta un volumen con nombre en /data (GRESBASE_DATA_DIR) para conservarlos.»

## Si no se puede escribir en /data {#not-writable}

Gresbase arranca y funciona igual, pero lo guarda todo en memoria:

- Los ajustes, las conexiones guardadas y la cuenta de administrador se pierden al reiniciar.
- Las consultas guardadas van a una carpeta temporal y también se pierden.
- La clave secreta es aleatoria en cada arranque, así que las sesiones se cierran con cada reinicio.

El log y la app avisan como en [Cuándo avisa Gresbase](#warnings): «El directorio de datos no se puede escribir: las consultas guardadas y los ajustes viven en memoria y se pierden en cada reinicio. Monta un volumen con nombre en /data (GRESBASE_DATA_DIR) para conservarlos.»

## La clave secreta {#secret-key}

Gresbase busca la clave en este orden:

1. `GRESBASE_SECRET_KEY`, de 32 caracteres como mínimo. Úsala para sacar la clave del volumen, por ejemplo con un secreto de Docker.
2. `secret.key` en el directorio de datos: 64 caracteres hexadecimales, creados en el primer arranque.

Si `secret.key` existe pero no es válido, Gresbase no arranca y avisa de que el fichero no es una clave válida (64 hex characters).

:::danger
Si pierdes la clave o la cambias, los secretos cifrados ya no se pueden descifrar. Gresbase arranca igual, pero se cierran todas las sesiones y las conexiones guardadas pierden su contraseña. Edita cada conexión y vuelve a escribirla. La cuenta de administrador y los ajustes no se ven afectados.
:::

## Copias de seguridad {#backups}

Copia juntos `gresbase.json`, `secret.key` y `snippets/`. Sin la clave que le corresponde, las contraseñas de una copia de `gresbase.json` no sirven. Si usas `GRESBASE_SECRET_KEY`, guarda su valor con la copia. El paso a paso está en [Copias de seguridad](./backups.md).

## Versiones de gresbase.json {#versions}

`gresbase.json` lleva un número de versión de esquema. Un Gresbase más nuevo actualiza un fichero antiguo al abrirlo. Uno más antiguo rechaza un fichero escrito por uno más nuevo, con un mensaje como `written by a newer Gresbase (schema 2, this one reads up to 1)`. Mira [Actualizar](./upgrading.md).
