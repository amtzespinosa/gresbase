---
description: Ten varias bases en un mismo Gresbase, distínguelas por color y cambia de una a otra en cada pestaña del navegador.
---

## Qué es una conexión guardada {#what}

Una conexión guardada es una base que Gresbase recuerda: servidor, puerto, base, usuario, contraseña y modo SSL. Puedes tener varias, además de la de `DATABASE_URL`.

Solo el administrador las gestiona, en **Ajustes**, sección **Conexiones**. El modo libre no tiene conexiones guardadas: cada persona entra con sus credenciales (mira [Modo libre](./free-mode.md)).

## Añadir una conexión {#add}

:::steps
### Abre el formulario

Ve a **Ajustes** y pulsa **Añadir conexión** en la sección **Conexiones**. Se abre el diálogo **Nueva conexión**.

### Ponle nombre y color

Escribe un **Nombre**, como «Producción» o «Pruebas». Si lo dejas vacío, Gresbase usa el nombre de la base. Elige un **Color de etiqueta**.

### Rellena los datos de la base

Escribe **Servidor**, **Puerto**, **Base de datos**, **Usuario** y **Contraseña**, y elige el modo de **SSL**. También puedes pegar una URL en **URL de conexión** para rellenar los campos. Marca **Solo lectura** si esta conexión no debe escribir nunca.

### Prueba y guarda

Pulsa **Probar conexión**. Si funciona, verás «Conectado a PostgreSQL» y la versión. Después pulsa **Guardar conexión**.
:::

Si la prueba falla, el mensaje dice por qué. Los motivos están en [Conectar con PostgreSQL](./connecting.md#errors).

## Colores de etiqueta {#colors}

Cada conexión tiene un color de etiqueta: **Gris**, **Rojo**, **Naranja**, **Verde**, **Azul** o **Morado**. El gris es el de por defecto.

El color aparece como una franja en la tarjeta de conexión de la barra lateral, y como un punto en el selector y en Ajustes. Sirve para no confundir producción con pruebas. Por ejemplo, rojo para producción y verde para tu copia local.

## Cambiar de conexión {#switch}

Cuando hay más de una conexión, la tarjeta de conexión de la barra lateral muestra el botón **Cambiar de conexión**. Lista todas las conexiones con su color, su estado y su versión de PostgreSQL.

- Cada pestaña del navegador trabaja con su propia conexión. La dirección la lleva (`/c/<id>/…`), así que dos pestañas pueden mostrar dos bases.
- En Ajustes, la conexión de la pestaña actual lleva la etiqueta **Esta pestaña**.
- La [paleta de comandos](./command-palette.md) tiene un grupo **Conexiones** con **Cambiar a** seguido de cada nombre.

Si abres Gresbase sin elegir, usa la conexión de `DATABASE_URL` o, si no existe, la primera guardada.

## Editar o eliminar {#edit}

Cada conexión guardada tiene dos botones en Ajustes: **Editar** y **Eliminar**, seguidos de su nombre.

- Al editar, deja **Contraseña** vacía para mantener la actual. Gresbase nunca devuelve al navegador una contraseña guardada.
- Al guardar se cierran las conexiones abiertas a esa base. La siguiente petición usa los datos nuevos.
- Eliminar pide confirmación. Gresbase olvida la conexión y su contraseña. La base de datos no se toca.

## La conexión de DATABASE_URL {#database-url}

Si defines `DATABASE_URL`, su conexión sale la primera de la lista, en gris y con el nombre de su base. Lleva un candado: «Definida por DATABASE_URL: solo se puede cambiar en el entorno.» Para cambiarla, edita la variable y recrea el contenedor.

## Solo lectura por conexión {#read-only}

**Solo lectura** en el formulario solo afecta a esa conexión. `GRESBASE_READ_ONLY` afecta a todas, diga lo que diga cada una. Las conexiones de solo lectura llevan la etiqueta **Solo lectura** en Ajustes. Los detalles están en [Modo solo lectura](./read-only.md).

## Servidor fijo {#fixed-server}

Con `GRESBASE_DB_HOST`, `GRESBASE_DB_PORT`, `GRESBASE_DB_NAME` o `GRESBASE_DB_USER`, el campo **Servidor**, **Puerto**, **Base de datos** o **Usuario** del formulario queda fijado a ese valor. Muestra «Definido por la variable de entorno» y el nombre de la variable. Así todas las conexiones van al mismo servidor.

## Dónde se guardan {#storage}

Las conexiones guardadas viven en `gresbase.json`, en el directorio de datos. Las contraseñas van cifradas con AES-GCM usando la clave secreta (`GRESBASE_SECRET_KEY` o `secret.key`). Las consultas guardadas de una conexión van en una carpeta llamada `@` más su id.

:::warning
Si el directorio de datos no se puede escribir, las conexiones guardadas viven en memoria y desaparecen al reiniciar. Si cambia la clave secreta, las contraseñas guardadas ya no se pueden leer: edita cada conexión y vuelve a escribir su contraseña. Mira [El volumen de datos](./data-volume.md).
:::

## Pools y límites {#pools}

Gresbase abre un pool para una conexión la primera vez que alguien la usa. Cada pool abre hasta `GRESBASE_MAX_CONNS` conexiones. Como mucho hay `GRESBASE_MAX_POOLS` pools abiertos a la vez. Un pool sin uso durante `GRESBASE_POOL_IDLE_TIMEOUT` se cierra, salvo el de `DATABASE_URL`. Mira [Variables de entorno](./environment.md).
