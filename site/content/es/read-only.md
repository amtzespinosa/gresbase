---
description: Abre una base para mirar sin riesgo de cambiar nada, en todas las conexiones o solo en una.
---

## Cómo activarlo {#turn-on}

Hay tres formas, de la más amplia a la más concreta:

- **Para todas las conexiones:** define `GRESBASE_READ_ONLY=true`. Cubre `DATABASE_URL`, las conexiones guardadas y las sesiones del modo libre.
- **Desde la app:** el administrador puede activar **Solo lectura** en **Ajustes**. Hace lo mismo que la variable y se aplica al reiniciar. Si la variable está definida, el ajuste queda bloqueado.
- **Para una conexión guardada:** marca **Solo lectura** en su formulario. Mira [Conexiones guardadas](./connections.md#read-only).

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secreto@db:5432/app
      GRESBASE_READ_ONLY: "true"
```
@tab docker run {#run}
```sh
docker run -d --name gresbase \
  -e DATABASE_URL=postgres://app:secreto@db:5432/app \
  -e GRESBASE_READ_ONLY=true \
  {{image}}
```
:::

## Dos capas {#layers}

El modo solo lectura actúa en dos sitios, así que si uno falla, el otro lo cubre:

1. **En PostgreSQL.** Cada conexión se abre con `default_transaction_read_only=on`. El propio PostgreSQL rechaza cualquier escritura.
2. **En la API.** Antes de tocar la base, Gresbase rechaza ediciones, importaciones, cambios de estructura y transacciones SQL con un `403` y el código `read_only`.

El editor SQL ejecuta cada sentencia dentro de una transacción de solo lectura. Rechaza `BEGIN`, `COMMIT`, `ROLLBACK` y similares, así que una consulta no puede salirse de ella.

## Qué ves {#ui}

La barra lateral muestra la etiqueta **Solo lectura**. Su descripción dice: «El modo solo lectura está activo: desde aquí nada puede cambiar tus datos. Las consultas guardadas siguen funcionando.»

Estos controles desaparecen:

- Editar celdas, insertar y borrar filas. La tabla muestra **Solo lectura** con el aviso «Gresbase está en modo solo lectura: no se pueden editar filas.»
- El botón **Nueva tabla**.
- El menú de acciones de la tabla: **Renombrar…**, **Editar comentario…**, **Mover a otro esquema…**, **Vaciar tabla…** y **Eliminar tabla…**.
- **Importar CSV** y, en el menú contextual de la tabla, **Importar CSV…**.
- La edición de la estructura.
- El interruptor **Modo transacción** del editor SQL.

Puedes seguir explorando, filtrando, exportando y lanzando consultas `SELECT`. También puedes guardar consultas: viven en el volumen de datos, no en la base.

Si aun así una escritura llega a la API, el mensaje es «Gresbase está en modo solo lectura: no se pueden hacer cambios.»

## Un usuario de PostgreSQL de solo lectura {#postgres-role}

Gresbase también detecta cuando el usuario de PostgreSQL (o la base de datos) tiene `default_transaction_read_only` a `on`. La interfaz se comporta entonces como arriba, y el editor SQL también: ejecuta cada sentencia en una transacción de solo lectura, rechaza `BEGIN`, `COMMIT` y similares, y no ofrece el modo transacción. Ni un `SET default_transaction_read_only = off` ni un `BEGIN READ WRITE` lo levantan. Mira [Conectar con PostgreSQL](./connecting.md#read-only-user).

:::warning
El modo solo lectura y los avisos antes de un SQL destructivo te ayudan a no equivocarte. No son una barrera de seguridad. Lo que protege de verdad tus datos es el usuario de PostgreSQL con el que conecta Gresbase: si los datos no deben cambiar, dale solo `SELECT`.
:::
