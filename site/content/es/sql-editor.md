---
description: Escribe y ejecuta SQL contra la conexión abierta, con pestañas, parámetros, transacciones, consultas guardadas e historial.
---

## La pantalla {#screen}

Abre **Editor SQL** en la barra lateral. La pantalla tiene tres tarjetas:

![El editor SQL con una consulta y sus resultados debajo.](sql-editor.webp)

- **Consultas**, a la izquierda: las consultas guardadas y el historial. No aparece en pantallas estrechas.
- **Editor**, arriba: las pestañas de consulta, una barra de herramientas y el editor.
- **Resultados**, debajo. Arrastra el separador entre editor y resultados para repartir el espacio, o enfócalo y usa las flechas.

El editor resalta la sintaxis de PostgreSQL y autocompleta nombres de tablas y columnas de la conexión. **Formatear SQL** reordena el texto y pone las palabras clave en mayúsculas.

## Pestañas de consulta {#tabs}

Cada conexión tiene sus propias pestañas. Al cambiar de conexión ves las de esa conexión, y al volver recuperas las tuyas.

| Para | Haz esto |
| --- | --- |
| Abrir una pestaña | Pulsa **Nueva pestaña** (+) junto a las pestañas. |
| Renombrar una pestaña | Haz doble clic en ella o pulsa <kbd>F2</kbd> encima. |
| Cerrar una pestaña | Pulsa su ×, o haz clic con el botón central. Si tiene cambios sin guardar, pregunta antes. |

Las pestañas y su texto se guardan en este navegador, así que sobreviven a una recarga. Los resultados solo viven en memoria mientras la página está abierta.

## Ejecutar SQL {#running}

| Acción | Botón | Teclas |
| --- | --- | --- |
| Ejecutar la sentencia bajo el cursor, o la selección | **Ejecutar** | <kbd>⌘</kbd> <kbd>↵</kbd> (<kbd>Ctrl</kbd> <kbd>↵</kbd> en Windows y Linux) |
| Ejecutar todas las sentencias de la pestaña | **Ejecutar todo** | <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>↵</kbd> (<kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>↵</kbd> en Windows y Linux) |

Sin selección, **Ejecutar** coge la sentencia donde está el cursor. Si el cursor queda justo después de un `;`, ejecuta la sentencia anterior.

Las sentencias se ejecutan en orden, una tras otra, sobre una sola conexión. La ejecución se para en el primer error. Después esa conexión se cierra, así que un `SET`, una tabla temporal o un `BEGIN` sin cerrar no duran más allá de la ejecución.

### Cancelar {#cancel}

Mientras una consulta corre, **Ejecutar** pasa a ser **Cancelar**. Pide a PostgreSQL que pare la sentencia. El resultado dice entonces **Se ha cancelado la consulta.**

## Resultados {#results}

Si se ejecutan varias sentencias, la tarjeta de resultados tiene una pestaña por sentencia: **Sentencia 1**, **Sentencia 2**… Se abre en la que falló o, si no, en la última.

- Una consulta muestra sus filas en un grid, con el número de filas y la duración.
- Una sentencia sin filas muestra **Hecho** y su etiqueta de comando, por ejemplo `Hecho · UPDATE 3`.
- Los mensajes de PostgreSQL (`RAISE NOTICE` y similares) aparecen debajo del resultado.
- **Exportar** descarga las filas en CSV o JSON, o las copia con **Copiar como Markdown**. Usa las filas ya cargadas.

### Límite de filas {#row-limit}

Cada resultado guarda como mucho 1000 filas por defecto. Si hay más, el resultado muestra la etiqueta **Solo las primeras 1000 filas** y el resto no se carga.

Cambia el límite con `GRESBASE_SQL_MAX_ROWS` (de 1 a 100000) o en [Ajustes](./settings.md), en **Límite de filas**. El cambio se aplica al momento, sin reiniciar.

## Timeout {#timeout}

Cada ejecución tiene un límite de tiempo: 30 segundos por defecto. Cambia el valor por defecto con `GRESBASE_STATEMENT_TIMEOUT` (por ejemplo `2m`) o en [Ajustes](./settings.md), en **Timeout por defecto**. Ese ajuste se aplica al reiniciar.

