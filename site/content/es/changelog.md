---
description: Qué cambió en cada versión de Gresbase, de la más reciente a la más antigua.
---

:::note
La v0.3.0 es la primera versión pública; la v0.1.0 y la v0.2.0 nunca se publicaron.
:::

## v0.4.1 (2026-10-21) {#v0-4-1}

Un arreglo al volver a entrar en modo libre.

### Arreglos {#v0-4-1-fixed}

- Modo libre: al volver a entrar tras caducar la sesión se abría la página anterior sobre la conexión de la sesión terminada y no se veía la base hasta salir y entrar otra vez. Un enlace, un marcador o la página de vuelta con una conexión que ya no existe abren ahora la misma pantalla sobre la conexión de la sesión.

### Cambios {#v0-4-1-changed}

- La imagen se describe sola: sus etiquetas llevan una descripción, el enlace a la documentación y la licencia, que se ven en su página del registro y con `docker inspect`.

## v0.4.0 (2026-10-14) {#v0-4-0}

**Buscar en todas las tablas a la vez.** Escribe un término y Gresbase lo busca en todas las tablas que el rol puede leer, y en los nombres de tablas, vistas y columnas. Los resultados llegan tabla a tabla según responde cada una, y una fila abre su tabla filtrada a ella, con la columna que coincide resaltada. Consulta [Buscar en todas las tablas](./global-search.md).

### Novedades {#v0-4-0-added}

- [Búsqueda global](./global-search.md): un término en todas las tablas que el rol puede leer, y en los nombres de tablas, vistas y columnas. Los resultados llegan tabla a tabla y se pueden cancelar. Una fila abre su tabla filtrada a ella, con la columna que coincide resaltada. Funciona en solo lectura, en modo libre y detrás de un proxy.

### Cambios {#v0-4-0-changed}

- La edición Studio pasa a la v0.5 en la hoja de ruta.
- El editor de celda es la propia celda: más grande que las vecinas, con fondo claro, un borde de acento de 2 px con las esquinas redondeadas y sin un campo dentro.
- Cerrar sesión pregunta antes, y avisa si se perderían cambios sin guardar del grid o se revertiría una transacción SQL abierta.

## v0.3.0 (2026-10-14) {#v0-3-0}

Pulido del producto base y arreglos de usarlo en proyectos reales.

### Novedades {#v0-3-0-added}

- Edición de estructura: crear tablas, y añadir, renombrar, cambiar de tipo o borrar columnas. También índices, restricciones únicas y de check, y claves foráneas. Cada cambio enseña el SQL exacto y sus avisos antes de ejecutarse. Para borrar hay que escribir el nombre.
- Columnas: ocultar, reordenar, cambiar de ancho y restablecer la vista. Se guardan por conexión y tabla, junto con las columnas y filas fijadas.
- Selección rectangular, copiar como TSV, CSV, JSON o `INSERT`, y pegar desde una hoja de cálculo en la cola de cambios.
- Pestañas de tablas, favoritos y recientes por conexión, también en la paleta de comandos.
- Pestañas del editor SQL por conexión, y parámetros `:nombre` enviados como parámetros enlazados.
- Pantalla de ajustes con secciones de general, conexiones, seguridad, editor SQL y acerca de. Los ajustes fijados por variables de entorno quedan bloqueados.
- Selección de filas con un clic, lista de tablas con ancho ajustable, y menús contextuales en la lista de tablas, el historial SQL y las consultas guardadas.
- Modo libre: consultas guardadas privadas para cada usuario y servidor, y un menú de sesión con **Cambiar de conexión** y **Desconectar**.
- `GRESBASE_DB_NAME` y `GRESBASE_DB_USER` fijan la base de datos y el usuario de los formularios de conexión. Con servidor, base y usuario fijados, el modo libre solo pide la contraseña.
- `GRESBASE_TRUSTED_PROXIES`: detrás de esos proxies, el límite de inicio de sesión usa la IP de cada cliente.
- Token de configuración: el log trae un enlace `/setup#token=…` listo, y `gresbase setup-token` imprime el token dentro del contenedor.
- Las consultas SQL, importaciones CSV y cambios de estructura largos siguen vivos detrás de Nginx o Cloudflare, sin subir ningún timeout del proxy.

### Cambios {#v0-3-0-changed}

- La mitad de JavaScript inicial (510 → 275 KB gzip): las pantallas pesadas se cargan al abrirlas. Arreglos de maquetación en tableta.
- Un valor escrito que no cabe en su columna ahora bloquea el guardado, en vez de fallar en el servidor.
- Las tablas con clave primaria muestran primero las filas más nuevas.
- Licencia Apache 2.0.

### Arreglos {#v0-3-0-fixed}

