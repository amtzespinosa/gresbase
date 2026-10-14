---
description: Un primer vistazo a las pantallas principales para que sepas dónde está cada cosa.
---

## La barra lateral {#barra-lateral}

Gresbase no tiene barra superior. Todo parte de la barra lateral flotante de la izquierda:

- **Buscar** abre la paleta de comandos.
- **Tablas** y **Editor SQL** son las dos pantallas principales.
- **Ajustes** está abajo del todo.
- La tarjeta de conexión enseña el servidor y la versión de PostgreSQL, con un punto verde si hay conexión. Si tienes varias conexiones, desde ahí puedes **Cambiar de conexión**.

Encima de la tarjeta pueden salir dos avisos. **Solo lectura** indica que nada puede cambiar tus datos. **Solo este equipo** indica que no hay login, así que Gresbase solo responde en `localhost`.

Pliega la barra con <kbd>Ctrl</kbd> <kbd>B</kbd> (<kbd>⌘</kbd> <kbd>B</kbd> en macOS).

## Tablas {#tablas}

La columna de la izquierda lista las tablas de un **Esquema**, con **Buscar tablas** arriba y tus **Favoritas** primero. **Nueva tabla** crea una.

![La pantalla Tablas: la lista de tablas a la izquierda y la tabla customers con una fila seleccionada.](tables.webp)

Cada tabla que abres tiene su propia pestaña y tres vistas:

| Pestaña | Qué tienes |
| --- | --- |
| **Datos** | Las filas, página a página, con **Filtrar**, **Ordenar**, **Exportar** e **Importar CSV** en la barra de herramientas. |
| **Estructura** | Columnas, tipos, índices y restricciones. Puedes cambiarlos viendo antes el SQL. |
| **Relaciones** | Las claves foráneas que unen esta tabla con otras. |

Haz doble clic en una celda para editarla. Lo que cambias queda pendiente: una barra cuenta los cambios y ofrece **Ver diff**, **Descartar** y **Guardar**. Nada llega a la base hasta que guardas.

Más en [Explorar tablas](./tables.md), [Editar datos](./editing-data.md), [Filtrar y ordenar](./filter-sort.md) y [Estructura y relaciones](./structure.md).

## Editor SQL {#editor-sql}

Escribe SQL con autocompletado de PostgreSQL. **Ejecutar** lanza la sentencia bajo el cursor (o la selección) y **Ejecutar todo** lanza todas. Los atajos son <kbd>Ctrl</kbd> <kbd>↵</kbd> y <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>↵</kbd> (<kbd>⌘</kbd> en macOS).

![El editor SQL con una consulta y sus resultados debajo.](sql-editor.webp)

Los resultados salen debajo del editor. El panel **Consultas** guarda tus consultas en **Guardadas** y lo que has ejecutado en **Historial**. **Formatear SQL** ordena el texto.

Más en [Editor SQL](./sql-editor.md).

## Paleta de comandos {#paleta}

Pulsa <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> en macOS) desde cualquier sitio. Escribe para saltar a una tabla o a una consulta guardada, cambiar de conexión o lanzar una acción, como cambiar el tema o el idioma.

Pulsa <kbd>?</kbd> para ver todos los atajos de teclado. Más en [Paleta de comandos](./command-palette.md) y [Atajos de teclado](./shortcuts.md).

## Ajustes {#ajustes}

**Ajustes** reúne tus preferencias (idioma, tema, densidad) y, para el administrador, los ajustes del servidor, las conexiones y la cuenta. Un ajuste fijado por una variable de entorno aparece bloqueado. Más en [Pantalla de ajustes](./settings.md).