La barra del editor muestra el límite actual en una etiqueta, como `timeout 30 s`. Para cambiarlo en tus próximas ejecuciones:

:::steps
### Haz clic en la etiqueta {#timeout-click}

Se convierte en un campo, en segundos.

### Escribe el nuevo valor {#timeout-type}

Pulsa <kbd>↵</kbd> o haz clic fuera para aplicarlo. <kbd>Esc</kbd> lo deja como estaba.
:::

El nuevo valor vale para todas las pestañas de esta página. Al recargar vuelve al valor del servidor. El servidor acepta como mucho una hora.

Una consulta que se queda sin tiempo se para con **La consulta tardaba demasiado y se ha detenido.**

## Parámetros {#parameters}

Escribe `:nombre` donde va un valor. Al ejecutar, Gresbase te pide los valores en **Valores de los parámetros**.

```sql title="pedidos-desde.sql"
SELECT id, total, created_at
FROM orders
WHERE customer_id = :cliente
  AND created_at >= :desde::date;
```

- Los valores viajan como parámetros enlazados. Nunca se escriben dentro del SQL.
- PostgreSQL deduce el tipo de cada uno por dónde se usa. Añade un cast como `::date` cuando no pueda.
- Un campo vacío es un texto vacío, no `NULL`.
- Cada pestaña recuerda los últimos valores que diste.

Gresbase no toma `:` como parámetro dentro de textos, identificadores entre comillas o comentarios. Tampoco en casts como `x::int` ni en rangos de arrays como `a[lo:hi]`.

## SQL destructivo {#destructive}

Antes de ejecutar, Gresbase busca sentencias que puedan destruir datos. Estas piden confirmación:

- `DROP`
- `TRUNCATE`
- `ALTER … DROP`
- `DELETE` sin `WHERE`
- `UPDATE` sin `WHERE`

Los `DELETE` y `UPDATE` con `WHERE` también salen en la lista, como aviso. `EXPLAIN ANALYZE` cuenta, porque ejecuta la sentencia.

El diálogo **Este SQL puede destruir datos** las enumera. Puedes **Cancelar**, **Usar modo transacción** para ver antes lo que cambian, o **Ejecutar igualmente**.

