---
description: Quédate solo con las filas que te interesan y ponlas en el orden que quieras, con un enlace que puedes compartir.
---

## Añadir un filtro {#anadir-filtro}

:::steps
### Abre el formulario

Pulsa **Filtrar** en la barra de herramientas de la pestaña **Datos**.

### Elige columna y operador

Elige la **Columna** y luego el **Operador**. La lista solo ofrece los operadores que tienen sentido para el tipo de esa columna.

### Escribe el valor

Escribe el valor y pulsa **Añadir filtro**, o <kbd>Intro</kbd>.
:::

Cada filtro se convierte en un chip de la barra, como `status = active`. Su × (**Quitar filtro**) lo elimina.

Los valores viajan como texto y el servidor los convierte al tipo de la columna. Un valor que no encaja, como `abc` en una columna numérica, vuelve como error de Postgres.

Si ninguna fila cumple los filtros, el grid dice «Ninguna fila cumple estos filtros.» y ofrece **Quitar filtros**.

## Operadores {#operadores}

| Operador | Significado | Valor |
| --- | --- | --- |
| **=** | Igual | Un valor |
| **≠** | Distinto, incluidas las filas con `NULL` (`IS DISTINCT FROM`) | Un valor |
| **<**, **≤**, **>**, **≥** | Menor o mayor que | Un valor |
| **contiene** | Contiene el texto, sin distinguir mayúsculas | Un valor |
| **empieza por** | Empieza por el texto, sin distinguir mayúsculas | Un valor |
| **en** | Igual a alguno de los valores | Una lista separada por comas, hasta 1.000 valores |
| **entre** | Entre dos valores, ambos incluidos | Dos valores: el segundo campo es **Y** |
| **JSON contiene** | El JSON incluye este JSON (`@>`) | JSON, p. ej. `{"plan": "pro"}` |
| **es nulo** | La celda es `NULL` | Ninguno |
| **no es nulo** | La celda no es `NULL` | Ninguno |

**contiene** y **empieza por** tratan `%` y `_` como caracteres normales, no como comodines.

### Qué operadores tiene cada tipo {#operadores-por-tipo}

| Tipo de columna | Operadores |
| --- | --- |
| Texto (`text`, `varchar`, `char`, `name`, `citext`) | Todos: =, ≠, <, ≤, >, ≥, en, entre, contiene, empieza por, es nulo, no es nulo |
| Números, fechas, horas, UUID y otros tipos ordenables | =, ≠, <, ≤, >, ≥, en, entre, es nulo, no es nulo |
| `boolean` | =, ≠, en, es nulo, no es nulo |
| `jsonb` | =, ≠, JSON contiene, es nulo, no es nulo |
| `json` | JSON contiene, es nulo, no es nulo |
| Arrays | =, ≠, es nulo, no es nulo |

Un array se compara entero, escrito como literal de array de Postgres, por ejemplo `{a,b}`.

## Combinar filtros {#combinar}

Con dos filtros o más aparece **Combinar filtros** junto a los chips. Elige **Y** para quedarte con las filas que cumplen todos, u **O** para las que cumplen alguno.

La elección vale para todos los filtros a la vez. No hay grupos de filtros con lógicas distintas. Para eso, usa **Ver SQL** → **Abrir en el editor SQL** y escribe el `WHERE` que necesites.

## Ordenar {#ordenar}

Haz clic en la cabecera de una columna para ordenar solo por ella. Cada clic pasa por ascendente, descendente y sin orden.

Para ordenar por varias columnas, mantén <kbd>Mayús</kbd> mientras haces clic en otras cabeceras. Cada una muestra una flecha y, si hay varias, su posición: 1, 2, 3…

El botón **Ordenar** hace lo mismo desde una lista. **Ordenar por…** añade una columna, el botón de la flecha cambia el sentido y la × (**Quitar orden**) la quita. Con algún orden puesto, el botón dice **Ordenado por N**.

El menú de la columna (**⋮** en la cabecera) tiene **Orden ascendente** y **Orden descendente**. Dejan esa columna como único criterio.

Sin orden, las tablas con clave primaria muestran primero las filas más nuevas: clave primaria descendente. La cabecera de la clave muestra la flecha; púlsala para pasar a ascendente. Las tablas sin clave primaria mantienen el orden del servidor. Con orden, la clave primaria deshace los empates para que las páginas no repitan ni se salten filas. `NULL` va al final en ascendente y al principio en descendente, como en Postgres.

No se puede ordenar por una columna `json` o `xml`: Postgres no sabe ordenar esos tipos.

## Los filtros viven en la URL {#url}

Los filtros, cómo se combinan, el orden, el tamaño de página, la página y la pestaña abierta forman parte de la dirección. Eso quiere decir que:

- **Atrás** y **Adelante** del navegador recorren tus filtros.
- Un enlace copiado abre la misma vista a cualquiera que tenga acceso a la conexión.
- Al recargar no se pierde nada.

Los valores por defecto no se escriben en la dirección, así los enlaces son cortos. Un enlace editado a mano o antiguo no rompe la pantalla: lo que no tiene sentido vuelve a su valor por defecto.

Al cambiar un filtro, el orden o el tamaño de página vuelves a la primera página.

## A qué más afectan los filtros {#alcance}

**Exportar**, en la barra de herramientas, descarga todas las filas que cumplen los filtros y el orden actuales, no solo la página. Ver [Importar y exportar](./import-export.md).

**Recuento exacto**, en el pie, cuenta las filas que cumplen los filtros.
