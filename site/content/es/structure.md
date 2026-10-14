---
description: Mira cómo está hecha una tabla, sigue sus claves foráneas y cambia su estructura viendo siempre el SQL exacto antes de ejecutarlo.
---

## Dónde está {#where}

Abre una tabla y cambia de pestaña arriba de la tarjeta: **Datos**, **Estructura** y **Relaciones**. Desde la lista de tablas, el menú contextual también tiene **Ver estructura**.

**Estructura** describe la tabla. **Relaciones** muestra a qué tablas apunta y qué tablas apuntan a ella.

## La pestaña Estructura {#structure-tab}

La pestaña es una lista de secciones. Cuando una no tiene nada, pone **Ninguno.**

![La pestaña Estructura de la tabla orders.](structure.webp)

| Sección | Qué muestra |
| --- | --- |
| **Columnas** | **Nombre**, **Tipo**, **Admite nulos**, **Por defecto** y **Comentario**. Un icono de llave marca las columnas de la clave primaria. |
| **Índices** | **Nombre**, **Definición**, **Tamaño** y **Lecturas** (cuántas veces ha usado Postgres el índice). |
| **Restricciones** | **Nombre**, **Tipo** (**Clave primaria**, **Única**, **Check**, **Clave foránea**, **Exclusión**) y **Definición**. |
| **Claves foráneas** | Las claves de esta tabla, a qué apuntan y sus acciones **Al borrar** y **Al actualizar**. |
| **Triggers** | **Nombre**, **Definición** y si está **Activo**. |
| **Tamaños** | **Total**, **Tabla** e **Índices**, en disco. |
| **DDL** | El `CREATE TABLE` de la tabla, con un botón **Copiar**. |

En **Por defecto**, las columnas de identidad muestran **Identidad (siempre)** o **Identidad (por defecto)**. Las columnas generadas muestran **Generada:** y su expresión.

Las definiciones de índices y restricciones las escribe el propio Postgres, tal como las expresa tu versión del servidor.

## Relaciones y claves foráneas {#relations}

La pestaña **Relaciones** tiene dos listas:

- **Apunta a**: las claves foráneas de esta tabla y la tabla a la que apunta cada una.
- **Referenciada por**: claves foráneas de otras tablas que apuntan a esta.

Cada fila muestra el **Nombre** de la clave, sus **Columnas**, la otra tabla y las acciones **Al borrar** y **Al actualizar**. Estas son `NO ACTION`, `RESTRICT`, `CASCADE`, `SET NULL` o `SET DEFAULT`. La otra tabla aparece como `esquema.tabla` con sus columnas, y es un enlace que la abre.

### Seguir una clave foránea desde los datos {#follow-fk}

En la pestaña **Datos**, los valores de clave foránea se ven como enlaces con una flechita. Haz clic en uno, o pulsa <kbd>Espacio</kbd> con la celda seleccionada, y se abre un panel lateral:

- La fila a la que apunta el valor. Si ya no existe, el panel dice **La fila referenciada ya no existe.**
- **Referenciada por**: otras tablas que apuntan a esa fila, con cuántas filas cada una. Cada una enlaza a su tabla, filtrada a esas filas.
- **Abrir tabla**: abre la tabla referenciada filtrada a esa fila.

## Cambiar la estructura {#editing}

Desde la interfaz puedes crear tablas y cambiar columnas, índices y restricciones. Cada cambio abre un diálogo que funciona igual:

:::steps
### Rellena el formulario {#fill-form}

Mientras falte algo, el diálogo dice **Rellena el formulario para ver el SQL.**

### Lee el SQL {#read-sql}

En **SQL que se ejecutará**, Gresbase muestra las sentencias exactas que ejecutará el servidor, construidas a partir del formulario. Se actualizan mientras escribes.

### Revisa los avisos {#check-warnings}