- La línea activa tapaba la selección del editor SQL.
- El editor de celda tiene un solo borde de acento, las dos banderas de idioma miden lo mismo y el pie del panel de fila queda abajo.
- El fallo de conexión `host_not_allowed` tiene su propio mensaje.
- Un `GRESBASE_DATA_DIR` relativo ya no muestra el aviso de datos que no se conservan.

### Seguridad {#v0-3-0-security}

- Un rol con `default_transaction_read_only` podía levantarlo desde el editor SQL. Ahora el editor trata ese rol como de solo lectura.
- El límite de inicio de sesión solo cuenta los intentos fallidos.
- El aviso de datos que no se conservan detecta ahora un volumen anónimo, la capa del contenedor y tmpfs, y dice cuándo se perderían los datos.

## v0.2.0 (sin publicar) {#v0-2-0}

Compatibilidad, acceso y configuración.

### Novedades {#v0-2-0-added}

- PostgreSQL 12 a 19, con capacidades por versión. Avisos para servidores heredados y previos a su salida, y rechazo claro de la 11 y anteriores.
- Ninguna variable obligatoria: ajustes en `gresbase.json`, con los secretos cifrados. Las variables de entorno mandan sobre el fichero, y el fichero sobre los valores por defecto.
- Cuenta de administrador local y cambio de contraseña que cierra las demás sesiones.
- Gestor de conexiones: un pool por conexión, y los pools inactivos se cierran.
- Asistente de configuración en el primer arranque, protegido con un token de setup salvo que la petición sea local.
- Modo libre, como Adminer (`GRESBASE_MODE_FREE`), con `GRESBASE_ALLOWED_DB_HOSTS` y límite de sesiones.
- Conexiones guardadas con etiquetas de color, selector en la tarjeta de conexión y en <kbd>⌘</kbd> <kbd>K</kbd>, y una conexión por pestaña del navegador.

### Correcciones {#v0-2-0-fixed}

- El detector de SQL destructivo avisa con `MERGE … THEN DELETE/UPDATE` y con un `WHEN NOT MATCHED BY SOURCE` sin condición.
- Cancelar una consulta mientras esperaba una conexión del pool no tenía efecto.
- El tiempo de inactividad de los pools usaba el reloj de pared.
- Los contenedores de test ya no se atascan cuando el disco va justo.

## v0.1.0 (2026-10-10, sin publicar) {#v0-1-0}

Primera versión (MVP).

### Novedades {#v0-1-0-added}

- Una imagen y un binario con el frontend dentro. Configuración por variables de entorno, `/healthz` y `gresbase healthcheck`.
- Barra lateral flotante y plegable, temas claro, oscuro y automático, inglés y español, y el estado guardado en la URL.
- Inicio de sesión opcional con cookies firmadas, límite de intentos, cabecera CSRF y guardia de `Host` cuando no hay inicio de sesión.
- Explorador de tablas y grid de datos: filtros, orden por varias columnas, paginación por keyset, recuento exacto, valores largos y binarios, y el SQL equivalente.
- Edición segura: cola de cambios con diff, una transacción por guardado, detección de conflictos, deshacer y rehacer, impacto en cascada y confirmación escrita para vaciar o borrar una tabla.
- Pestañas de estructura y relaciones, DDL generado, saltos por clave foránea y «referenciada por».
- Editor SQL: autocompletado, ejecutar una sentencia o todas, cancelar, posición del error, transacciones, confirmación del SQL destructivo, historial y consultas guardadas.
- Paleta de comandos (<kbd>⌘</kbd> <kbd>K</kbd>) y ayuda de atajos de teclado.
- Exportación a CSV y JSON en streaming, e importación de CSV a tablas existentes con informe de errores por fila.
- Modo solo lectura en dos capas.
- Columnas y filas fijadas, guardadas por tabla en el navegador.

### Refuerzos antes de publicar {#v0-1-0-hardening}

- La exportación a CSV ejecuta una consulta parametrizada y escribe el CSV en Go.
- Una transacción SQL abierta se deshace al salir de la página. Al cargar, el editor ofrece continuar o deshacer las que siguen abiertas.
- La importación de CSV tiene su propio timeout (`GRESBASE_IMPORT_TIMEOUT`, `10m` por defecto) y se para si el cliente se desconecta.
- El autocompletado SQL sugiere columnas sin cualificar de las tablas de la sentencia actual.
- El DDL generado incluye las secuencias de las columnas `serial` y su `OWNED BY`.
- Tema oscuro: el texto atenuado llega a un contraste de 4,5:1 en las celdas editadas.

La lista completa está en [CHANGELOG.md](https://github.com/amtzespinosa/gresbase/blob/main/CHANGELOG.md).
