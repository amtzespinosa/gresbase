---
description: Salta a cualquier tabla o consulta guardada, cambia de conexión y lanza las acciones habituales desde el teclado.
---

## Ábrela {#open}

Pulsa <kbd>⌘</kbd> <kbd>K</kbd> (<kbd>Ctrl</kbd> <kbd>K</kbd> en Windows y Linux). Funciona en toda la app, también mientras escribes en un campo o en el editor SQL. Vuelve a pulsarlo para cerrarla.

También puedes pulsar **Buscar**, arriba en la barra lateral.

Escribe para filtrar, muévete con las flechas y pulsa <kbd>↵</kbd> para elegir. <kbd>Esc</kbd> cierra la paleta. Si nada coincide, dice **No hay coincidencias.**

## Qué muestra {#groups}

Las tablas y consultas son de la conexión abierta en la pestaña actual del navegador. Cada grupo solo aparece si tiene algo.

| Grupo | Qué contiene |
| --- | --- |
| **Buscar «término» en todas las tablas** | Aparece en cuanto escribes dos caracteres. Abre [la búsqueda global](./global-search.md) con lo que has escrito. |
| **Recientes** | Las últimas tablas y consultas guardadas que abriste en esta conexión, hasta 6. Lo que ya no existe desaparece. |
| **Favoritas** | Las tablas que marcaste con **Añadir a favoritas** en esta conexión. |
| **Tablas** | Tablas, vistas, vistas materializadas y tablas foráneas de todos los esquemas, salvo los del sistema. Las particiones no salen: se llega a ellas desde su tabla padre. |
| **Consultas guardadas** | Tus consultas guardadas: las de todas las conexiones y las de esta. |
| **Conexiones** | Una entrada **Cambiar a** por cada otra conexión guardada. Abre esa conexión en esta pestaña. |
| **Acciones** | Comandos, más abajo. |

Recientes y favoritas se guardan en este navegador. En [modo libre](./free-mode.md), **Consultas guardadas** lista las tuyas, que son privadas.

Solo el administrador recibe la lista de conexiones guardadas, así que solo él ve el grupo **Conexiones**. Mira [Conexiones guardadas](./connections.md).

## Acciones {#actions}

| Acción | Qué hace |
| --- | --- |
| **Nueva consulta** | Abre una pestaña nueva en el editor SQL. |
| **Tema: Claro**, **Tema: Oscuro**, **Tema: Automático** | Cambia el tema. **Automático** sigue al sistema. |
| **Idioma: English**, **Idioma: Español** | Cambia el idioma de la interfaz. |
| **Plegar o desplegar la barra lateral** | Igual que <kbd>⌘</kbd> <kbd>B</kbd> (<kbd>Ctrl</kbd> <kbd>B</kbd> en Windows y Linux). |
| **Ajustes** | Abre la pantalla de ajustes. |
| **Atajos de teclado** | Abre la lista de atajos, igual que <kbd>?</kbd>. |
| **Cerrar sesión** | Solo si hay inicio de sesión. |

El tema y el idioma que elijas se recuerdan en este navegador. Mira [Idioma y tema](./preferences.md).

Tienes todos los atajos en [Atajos de teclado](./shortcuts.md).
