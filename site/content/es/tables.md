---
description: Encuentra una tabla, ábrela en una pestaña y coloca el grid para tener a la vista los datos que buscas.
---

## La lista de tablas {#lista-de-tablas}

La tarjeta de la izquierda muestra las tablas de un esquema. El esquema se elige arriba, en el selector **Esquema**.

Cada entrada lleva un icono según su tipo y un número aproximado de filas. Los tipos son tabla, vista, vista materializada, tabla foránea y tabla particionada. El número sale de las estadísticas de Postgres: si la tabla nunca se ha analizado, no aparece.

Una tabla particionada tiene un botón, **Ver N particiones**, que despliega sus particiones debajo. Si un nombre no cabe, pasa el ratón por encima o ponle el foco para verlo entero.

### Buscar {#buscar}

Escribe en **Buscar tablas** para filtrar la lista. Con <kbd>/</kbd> saltas al campo desde cualquier punto de la pantalla.

La búsqueda deja las tablas cuyo nombre contiene el texto, sin distinguir mayúsculas. También encuentra particiones por su nombre y las enseña bajo su tabla. Solo busca en el esquema elegido.

### Favoritas {#favoritas}

Haz clic derecho en una tabla y elige **Añadir a favoritas**. Las marcadas salen en **Favoritas**, arriba de la lista, sean del esquema que sean.

Las favoritas se guardan por conexión, en este navegador, y se ocultan mientras buscas. Si una tabla favorita se borra o cambia de nombre, desaparece de la lista; vuelve si la tabla vuelve.

Las tablas que abriste hace poco también salen en la [paleta de comandos](./command-palette.md).

### Cambiar el ancho de la lista {#ancho-de-la-lista}

Arrastra el tirador del borde derecho de la lista. Con el teclado, ponle el foco y usa estas teclas:

| Tecla | Efecto |
| --- | --- |
| <kbd>←</kbd> / <kbd>→</kbd> | Más estrecha o más ancha, de 16 en 16 px |
| <kbd>Inicio</kbd> | Lo más estrecha posible (200 px) |
| <kbd>Fin</kbd> | Lo más ancha posible (560 px) |

Un doble clic en el tirador la devuelve a su ancho por defecto, 240 px. El ancho se recuerda en este navegador.

### Menú contextual {#menu-contextual}

Con clic derecho sobre una tabla (o una favorita) tienes estas opciones:

| Opción | Qué hace |
| --- | --- |
| **Abrir** | Abre la tabla aquí |
| **Abrir en pestaña nueva** | La abre en otra pestaña del navegador |
| **Añadir a favoritas** / **Quitar de favoritas** | La marca o la desmarca |
| **Copiar nombre** | Copia el nombre de la tabla, sin el esquema |
| **Ver estructura** | Abre la tabla en su pestaña **Estructura** |
| **Exportar CSV** | Descarga la tabla entera en CSV, sin filtros |
| **Importar CSV…** | Abre el panel de importación ([Importar y exportar](./import-export.md)) |
| **Vaciar tabla…** | Borra todas las filas (`TRUNCATE`) después de que escribas el nombre de la tabla |
| **Eliminar tabla…** | Borra la tabla (`DROP TABLE`) después de que escribas su nombre |

Las tres últimas solo salen en tablas y tablas particionadas, y nunca en [modo solo lectura](./read-only.md).

El botón **Nueva tabla**, encima de la lista, crea una tabla. Lo tienes en [Estructura y relaciones](./structure.md).

## Pestañas de tablas {#pestanas}

Cada tabla que abres tiene su pestaña encima del grid. Las pestañas se guardan por conexión, en este navegador.

- Haz clic en una pestaña para volver a esa tabla.
- Ciérrala con su ×, con el botón central del ratón o con <kbd>Alt</kbd> <kbd>W</kbd> (<kbd>⌥</kbd> <kbd>W</kbd> en macOS) si es la abierta.
- Arrástrala para cambiarla de sitio.
- Con clic derecho tienes **Cerrar**, **Cerrar las demás**, **Mover a la izquierda** y **Mover a la derecha**.

Si cierras la pestaña abierta, pasas a la de al lado, o a la lista si era la última. La pestaña de una tabla que ya no existe se cierra al abrirla.

:::note
El atajo es <kbd>Alt</kbd> <kbd>W</kbd> y no <kbd>Ctrl</kbd> <kbd>W</kbd>, porque el navegador se queda ese para cerrar su propia pestaña.
:::

## La cabecera de la tabla {#cabecera}

La cabecera muestra `esquema / tabla` y un número aproximado de filas, sacado de las estadísticas de Postgres.

Cuando las filas no se pueden editar aparece la etiqueta **Solo lectura**. Su tooltip explica el motivo: la tabla no tiene clave primaria, es una vista o Gresbase está en modo solo lectura.

A la derecha cambias entre tres pestañas:

- **Datos**: las filas, en el grid.
- **Estructura**: columnas, índices y restricciones. Ver [Estructura y relaciones](./structure.md).
- **Relaciones**: las claves foráneas que salen de esta tabla y las que apuntan a ella.

El menú **⋯** de al lado reúne **Renombrar…**, **Editar comentario…**, **Mover a otro esquema…**, **Vaciar tabla…** y **Eliminar tabla…**. Solo aparece en tablas y fuera del modo solo lectura.

## La pestaña Datos {#pestana-datos}

Encima del grid está la barra de herramientas: **Filtrar**, **Ordenar**, los chips de filtro, **Ver SQL**, **Importar CSV**, **Columnas**, los botones de edición y **Exportar**.

![La pantalla Tablas: la lista de tablas a la izquierda y la tabla customers con una fila seleccionada.](tables.webp)

**Ver SQL** abre **SQL equivalente**: la consulta que hay detrás de lo que ves, con los valores escritos. **Abrir en el editor SQL** la lleva al [editor SQL](./sql-editor.md).

Filtrar y ordenar tienen su propia página: [Filtrar y ordenar](./filter-sort.md).

### Columnas {#columnas}

Cada cabecera lleva una llave si la columna es de la clave primaria, una flecha si es clave foránea, el nombre y el tipo.

| Para… | Haz esto |
| --- | --- |
| Cambiar el ancho de una columna | Arrastra el borde derecho de su cabecera. Doble clic en el borde para volver al ancho inicial. |
| Fijar una columna a la izquierda | Pulsa el candado de su cabecera, o **Fijar** en su menú |
| Ocultar una columna | **Ocultar columna** en su menú (el botón **⋮** de la cabecera) |
| Volver a mostrarla o reordenar | Abre **Columnas**: marca las casillas, arrastra los nombres o usa las flechas |
| Empezar de cero | **Columnas** → **Restablecer vista** |

**Restablecer vista** quita lo fijado, muestra todas las columnas y recupera el orden de la tabla y los anchos iniciales. Con columnas ocultas, el botón dice **Columnas (N ocultas)**.

El menú de la columna también tiene **Orden ascendente** y **Orden descendente**.

### Filas fijadas {#filas-fijadas}

En una tabla con clave primaria, el candado del principio de cada fila la fija. Las filas fijadas se quedan bajo la cabecera aunque hagas scroll, cambies de página o filtres. **Desfijar todo** suelta filas y columnas.

Lo fijado, las columnas ocultas, el orden y los anchos se recuerdan por tabla, en este navegador.

### Densidad {#densidad}

Las filas pueden ser **Cómoda** (la opción por defecto) o **Compacta**. Se cambia en **Ajustes** → **Densidad del grid**. Ver [Idioma y tema](./preferences.md).

### Páginas {#paginas}

El pie muestra el rango que tienes delante, por ejemplo `1–50 de 1.204`. Sin filtros, el total es la estimación. Pulsa **Recuento exacto** para contar de verdad las filas que cumplen los filtros.

Elige 50, 100 o 200 filas por página y muévete con **Página anterior** y **Página siguiente**. No se puede saltar a un número de página.

Las tablas con clave primaria paginan por clave (keyset), así que una página tarda lo mismo por lejos que esté. Las que no la tienen paginan por desplazamiento. Al cambiar filtros, orden o tamaño de página vuelves a la primera.

## Cómo se ven los valores {#valores}

| Valor | En el grid |
| --- | --- |
| `NULL` | *NULL*, en cursiva y atenuado |
| Clave foránea | Un enlace con flecha. Haz clic, o pulsa <kbd>Espacio</kbd> en la celda, para ver la fila referenciada. |
| `bytea` | `bytea · 1,2 KB`: solo el tamaño, nunca los bytes |
| Texto de más de 10 KB | Los primeros 10 KB. **Ver valor completo** (el icono de ampliar) carga el resto. |
| `json` / `jsonb` | JSON compacto. **Ver valor completo** lo enseña formateado. |
| Booleanos | `true` / `false` en el color de acento |

La fila referenciada se abre en un panel lateral con **Referenciada por** y **Abrir tabla**. **Abrir tabla** abre la tabla de destino filtrada por esa fila.

Para cargar el texto completo hace falta clave primaria. En una tabla sin ella, **Ver valor completo** enseña los primeros 10 KB.

## Vistas y otras relaciones de solo lectura {#vistas}

Las vistas, las vistas materializadas y las tablas foráneas muestran sus filas como cualquier tabla, con los mismos filtros, orden y exportación. No se pueden editar: la cabecera dice **Solo lectura** y no hay importación, menú **⋯** ni edición.

La API rechaza las escrituras en ellas con `not_writable`. Las tablas sin clave primaria también son de solo lectura en el grid. Ver [Editar datos](./editing-data.md).