En [modo transacción](#transactions) no se pregunta al ejecutar. La pregunta llega al **Confirmar**.

:::warning
Esta comprobación es una ayuda, no una barrera de seguridad. Lee el texto de tu SQL y se le pueden escapar cosas, como una función que borra filas. La protección de verdad es el rol de PostgreSQL con el que conecta Gresbase. Mira [Seguridad y red](./security.md).
:::

## Modo transacción {#transactions}

El interruptor **Modo transacción** de la barra ejecuta tu SQL dentro de una transacción. No se guarda nada hasta que confirmes.

:::steps
### Activa el Modo transacción {#tx-on}

La primera ejecución abre una transacción. Las siguientes van dentro de la misma.

### Mira la franja {#tx-band}

Bajo la barra aparece una franja con **Transacción abierta**, las filas afectadas y el tiempo que queda para que se revierta sola.

### Confirma o revierte {#tx-end}

Pulsa **Confirmar** para quedarte con los cambios o **Revertir** para descartarlos. Si la transacción ejecutó sentencias destructivas, **Confirmar** las enumera y vuelve a preguntar.
:::

Algunas reglas:

- Una transacción inactiva se revierte a los 5 minutos. La franja hace la cuenta atrás, y cada ejecución la reinicia.
- Si una sentencia falla, solo puedes **Revertir**.
- Dentro de la transacción, un `BEGIN`, `COMMIT` o `ROLLBACK` tuyo se rechaza: usa los botones. Los savepoints funcionan.
- Mientras hay una transacción abierta, el interruptor no se puede apagar.
- Salir del editor pregunta antes. **Revertir y salir** descarta los cambios.
- Una transacción que dejó abierta una página cerrada aparece como **Transacción abierta encontrada**. **Retomar** la continúa y **Revertir** la descarta.
- Una sesión puede tener como mucho 3 transacciones abiertas.

En modo solo lectura el interruptor no aparece.

## Errores {#errors}

Una sentencia que falla muestra el mensaje de PostgreSQL, su código de error y, si los hay, **Detalle:** y **Pista:**.

El editor además subraya dónde falló. Si PostgreSQL da una posición, el subrayado marca la palabra de ese punto. Si no, marca la sentencia entera. La siguiente ejecución lo borra.

## Modo solo lectura {#read-only}

Con el [modo solo lectura](./read-only.md) activo, el global o el de una conexión, el editor sigue ejecutando consultas:

- Cada ejecución va dentro de una transacción de solo lectura. Una escritura falla con **Gresbase está en modo solo lectura: no se pueden hacer cambios.**
- Se rechazan `BEGIN`, `COMMIT` y `ROLLBACK`.
- No hay confirmación de SQL destructivo ni **Modo transacción**.
- Las consultas guardadas siguen funcionando.

## Consultas guardadas {#saved}

Pulsa **Guardar** o <kbd>⌘</kbd> <kbd>S</kbd> (<kbd>Ctrl</kbd> <kbd>S</kbd> en Windows y Linux). La primera vez pide un **Nombre**. Después, cada guardado sobrescribe la misma consulta.

- Usa `/` en el nombre para crear carpetas, por ejemplo `informes/mensual`.
- Marca **Solo para esta conexión** para que se quede en la conexión actual. Si no, la ven todas.
- Un punto junto al título indica **Cambios sin guardar**.

En la tarjeta **Consultas** salen primero las consultas de esta conexión, bajo su nombre. Después, las de **Todas las conexiones**. **Nueva carpeta** crea una carpeta.

Cada consulta tiene un menú contextual: clic derecho, la tecla de menú o <kbd>Shift</kbd> <kbd>F10</kbd>, o una pulsación larga en pantallas táctiles.

| Opción | Qué hace |
| --- | --- |
| **Abrir** | La abre en una pestaña. |
| **Renombrar…** | Edita la ruta entera, así que también sirve para moverla a otra carpeta. |
| **Duplicar** | Guarda una copia a su lado. |
| **Copiar SQL** | Copia su texto. |
| **Eliminar…** | La borra para siempre, tras preguntar. |

Los iconos de lápiz y papelera que aparecen al pasar el ratón también renombran y eliminan. Eliminar una carpeta borra todas sus consultas.

### Dónde se guardan {#snippet-files}

Cada consulta guardada es un fichero `.sql` en la carpeta `snippets` del directorio de datos: `/data/snippets` por defecto. Las carpetas son carpetas de verdad. Las consultas de una conexión van en una carpeta llamada `@` más el id de la conexión.

Una consulta puede ocupar hasta 1 MB. Si el directorio de datos no las conservaría, la tarjeta dice por qué y cuándo se pierden. Monta un volumen con nombre en `/data`; mira [Cuándo avisa Gresbase](./data-volume.md#warnings).

En [modo libre](./free-mode.md), cada usuario tiene sus consultas guardadas privadas, en `snippets/.private/`, con una carpeta por `usuario@servidor:puerto/base`. Ahí no aparece la opción **Solo para esta conexión**: la carpeta ya es de una base concreta.

## Historial {#history}

Cada ejecución queda en **Historial**, en la tarjeta **Consultas**. Cada entrada muestra su primera línea, cuándo se ejecutó, la duración y las filas, o **Falló**.

- Haz clic en una entrada para cargarla en la pestaña abierta como consulta sin título. Si la pestaña tiene cambios sin guardar, pregunta antes. **Ejecutar de nuevo** (▶) la carga y la ejecuta.
- El menú contextual tiene **Abrir**, **Ejecutar**, **Copiar SQL**, **Guardar como consulta…** y **Eliminar del historial**.
- **Buscar en el historial** filtra por texto. **Borrar historial** lo vacía.

El historial vive en este navegador, en IndexedDB, y guarda las últimas 500 ejecuciones. Lo comparten todas las conexiones y nunca llega al servidor. En una ventana privada sin IndexedDB solo dura hasta que cierras la página.
