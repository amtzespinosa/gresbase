---
description: Saca filas en CSV, JSON o Markdown, y carga un CSV en una tabla sin quedarte nunca con media importación.
---

## Exportar una tabla {#exportar-tabla}

Pulsa **Exportar** en la barra de herramientas de la pestaña **Datos** y elige **CSV** o **JSON**. El fichero se descarga con el nombre de la tabla, por ejemplo `orders.csv`.

La exportación lleva todas las filas que cumplen los filtros y el orden actuales, no solo la página que ves. Para exportar la tabla entera, quita antes los filtros. **Exportar CSV**, en el menú contextual de la lista de tablas, lo hace por ti: no tiene en cuenta los filtros.

Se exportan todas las columnas de la tabla, en el orden de la tabla. Las columnas ocultas y el orden que les diste en el grid no cuentan.

### Cómo se hace la exportación {#exportacion-en-streaming}

El servidor va escribiendo las filas en el fichero según las devuelve Postgres, sin cargarlas todas en memoria. Las exportaciones no tienen timeout de consulta, así que una tabla grande puede tardar lo que necesite.

Si cierras la página o se corta la conexión, la consulta se cancela. Si algo falla a mitad, también falla la descarga, en lugar de dejar un fichero que parece completo.

Las exportaciones funcionan en [modo solo lectura](./read-only.md).

### Formato CSV {#formato-csv}

El CSV sigue lo que escribe `COPY … (FORMAT csv, HEADER)`:

- UTF-8, coma como separador y una fila de cabecera con los nombres de las columnas.
- Cada valor tal como lo escribe Postgres en texto. Las fechas van en formato ISO.
- `NULL` es un campo vacío. Un texto vacío es `""`, así se distinguen.
- Los campos con coma, comillas o saltos de línea van entre comillas dobles, con las comillas interiores duplicadas.

### Formato JSON {#formato-json}

El JSON es un array de objetos, uno por fila, con los nombres de las columnas como claves. Los valores siguen la misma codificación que la API:

| Tipo de Postgres | En el JSON |
| --- | --- |
| `NULL` | `null` |
| `boolean` | `true` / `false` |
| `int2`, `int4`, `float4`, `float8` | Número |
| `int8`, `numeric`, `money` | Texto, para no perder precisión |
| `json`, `jsonb` | El propio valor JSON |
| Fechas, horas, `uuid`, enums y el resto | Texto, tal como lo escribe Postgres |
| Arrays | Arrays JSON |
| `bytea` | Texto en hexadecimal, `\x…`, completo |

A diferencia del grid, no se recorta nada: los textos largos y los `bytea` salen enteros.

## Exportar resultados SQL {#exportar-resultados}

En el [editor SQL](./sql-editor.md), cada resultado tiene su propio menú **Exportar** con **CSV**, **JSON** y **Copiar como Markdown**.

Estas exportaciones trabajan con las filas que ya están en el navegador, no con la base. Llevan justo lo que muestra el resultado, que puede venir recortado. Los valores salen como se ven en el grid, y los `bytea` conservan su marca de tamaño.

**Copiar como Markdown** deja en el portapapeles una tabla al estilo de GitHub, lista para pegar en una issue o un README. `NULL` se escribe `NULL` y los saltos de línea se convierten en `<br>`. Un aviso lo confirma: «Copiado como tabla Markdown».

## Importar un CSV {#importar-csv}

La importación se abre con **Importar CSV**, en la barra de herramientas, o con **Importar CSV…**, en el menú contextual de la lista de tablas. Solo existe para tablas y tablas particionadas, y fuera del modo solo lectura.

:::steps
### Elige el fichero

Suelta un fichero en el panel **Importar CSV en …** o haz clic para elegirlo. Acepta ficheros `.csv`, `.tsv` y `.txt` de hasta 100 MB.

### Comprueba cómo se lee

Gresbase lee el principio del fichero y enseña una vista previa de las 100 primeras filas. **Separador** está en **Detectar**; puedes forzar **Coma (,)**, **Punto y coma (;)**, **Tabulador** o **Barra (|)**.

**La primera fila es la cabecera** se marca sola si alguna celda de la primera fila nombra una columna, o si ninguna es un número. Cámbialo si no acierta. Si el fichero empieza con la marca de orden de bytes de UTF-8, se ignora.

### Empareja las columnas

En **Columnas**, cada columna de la tabla elige una columna del fichero. Las que se llaman igual en la cabecera se emparejan solas, sin distinguir mayúsculas.

Una columna sin emparejar muestra **Usar el valor por defecto** si tiene valor por defecto o es de identidad, y **Dejar vacía** si no. Las obligatorias, `NOT NULL` sin valor por defecto, llevan un asterisco rojo.

Las columnas generadas y las `GENERATED ALWAYS AS IDENTITY` no aparecen: las rellena la base de datos.

### Decide qué son las celdas vacías

**Las celdas vacías son NULL** viene marcado. Desmárcalo para cargar las celdas vacías como texto vacío.

### Importa

Pulsa **Importar**. Al terminar, un aviso dice cuántas filas han entrado.
:::

### O todo o nada {#todo-o-nada}

El fichero entero entra en una sola transacción. Postgres convierte cada valor al tipo de su columna.

Si alguna fila falla, no se importa nada. El panel dice «No se ha importado nada: N filas tienen errores.» y enumera cada una con su línea en el fichero, la columna si se sabe y el motivo. Informa de hasta 100 filas con errores.

Las filas con menos campos de los que pide el emparejamiento también salen en la lista. Corrige el fichero y vuelve a importar.

:::warning
Una importación no se puede deshacer. No pasa por los cambios pendientes y <kbd>Ctrl</kbd> <kbd>Z</kbd> no la revierte. Si dudas, pruébala antes en una copia de la tabla.
:::

### Límite de tiempo {#timeout-importacion}

Una importación no usa el timeout normal de las consultas. Tiene el suyo, `GRESBASE_IMPORT_TIMEOUT`, de 10 minutos por defecto. El administrador también puede cambiarlo en **Ajustes** → **Timeout de importación CSV**; se aplica al reiniciar. Ver [Variables de entorno](./environment.md).

Si se acaba el tiempo, o cierras la página, la importación se detiene y no se guarda nada.

## Copiar y pegar con una hoja de cálculo {#hojas-de-calculo}

Para unas pocas filas no hace falta un fichero. Selecciona celdas en el grid y pulsa <kbd>Ctrl</kbd> <kbd>C</kbd> (<kbd>⌘</kbd> <kbd>C</kbd> en macOS): se pegan en Excel o Google Sheets como celdas. Con clic derecho tienes **Copiar como CSV**, **Copiar como JSON** y **Copiar como INSERT**.

Al revés también funciona: copia celdas en la hoja, elige una celda del grid y pega. Los valores van a los cambios pendientes, así que los revisas antes de guardar. Las filas que sobren pueden entrar como filas nuevas.

En [Editar datos](./editing-data.md) tienes el copiar y pegar con detalle.
