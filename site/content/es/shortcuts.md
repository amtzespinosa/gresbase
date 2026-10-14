---
description: Todos los atajos de teclado de Gresbase, globales y locales, en macOS y en Windows o Linux.
---

## Verlos en la app {#in-the-app}

Pulsa <kbd>?</kbd> en cualquier sitio que no sea un campo de texto para abrir **Atajos de teclado**. La paleta de comandos tiene la misma entrada.

## Atajos globales {#global}

Funcionan en cualquier pantalla. Casi todos se desactivan mientras escribes en un campo o un editor; la paleta, la barra lateral, guardar y ejecutar SQL funcionan también ahí.

| macOS | Windows y Linux | Qué hace |
| --- | --- | --- |
| <kbd>⌘</kbd> <kbd>K</kbd> | <kbd>Ctrl</kbd> <kbd>K</kbd> | Abrir la paleta de comandos |
| <kbd>?</kbd> | <kbd>?</kbd> | Ver los atajos de teclado |
| <kbd>⌘</kbd> <kbd>B</kbd> | <kbd>Ctrl</kbd> <kbd>B</kbd> | Plegar o desplegar la barra lateral |
| <kbd>/</kbd> | <kbd>/</kbd> | Buscar en esta vista |
| <kbd>⌥</kbd> <kbd>W</kbd> | <kbd>Alt</kbd> <kbd>W</kbd> | Cerrar la pestaña de la tabla |
| <kbd>⌘</kbd> <kbd>S</kbd> | <kbd>Ctrl</kbd> <kbd>S</kbd> | Guardar los cambios pendientes |
| <kbd>⌘</kbd> <kbd>Z</kbd> | <kbd>Ctrl</kbd> <kbd>Z</kbd> | Deshacer |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> | <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> | Rehacer |
| <kbd>⌘</kbd> <kbd>⌫</kbd> | <kbd>Ctrl</kbd> <kbd>Backspace</kbd> | Poner la celda a NULL |
| <kbd>⌘</kbd> <kbd>↵</kbd> | <kbd>Ctrl</kbd> <kbd>Enter</kbd> | Ejecutar la sentencia bajo el cursor (o la selección) |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>↵</kbd> | <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Enter</kbd> | Ejecutar todas las sentencias |

Cerrar la pestaña de una tabla usa <kbd>Alt</kbd> <kbd>W</kbd> porque los navegadores se reservan <kbd>Ctrl</kbd> <kbd>W</kbd> para cerrar su propia pestaña.

## Teclas locales {#local}

Estas teclas actúan donde está el foco. En macOS, <kbd>⌘</kbd> sustituye a <kbd>Ctrl</kbd>.

### Grid de datos {#grid}

Con una celda enfocada:

| Teclas | Qué hace |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Pasar a la celda de al lado. |
| <kbd>Shift</kbd> + flechas | Ampliar la selección. |
| <kbd>Shift</kbd> + clic | Seleccionar desde la celda activa hasta la del clic. |
| <kbd>Esc</kbd> | Quitar la selección. |
| <kbd>Enter</kbd> o <kbd>F2</kbd> | Editar la celda, si se puede. |
| <kbd>Espacio</kbd> | En una clave foránea, abrir la fila a la que apunta. |
| <kbd>Ctrl</kbd> <kbd>C</kbd> | Copiar la selección como texto separado por tabuladores, listo para una hoja de cálculo. |
| <kbd>Ctrl</kbd> <kbd>V</kbd> | Pegar desde una hoja de cálculo en los cambios pendientes. |
| <kbd>Shift</kbd> + clic en la cabecera de una columna | Añadir esa columna a la ordenación. |

### Editor de celda {#cell-editor}

| Teclas | Qué hace |
| --- | --- |
| <kbd>Enter</kbd> | Dejar el valor en los cambios pendientes. En un editor de varias líneas, <kbd>Ctrl</kbd> <kbd>Enter</kbd>. |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> <kbd>Tab</kbd> | Dejar el valor y editar la celda siguiente o la anterior. |
| <kbd>Esc</kbd> | Descartar lo que has escrito. |
| <kbd>Ctrl</kbd> <kbd>S</kbd> | Dejar el valor y guardar todos los cambios pendientes. |

### Menús contextuales {#context-menus}

<kbd>Shift</kbd> <kbd>F10</kbd> o la tecla <kbd>Menú</kbd> abren el menú contextual del elemento enfocado, como un clic derecho. Funciona en la lista de tablas, en el grid y en las consultas guardadas.

En el grid, con una celda enfocada, abren **Copiar**, **Copiar como CSV**, **Copiar como JSON**, **Copiar como INSERT** y **Pegar**.

### Editor SQL {#sql-editor}

| Teclas | Qué hace |
| --- | --- |
| <kbd>F2</kbd> sobre una pestaña | Renombrar la pestaña. |
| Clic central sobre una pestaña | Cerrar la pestaña. |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> en el timeout | Aplicar o cancelar el nuevo límite por sentencia. |
| <kbd>↑</kbd> <kbd>↓</kbd> sobre el separador | Cambiar el tamaño del editor y los resultados. |
| <kbd>Esc</kbd> al renombrar una consulta guardada | Cancelar el cambio de nombre. |

### Lista de tablas {#table-list}

Con el tirador del borde de la lista enfocado:

| Teclas | Qué hace |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | Estrechar o ensanchar la lista. |
| <kbd>Inicio</kbd> / <kbd>Fin</kbd> | Ir al ancho mínimo o al máximo. |

Un doble clic en el tirador vuelve al ancho por defecto.