Debajo del SQL, una lista explica qué le hace el cambio a la tabla: bloqueos, reescrituras, lecturas completas o filas que pueden impedirlo. Mira [Qué significan los avisos](#warnings).

### Aplica {#apply}

El botón de confirmar no se activa hasta que el SQL mostrado coincide con el formulario. El cambio va en una sola transacción: si una sentencia falla, no cambia nada.
:::

Si Postgres rechaza el cambio, el diálogo muestra su error. En los problemas de datos habituales añade qué hacer, por ejemplo quitar duplicados antes de crear una restricción única.

:::note
La edición de estructura solo existe en tablas y tablas particionadas. Las vistas y demás relaciones enseñan su estructura, pero no ofrecen cambios. En [modo solo lectura](./read-only.md) desaparecen todos los botones de edición.
:::

### Crear una tabla {#create-table}

En la lista de tablas, pulsa **Nueva tabla**. El diálogo pide el **Esquema**, el **Nombre de la tabla**, un **Comentario** opcional y las columnas.

Empieza con una columna `id` de tipo `bigint`, de identidad **Generada por defecto** y marcada como **Clave primaria**. Cámbiala o quítala si no te sirve. **Añadir columna** añade otra fila.

Cada columna tiene **Nombre de la columna**, **Tipo**, el **Tamaño** del tipo cuando lo admite, **Array**, **Identidad**, **Obligatoria (NOT NULL)** y **Valor por defecto**. Marca **Clave primaria** en todas las columnas que formen la clave.

### Añadir y cambiar columnas {#columns}

**Añadir columna**, en la sección **Columnas**, añade una columna con los mismos campos.

Cada columna tiene un menú en **Acciones** con:

| Acción | Qué ejecuta |
| --- | --- |
| **Renombrar…** | `ALTER TABLE … RENAME COLUMN` |
| **Cambiar tipo…** | `ALTER COLUMN … TYPE`. Marca **Convertir los valores existentes con un cast (USING columna::tipo_nuevo)** para añadir `USING columna::tipo_nuevo`. |
| **Hacer obligatoria (NOT NULL)…** | `SET NOT NULL`. Falla si alguna fila tiene `NULL` en esa columna. |
| **Permitir NULL…** | `DROP NOT NULL`. Sale en lugar de la anterior cuando la columna ya es obligatoria. |
| **Cambiar valor por defecto…** | `SET DEFAULT` o `DROP DEFAULT`. |
| **Eliminar columna…** | `DROP COLUMN`. Te pide escribir el nombre de la columna. |

Un valor por defecto puede ser **Sin valor por defecto** o un **Valor**, con cast al tipo de la columna. También una de las funciones `now()`, `current_timestamp()`, `current_date()` y `gen_random_uuid()`.

:::note
`gen_random_uuid()` solo aparece en PostgreSQL 13 o superior. En 12 necesita la extensión `pgcrypto`, así que Gresbase no la ofrece.
:::

### Renombrar, comentar o mover una tabla {#table}

El menú de acciones de la tabla, en la barra de la vista de tabla, tiene **Renombrar…**, **Editar comentario…** y **Mover a otro esquema…**. Ejecutan `RENAME TO`, `COMMENT ON TABLE` y `SET SCHEMA`.

En el mismo menú están **Vaciar tabla…** y **Eliminar tabla…**. Las dos te piden escribir el nombre de la tabla.

### Índices {#indexes}

**Añadir índice**, en la sección **Índices**, abre **Nuevo índice en** la tabla:

- Una o varias columnas, cada una **Descendente** si quieres.
- **Método**: `btree`, `hash`, `gin`, `gist`, `brin` o `spgist`. El servidor comprueba que el método existe.
- **Único**, para un índice único.
- **Sin bloquear escrituras (CONCURRENTLY)**.
- **Solo las filas donde (índice parcial, opcional)**: la condición de un índice parcial.
- **Nombre (opcional)**. Si lo dejas vacío, Postgres elige uno.

`CONCURRENTLY` no puede ir dentro de una transacción, así que ese índice se crea aparte. Si falla, deja un índice inválido que tendrás que eliminar.

El icono de papelera de cada índice lo elimina tras escribir su nombre. Los índices de una restricción no tienen papelera: se van con la restricción.

### Restricciones únicas y check {#constraints}

**Añadir restricción**, en la sección **Restricciones**, crea una restricción **Única** sobre unas columnas o un **Check** con una **Condición**.

Un check se puede crear con **No comprobar ahora las filas existentes (NOT VALID)**. Así Postgres solo lo aplica a las filas nuevas. Una restricción única no puede ser `NOT VALID`.

:::warning
La condición de un check o de un índice parcial es SQL que se ejecuta tal cual. Léela en la vista previa del SQL antes de aplicar. Se ejecuta como una única sentencia, así que no puede colar una segunda.
:::

### Claves foráneas {#foreign-keys}

**Añadir clave foránea**, en la sección **Claves foráneas**, pide el **Esquema referenciado**, la **Tabla referenciada** y pares de columnas: una de esta tabla y la que referencia. **Añadir par de columnas** añade otro par para una clave compuesta.

Elige las acciones **Al borrar** y **Al actualizar**. **No comprobar ahora las filas existentes (NOT VALID)** crea la clave sin leer las filas actuales.

### Validar y eliminar restricciones {#validate}

Una restricción creada como `NOT VALID` muestra un botón **Validar**. Ejecuta `VALIDATE CONSTRAINT`, que revisa las filas existentes. Si alguna incumple la regla, el diálogo lo dice y no cambia nada.

El icono de papelera de cada restricción la elimina tras escribir su nombre.

## Qué significan los avisos {#warnings}

| Aviso | Cuándo sale |
| --- | --- |
| Bloquea la tabla (ACCESS EXCLUSIVE) mientras se ejecuta: lecturas y escrituras esperan. | Casi todos los `ALTER TABLE`, los renombrados y los borrados. |
| Reescribe la tabla entera y sus índices: puede tardar en tablas grandes. | Un cambio de tipo que Postgres no puede hacer en el sitio, o una columna nueva de identidad o con `gen_random_uuid()` por defecto. |
| Lee todas las filas de la tabla: puede tardar en tablas grandes. | `SET NOT NULL`, índices nuevos, restricciones que se comprueban contra las filas actuales y **Validar**. |
| Puede fallar por las filas que ya tiene la tabla; si falla, no cambia nada. | Todo lo que revisa los datos actuales: `NOT NULL`, únicas, checks, claves foráneas y cambios de tipo. |
| Bloquea las escrituras en la tabla mientras dura (las lecturas siguen). | `CREATE INDEX` y las claves foráneas nuevas. |
| Se ejecuta fuera de una transacción: las escrituras siguen, pero si falla deja un índice inválido que hay que eliminar. | `CREATE INDEX CONCURRENTLY`. |

En tablas grandes de producción, usa `CONCURRENTLY` para los índices y `NOT VALID` seguido de **Validar** para claves foráneas y checks.

## Hacerlo con SQL {#sql}

Lo que no cubren los diálogos lo puedes escribir en el [editor SQL](./sql-editor.md). Tras un `CREATE`, `ALTER`, `DROP`, `COMMENT` o `TRUNCATE` desde allí, la lista de tablas y la estructura se actualizan solas.
