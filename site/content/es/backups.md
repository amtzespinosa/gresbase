---
description: Haz copia de lo que Gresbase guarda en /data y restáurala, para que perder el volumen no te cueste las conexiones ni las consultas guardadas.
---

## Qué copiar {#what}

Gresbase guarda su propio estado en `/data` (o en `GRESBASE_DATA_DIR`, si lo defines):

| Ruta | Qué contiene |
| --- | --- |
| `gresbase.json` | Ajustes cambiados desde la app, conexiones guardadas, la cuenta de administrador y el modo elegido en el asistente. Las contraseñas de las conexiones y el secreto de sesión van cifrados. |
| `secret.key` | La clave que cifra esos secretos. Se crea en el primer arranque si no defines `GRESBASE_SECRET_KEY`. |
| `snippets/` | Las consultas guardadas, como ficheros `.sql`. Las de una conexión concreta van en una carpeta `@<id>/`. |

Copia los tres juntos. Un `gresbase.json` sin su clave pierde los secretos cifrados.

:::note
Esto no copia tus bases de datos. Son de tu servidor PostgreSQL: para ellas usa `pg_dump`.
:::

El historial del editor SQL y las preferencias de la interfaz se guardan en cada navegador, no en `/data`. La copia no los incluye.

## Copiar un volumen de Docker {#backup}

La imagen de Gresbase no tiene shell ni `tar`, así que la copia la hace un contenedor de usar y tirar. Para Gresbase antes, para que los ficheros no cambien a mitad de copia.

:::steps
### Busca el nombre del volumen {#volume-name}

Compose antepone el nombre del proyecto al volumen, por ejemplo `miproyecto_gresbase-data`. Para verlos:

```sh
docker volume ls
```

### Para Gresbase {#stop}

```sh
docker compose stop gresbase
```

### Copia el volumen a un fichero {#copy}

Cambia `gresbase-data` por el nombre que encontraste. El archivo queda en la carpeta actual.

```sh
docker run --rm \
  -v gresbase-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/gresbase-data.tar.gz -C /data .
```

### Vuelve a arrancar Gresbase {#start}

```sh
docker compose start gresbase
```
:::

Si montas una carpeta del anfitrión en lugar de un volumen (`./data:/data`), copia esa carpeta.

:::warning
El archivo incluye `secret.key`, que descifra las contraseñas guardadas. Guárdalo con el mismo cuidado que las contraseñas.
:::

## Restaurar {#restore}

:::steps
### Para Gresbase {#restore-stop}

```sh
docker compose stop gresbase
```

### Descomprime el archivo en el volumen {#unpack}

Primero vacía el volumen y después extrae la copia.

```sh
docker run --rm \
  -v gresbase-data:/data \
  -v "$PWD":/backup \
  alpine sh -c "rm -rf /data/* /data/.[!.]* ; tar xzf /backup/gresbase-data.tar.gz -C /data"
```

La imagen corre con el usuario `65532`, que tiene que poder escribir en `/data`. El archivo conserva propietarios y permisos: los ficheros extraídos, y el propio `/data`, siguen siendo de `65532`, también en un volumen nuevo y vacío. No hace falta ningún `chown`.

### Arranca Gresbase {#restore-start}

```sh
docker compose start gresbase
```
:::

Si la copia viene de un Gresbase más nuevo, uno más antiguo no arranca con ella. Lo explica [Actualizar](./upgrading.md#volume).

## La clave de cifrado {#secret-key}

Los secretos de `gresbase.json` van sellados con una clave. Gresbase la toma de uno de estos dos sitios:

- **`GRESBASE_SECRET_KEY`**, si está definida. Mínimo 32 caracteres. En ese caso no lee ni crea `secret.key`.
- **`secret.key`** en el directorio de datos, si no. Contiene 64 caracteres hexadecimales y se crea en el primer arranque.

Si la clave cambia o desaparece, Gresbase arranca igual, pero no puede descifrar lo que selló la anterior:

- Se cierran todas las sesiones, salvo que tengas `GRESBASE_SESSION_SECRET` definida. Un secreto de sesión nuevo sustituye al anterior.
- Las conexiones guardadas pierden su contraseña. Edita cada una y vuelve a escribirla. Lo tienes en [Conexiones guardadas](./connections.md).
- La cuenta de administrador sigue funcionando. Su contraseña se guarda como hash, no cifrada.

:::tip
Si usas `GRESBASE_SECRET_KEY`, guárdala junto a tus otros secretos. Sin ella, una copia de `/data` no puede descifrar nada.
:::

Un `secret.key` que no tenga 64 caracteres hexadecimales impide arrancar, con el mensaje `/data/secret.key is not a valid key (64 hex characters)`.
