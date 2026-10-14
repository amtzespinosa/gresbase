---
description: Cambia celdas, añade y borra filas, revisa cada cambio en un diff y guárdalo todo en una sola transacción.
---

## Cómo funciona la edición {#como-funciona}

Nada de lo que haces en el grid llega a la base en el momento. Las ediciones, las filas nuevas y los borrados esperan en una cola de cambios pendientes. Los revisas y los guardas juntos, en una transacción.

![Dos celdas editadas en amarillo y la barra de cambios pendientes con Ver diff, Descartar y Guardar.](editing.webp)

Puedes editar las filas cuando la relación es una tabla o una tabla particionada, tiene clave primaria y Gresbase no está en solo lectura. Si no, la cabecera dice **Solo lectura**. Ver [tablas sin clave primaria](#sin-clave-primaria) y [modo solo lectura](#solo-lectura).

## Editar una celda {#editar-celda}

Elige una celda con el ratón o con las flechas. Abre su editor con <kbd>Intro</kbd>, <kbd>F2</kbd> o doble clic.

| Tecla en el editor | Efecto |
| --- | --- |
| <kbd>Intro</kbd> | Manda el valor a la cola |
| <kbd>Ctrl</kbd> <kbd>Intro</kbd> (<kbd>⌘</kbd> <kbd>Intro</kbd> en macOS) | Lo mismo, en los editores de varias líneas |
| <kbd>Tab</kbd> / <kbd>Mayús</kbd> <kbd>Tab</kbd> | Manda el valor a la cola y pasa a la columna siguiente o a la anterior |
| <kbd>Esc</kbd> | Cierra el editor sin cambiar nada |
| <kbd>Ctrl</kbd> <kbd>S</kbd> (<kbd>⌘</kbd> <kbd>S</kbd> en macOS) | Manda el valor a la cola y guarda todos los cambios pendientes |

Si haces clic fuera del editor, un valor válido se queda y uno no válido se descarta.

El editor tiene varias líneas para JSON, arrays y textos de más de 60 caracteres o con saltos de línea. Ahí <kbd>Intro</kbd> añade una línea.

Las celdas editadas se tiñen. Si vuelves a escribir el valor original, el cambio sale de la cola.

### Poner NULL {#poner-null}

Pulsa <kbd>Ctrl</kbd> <kbd>Retroceso</kbd> (<kbd>⌘</kbd> <kbd>⌫</kbd> en macOS) sobre una celda para dejarla a `NULL`. En una columna `NOT NULL` sale un aviso, como «email no admite NULL.», y no cambia nada.

### Editores según el tipo {#editores}

| Tipo de columna | Editor |
| --- | --- |
| `boolean` | Una lista con `true` y `false` |
| Enums | Una lista con los valores del enum |
| `json`, `jsonb` y arrays | Un editor de código. Los arrays se escriben en JSON, como `["a", "b"]`. |
| `date` | El selector de fecha del navegador |
| `timestamp`, `timestamptz` | Texto con la forma `YYYY-MM-DD HH:MM:SS+00` |
| Enteros y números | Texto, que se comprueba antes de pasar a la cola |
| Texto y el resto | Un campo de texto, de varias líneas si el texto es largo |

Hay columnas que no se editan: las generadas, las `GENERATED ALWAYS AS IDENTITY` y las `bytea`.

Un valor que no encaja se queda en el editor con un mensaje, como «Escribe un número entero.» o «No es un JSON válido.». De todos modos, el servidor convierte cada valor al tipo real de la columna.

## Insertar filas {#insertar-filas}

:::steps
### Abre el panel

Pulsa **Insertar fila** en la barra de herramientas. Se abre el panel **Insertar fila** a la derecha.

### Rellena los campos

Cada columna indica qué pasa si la dejas vacía: **Lo pone la base de datos**, **Por defecto: …**, **Obligatorio** o **Vacío = NULL**. Las obligatorias llevan un asterisco rojo. Marca **NULL** para mandar un `NULL` explícito.

### Mándala a la cola

Pulsa **Añadir a la cola**. La fila nueva aparece arriba del grid con el borde izquierdo de color.
:::

En una fila nueva, un campo vacío significa «usa el valor por defecto». La fila nueva se puede seguir editando en el grid. Su botón **Quitar fila nueva** (×) la descarta.

### El panel de fila {#panel-de-fila}

El botón **Abrir fila**, al principio de cada fila, la abre entera en el panel **Fila**. Ahí editas todos los campos a la vez y pulsas **Aplicar**. **Duplicar** abre una fila nueva con los mismos valores salvo la clave primaria. **Referenciada por** muestra las filas de otras tablas que apuntan a esta.

## Seleccionar y borrar filas {#seleccionar-borrar}

Haz clic en cualquier punto de una fila para seleccionarla. Las casillas del principio de cada fila hacen lo mismo.

| Acción | Efecto |
| --- | --- |
| Clic | Selecciona solo esa fila |
| <kbd>Ctrl</kbd> + clic (<kbd>⌘</kbd> + clic en macOS) | Añade o quita esa fila |
| <kbd>Mayús</kbd> + clic | Selecciona todas las filas desde la última en la que hiciste clic |
| Casilla de la cabecera | Selecciona o deselecciona todas las filas de la página |

Pulsa **Borrar N filas** para marcar las seleccionadas. Siguen en el grid, tachadas, hasta que guardes. **Conservar esta fila** en una fila tachada la saca de la cola. El botón dice **Borrar filas** y está desactivado mientras no haya nada seleccionado.

## Seleccionar un bloque de celdas {#bloque-de-celdas}

Arrastra sobre las celdas, o usa <kbd>Mayús</kbd> + clic, para seleccionar un rectángulo. Con el teclado, mantén <kbd>Mayús</kbd> y usa las flechas. <kbd>Esc</kbd> vuelve a una sola celda.

## Copiar {#copiar}

<kbd>Ctrl</kbd> <kbd>C</kbd> (<kbd>⌘</kbd> <kbd>C</kbd> en macOS) copia la selección separada por tabuladores, sin cabecera. Es lo que las hojas de cálculo pegan sin más.

Con clic derecho sobre la selección tienes otros formatos:

| Opción | Resultado |
| --- | --- |
| **Copiar** | Valores separados por tabuladores, sin cabecera |
| **Copiar como CSV** | Separados por comas, con una fila de cabecera |
| **Copiar como JSON** | Un array de objetos, uno por fila |
| **Copiar como INSERT** | Una sentencia `INSERT INTO "esquema"."tabla" (…) VALUES …;` |

`NULL` es un campo vacío en TSV y CSV, y `NULL` en el `INSERT`. Los valores cortados a 10 KB se copian enteros si la tabla tiene clave primaria.

De los `bytea` solo llegan sus primeros 32 bytes, así que un valor más largo se copia incompleto y acaba en `…`.

## Pegar desde una hoja de cálculo {#pegar}

Elige la celda de arriba a la izquierda y pulsa <kbd>Ctrl</kbd> <kbd>V</kbd> (<kbd>⌘</kbd> <kbd>V</kbd> en macOS). La opción **Pegar** del menú hace lo mismo si el navegador deja leer el portapapeles.

- El texto con tabuladores se lee como una tabla, que es como copian Excel y Google Sheets.
- Sin tabuladores, varias líneas con el mismo número de comas se leen como CSV. Lo demás va a una sola columna.
- Las celdas se rellenan hacia la derecha en el orden en que ves las columnas. Lo que pasa de la última columna se descarta.
- Las celdas de columnas que no se editan se saltan, y un aviso dice cuántas.
- Una celda vacía es `NULL`, o un texto vacío en una columna de texto `NOT NULL`.
- Los booleanos aceptan `true`, `t`, `yes`, `y`, `on`, `1` y sus contrarios.

Si lo pegado pasa de la última fila, Gresbase pregunta **¿Insertar N filas nuevas?**. Elige **Insertar filas** o **Solo actualizar las existentes**.

Los valores que no encajan en su columna se marcan en rojo y la píldora los cuenta. No se puede guardar hasta corregirlos. Todo un pegado se deshace de una vez.

## Cambios pendientes {#cambios-pendientes}

Mientras haya cambios en la cola, flota una píldora abajo del grid: **N cambios pendientes**, **Ver diff**, **Descartar** y **Guardar**.

Cambiar de página, de filtros o de orden conserva la cola. Salir de la tabla pregunta **¿Salir sin guardar?**, con **Quedarme** y **Descartar y salir**. La cola vive en la pestaña del navegador: si recargas, se pierde después del aviso del navegador.

### El diff {#diff}

**Ver diff** enumera cada cambio: las actualizaciones con el valor viejo tachado y el nuevo, las inserciones con sus valores y los borrados. Debajo ves el SQL exacto que se va a ejecutar.

Todo se guarda en una transacción: o todo o nada. Si el cambio no se va a poder deshacer después de guardar, el diálogo explica por qué.

### Guardar {#guardar}

Pulsa **Guardar**, o <kbd>Ctrl</kbd> <kbd>S</kbd> (<kbd>⌘</kbd> <kbd>S</kbd> en macOS) desde cualquier punto de la pestaña **Datos**. **Descartar** vacía la cola.

Si borras filas a las que otras tablas apuntan con `ON DELETE CASCADE`, `SET NULL` o `SET DEFAULT`, antes sale un diálogo. Indica cuántas filas de cada tabla se van a tocar. **Borrar igualmente** sigue adelante.

Un aviso confirma el guardado con un botón **Deshacer** durante 10 segundos.

## Deshacer y rehacer {#deshacer-rehacer}

| Atajo | Efecto |
| --- | --- |
| <kbd>Ctrl</kbd> <kbd>Z</kbd> (<kbd>⌘</kbd> <kbd>Z</kbd> en macOS) | Deshacer |
| <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>Z</kbd> (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> en macOS) | Rehacer |

Deshacer recorre primero los cambios pendientes, uno a uno. Con la cola vacía, deshace el último guardado de esta tabla. El servidor aplica los cambios inversos en una transacción nueva.

El servidor guarda los últimos 50 guardados de cada sesión. Al recargar se pierde el historial de guardados.

Hay guardados que no se pueden deshacer: la tabla tiene triggers que pueden cambiar otros datos, un borrado se propaga a otras tablas o un cambio de clave se propaga. El diff te avisa antes de guardar y el aviso final dice «No se puede deshacer.». Después, el historial empieza de cero para que <kbd>Ctrl</kbd> <kbd>Z</kbd> no se salte ese guardado.

## Conflictos {#conflictos}

Gresbase comprueba cada fila antes de escribir. Una actualización comprueba que las columnas que cambiaste siguen con los valores que cargaste. Un borrado comprueba la fila entera. Una inserción comprueba que no haya otra fila con esa clave primaria.

Si otra persona se adelantó, no se guarda nada. La API responde `409 conflict` y lees un mensaje así:

> No se ha guardado nada. Cambio 2 (Actualizar id = 7): otra persona ha cambiado email. Recarga para ver los valores actuales.

Tu cola sigue igual. Descarta el cambio que choca, o recarga y vuelve a hacerlo.

Deshacer y rehacer comprueban lo mismo. Si los datos cambiaron después de guardar, **No se puede deshacer: los datos han cambiado** muestra cada columna con el valor esperado y el de **Ahora**. No se toca nada.

## Tablas sin clave primaria {#sin-clave-primaria}

Sin clave primaria, Gresbase no puede señalar una fila con seguridad. El grid es de solo lectura, las filas no se pueden fijar y las páginas van por desplazamiento. La API rechaza las escrituras con `no_primary_key`.

Añade una clave primaria desde la pestaña [Estructura](./structure.md), o cambia las filas desde el [editor SQL](./sql-editor.md).

## Modo solo lectura {#solo-lectura}

En modo solo lectura desaparecen los botones de edición, la importación y las acciones de tabla. La etiqueta dice **Solo lectura**. La API responde `403 read_only` a cualquier escritura, y la conexión con la base también es de solo lectura. Ver [Modo solo lectura](./read-only.md).
