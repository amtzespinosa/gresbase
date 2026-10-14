---
description: Busca un valor o un nombre en todas las tablas de la conexión a la vez, con resultados que llegan tabla a tabla.
---

## Abrirla {#open}

Hay dos formas:

- **Buscar en todas las tablas** en la barra lateral.
- En la paleta de comandos (<kbd>Ctrl</kbd> <kbd>K</kbd>, o <kbd>⌘</kbd> <kbd>K</kbd> en Mac), escribe el término y elige **Buscar «término» en todas las tablas**.

El término y los esquemas quedan en la dirección, así que una búsqueda se puede recargar o compartir: `/search?q=…`. Escribe al menos dos caracteres.

## Qué busca {#what}

Los resultados llegan en dos secciones.

**Estructura**, arriba: tablas, vistas y columnas cuyo nombre contiene el término. Usa los nombres que Gresbase ya conoce, así que no cuesta ninguna consulta. Haz clic en una tabla para abrirla, o en una columna para abrir su tabla con esa columna resaltada.

**Datos**: las filas que contienen el término, agrupadas por tabla. Cada fila enseña la columna que coincide y un trozo de su valor alrededor de la coincidencia, con el término resaltado. Haz clic en una fila para abrir su tabla filtrada a esa fila y con la columna resaltada.

En los datos, cada columna se compara según su tipo:

| Tipo de columna | Coincide cuando |
| --- | --- |
| Texto (`text`, `varchar`, `char`, `citext`, `name`) y enums | El valor contiene el término, sin distinguir mayúsculas. `%` y `_` del término se toman tal cual. |
| Enteros, `numeric`, `real`, `double precision` | El término es un número igual al valor. Un número demasiado grande para una columna no se compara con ella. |
| `uuid` | El término es ese uuid. |
| `date` | El término es esa fecha, como `AAAA-MM-DD`. |
| `timestamp`, `timestamptz` | El término es una fecha (`AAAA-MM-DD`) y el valor cae en ese día. |

Las columnas JSON, de array y binarias no se buscan.

## Esquemas {#schemas}

Por defecto se busca en todos los esquemas que puedes usar. **Todos los esquemas** abre una lista para limitarla a uno o a varios. La elección queda en la dirección junto al término.

## Límites {#limits}

| Límite | Valor |
| --- | --- |
| Filas por tabla | 20 |
| Filas en total | 500. Al llegar ahí la búsqueda para y lo dice: afina el término o los esquemas. |
| Tiempo por tabla | 5 segundos |
| Tablas grandes | Las tablas con más de 1.000.000 de filas estimadas se dejan fuera salvo que marques **Incluir tablas grandes**. |

Una tabla que pasa de su tiempo aparece en **No se ha podido buscar** como **Demasiado lenta**. **Reintentar con más tiempo** la busca otra vez, sola y con 30 segundos. Ahí aparecen también las tablas sin permiso o con un error, y la búsqueda sigue con las demás.

Primero se buscan las tablas más pequeñas, de dos en dos, así que los primeros resultados llegan enseguida. **Cancelar** para la búsqueda, y PostgreSQL cancela la consulta en curso.

## Permisos y modos {#permissions}

- Solo se busca en las tablas y columnas que tu rol puede leer con `SELECT`. La seguridad por filas se aplica: solo ves las filas que tu rol puede ver.
- Cada tabla se busca en una transacción de solo lectura. La búsqueda funciona en una instancia o conexión de solo lectura, con conexiones guardadas y en modo libre.
- Las tablas particionadas se buscan una vez, a través de la tabla madre. En las vistas y tablas externas no se buscan datos.

## Bases de datos grandes {#performance}

Comparar texto con `ILIKE '%término%'` lee la tabla entera salvo que ayude un índice de trigramas. Para una tabla grande que buscas a menudo, un índice de la extensión `pg_trgm` permite a PostgreSQL encontrar las filas rápido:

```sql title="SQL"
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX users_email_trgm ON users USING gin (email gin_trgm_ops);
```

## Detrás de un proxy {#proxy}

Los resultados llegan como un flujo, tabla a tabla, así que empiezan a verse enseguida. La respuesta pide a los proxies que no la retengan (`X-Accel-Buffering: no` para Nginx, `Cache-Control: no-transform` contra la compresión), y se ha probado de principio a fin detrás de Nginx. Consulta [Seguridad y red](./security.md#long-requests).
