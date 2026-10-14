# Gresbase — Especificación funcional

Gresbase es el estudio para cualquier Postgres: una imagen Docker, cero variables obligatorias
(configúrala por variables de entorno o desde el asistente) y una interfaz al nivel de Supabase Studio.
Este documento lista todo lo que tendrá la app y en qué fase.

> Leyenda: **[v0.1]** MVP · **[v0.1.1]** mejoras tras el MVP · **[v0.2]** compatibilidad, acceso y
> configuración · **[v0.3]** pulido del producto base · **[v0.4]** edición Studio · **[v0.5]**
> administración · **[v0.6]** equipos · **[después]** producto. La versión actual cubre hasta lo marcado
> como [v0.3].

## Principios

- Instalación tipo Adminer: se añade al compose y funciona en segundos.
- Cero variables obligatorias: configúrala por variables de entorno o desde el asistente de primer
  arranque. Lo que fija una variable de entorno manda y no se puede cambiar desde la UI.
- Estética cuidada: barra lateral en tarjeta flotante y plegable, sin barra superior, claro/oscuro,
  acento amarillo `#FFC929`, Geist y Geist Mono, logo del mamut monolínea.
- Seguro por defecto: cambios revisables antes de guardar, deshacer, confirmaciones según el riesgo.
- Rápido y usable con teclado: atajos y paleta ⌘K.
- Solo Postgres (versiones en la tabla de abajo). Sin telemetría de producto.
- Inglés y español desde el principio.
- **Modo básico / avanzado:** el básico muestra Tablas y Editor SQL. El avanzado añade Esquema, Métricas,
  Roles, Extensiones… El selector aparece en v0.4 (edición Studio); antes no se muestra.

## Roadmap

| Versión | Tema | Estado |
| --- | --- | --- |
| v0.1 | MVP + endurecimiento: despliegue, shell con temas e idiomas, login, tablas y editor de datos, escritura segura completa, estructura en lectura, editor SQL con historial, guardadas y modo transacción, CSV a tabla existente y exportación; selects propios y fijado de columnas y filas (v0.1.1) | Hecho |
| v0.2 | Compatibilidad, acceso y configuración: Postgres 12–19, capacidades por versión, capa de configuración, cuentas locales, gestor de conexiones, asistente de primer arranque, modo libre tipo Adminer, conexiones guardadas, Ajustes | Hecho |
| v0.3 | Pulido del producto base: rendimiento, edición de estructura, personalizar columnas, pegar desde hoja de cálculo, pestañas y favoritas, pestañas y parámetros SQL | Hecho (primera versión pública) |
| v0.4 | Edición Studio: modo avanzado, esquema visual, métricas, EXPLAIN visual; imágenes `gresbase` y `gresbase-studio` desde el mismo código | Siguiente |
| v0.5 | Administración: roles, extensiones, vistas, funciones, triggers, RLS, enums, backups | Futuro |
| v0.6 | Equipos: multiusuario con roles, invitaciones, permisos por conexión, SSO/OIDC, auditoría | Futuro |
| v1.0 | Estabilidad: formatos de datos y API estables, etiqueta mayor de la imagen | Futuro |
| Ideas | Otros motores (MySQL, MariaDB, SQLite), soporte de `pgvector`, BaaS open source | Sin fecha |

## Versiones de Postgres

| Postgres | Nivel de soporte |
| --- | --- |
| 14, 15, 16, 17, 18 | Completo, CI local en cada cambio |
| 19 | Completo; CI local contra la última beta/RC hasta su salida, luego contra `19` |
| 12, 13 | Heredado: CI local en cada cambio, funciones limitadas por capacidades y aviso de versión sin soporte |
| ≤ 11 | No soportado: la app lo detecta al conectar y lo explica |

## Despliegue [v0.1]

Imagen multi-arch (amd64, arm64) con un binario Go que embebe el frontend; también binario suelto.

```yaml
gresbase:
  image: ghcr.io/OWNER/gresbase:latest
  ports:
    - "127.0.0.1:8080:8080"
  environment:
    DATABASE_URL: postgres://user:pass@db:5432/app
  volumes:
    - gresbase-data:/data   # opcional: consultas guardadas y preferencias
```

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | vacía | Conexión a Postgres (respeta `sslmode`). Obligatoria en v0.1. Desde v0.2 es opcional: si existe, es una conexión más de la lista, bloqueada; si no, la app arranca el asistente o el modo libre |
| `GRESBASE_PORT` | `8080` | Puerto HTTP |
| `GRESBASE_BASE_PATH` | `/` | Ruta base detrás de proxy (p. ej. `/gresbase`) |
| `GRESBASE_USER` / `GRESBASE_PASSWORD` | vacías | Si ambas existen, se activa el login |
| `GRESBASE_SESSION_SECRET` | generado | Firma de cookies. Si no existe, se genera y se guarda cifrado en `gresbase.json` (con volumen, las sesiones sobreviven a reinicios) [v0.2] |
| `GRESBASE_SESSION_TTL` | `12h` | Duración de la sesión |
| `GRESBASE_ALLOWED_HOSTS` | vacía | Hosts extra aceptados sin login (además de localhost) |
| `GRESBASE_TRUSTED_PROXIES` | vacía | IP o CIDR de proxies inversos cuyo `X-Forwarded-For` da el cliente para el límite de intentos |
| `GRESBASE_READ_ONLY` | `false` | Bloquea toda escritura |
| `GRESBASE_STATEMENT_TIMEOUT` | `30s` | Límite por consulta |
| `GRESBASE_IMPORT_TIMEOUT` | `10m` | Límite de una importación CSV (sustituye al límite por consulta; se cancela si el cliente se desconecta) [v0.1.1] |
| `GRESBASE_SQL_MAX_ROWS` | `1000` | Límite de filas por defecto de un resultado del editor SQL (1–100000; se aplica sin reiniciar) [v0.2] |
| `GRESBASE_MAX_CONNS` | `10` | Tamaño máximo de cada pool |
| `GRESBASE_MAX_POOLS` | `20` | Máximo de pools abiertos a la vez (uno por conexión en uso) [v0.2] |
| `GRESBASE_POOL_IDLE_TIMEOUT` | `10m` | Cierra el pool de una conexión tras este tiempo sin uso (nunca el de `DATABASE_URL`) [v0.2] |
| `GRESBASE_DATA_DIR` | `/data` | Consultas guardadas y ajustes (`gresbase.json`) |
| `GRESBASE_LANG` | `en` | Idioma por defecto: `en` o `es` |
| `GRESBASE_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `GRESBASE_LOG_FORMAT` | `text` | `text` o `json` |
| `GRESBASE_SECRET_KEY` | vacía | Clave para cifrar los secretos guardados; sin ella se genera `GRESBASE_DATA_DIR/secret.key` [v0.2] |
| `GRESBASE_SETUP_TOKEN` | aleatorio en el log | Token del asistente para peticiones que no llegan desde localhost [v0.2] |
| `GRESBASE_MODE_FREE` | `false` | Fuerza el modo libre tipo Adminer [v0.2] |
| `GRESBASE_DB_HOST` / `GRESBASE_DB_PORT` | vacías | Fijan servidor y puerto en los formularios de conexión (asistente y modo libre) [v0.2] |
| `GRESBASE_DB_NAME` / `GRESBASE_DB_USER` | vacías | Fijan base de datos y usuario en esos formularios; con servidor, base y usuario fijados, el modo libre solo pide la contraseña |
| `GRESBASE_ALLOWED_DB_HOSTS` | vacía | Hosts o CIDR permitidos como destino en el modo libre [v0.2] |
| `GRESBASE_MAX_SESSIONS` | `10` | Sesiones simultáneas en el modo libre [v0.2] |

- Arranque: valida la conexión con reintentos (hasta 30 s) y explica el fallo (host, credenciales, SSL,
  base inexistente).
- `/healthz` para el healthcheck del compose; subcomando `gresbase healthcheck` para imágenes sin shell.
- Logs estructurados, sin credenciales nunca.
- Sin volumen todo funciona; la UI avisa de que las consultas guardadas se perderán al recrear el
  contenedor.
- **[v0.3]** Publicación en GHCR con etiquetas semver y `latest` y binarios con GoReleaser; Docker Hub, más adelante.
  Hasta entonces no se publica nada (ver `docs/decisions.md`).

## Configuración y acceso [v0.2]

- **Capa de configuración:** cada clave se resuelve con su origen: variable de entorno > fichero
  `GRESBASE_DATA_DIR/gresbase.json` > valor por defecto. Lo que fija una variable de entorno queda
  bloqueado en la UI y en la API. Fichero versionado, escritura atómica, permisos `0600`; secretos
  cifrados con AES-GCM (`GRESBASE_SECRET_KEY` o `secret.key` generada). Sin volumen escribible, en
  memoria y con aviso. Claves del fichero: idioma, duración de sesión, hosts permitidos, solo lectura,
  timeouts y tamaño del pool; `GET`/`PATCH /api/v1/settings` (solo administradores) con origen,
  `locked` (`409 locked_by_env`) y `restart_required` para lo que se aplica al reiniciar.
- **Cuentas locales:** administrador guardado en la configuración con hash argon2id, creado desde el
  asistente; `GRESBASE_USER`/`GRESBASE_PASSWORD` mandan si existen. Cambio de contraseña que cierra las
  demás sesiones. Un solo administrador (modelo preparado para varios).
- **Gestor de conexiones:** un pool perezoso por conexión (cierre por inactividad, límites); caché de
  introspección, transacciones, deshacer y capacidades por conexión. Orígenes `env`, `saved` y `adhoc`.
- **Capacidades por versión:** la app sabe qué ofrece cada versión de Postgres, oculta o deshabilita lo
  que no existe y avisa en versiones heredadas o pre-release; con ≤ 11 explica que no está soportada.
- **Asistente de primer arranque:** sin configuración ni `DATABASE_URL`, todas las rutas llevan al
  asistente (bienvenida, modo, cuenta de administrador, conexión con "Probar conexión", listo). Fuera de
  localhost exige un token de setup. Se desactiva al completarlo.
- **Modo libre tipo Adminer:** pantalla de conexión con credenciales de Postgres que no se guardan (la
  contraseña solo vive en memoria del servidor); recientes sin contraseña en el navegador; hosts
  permitidos y límites de sesiones e intentos.
- **Conexiones guardadas:** CRUD con color de etiqueta, contraseña cifrada y solo lectura por conexión;
  selector en la tarjeta de conexión y en ⌘K; rutas con la conexión (`/c/$connectionId/…`), así que dos
  pestañas pueden usar conexiones distintas.
- **Ajustes:** General, Conexiones, Seguridad, Editor SQL y Acerca de; cada campo muestra su origen y un
  candado si lo fija una variable de entorno.

## Shell de la app

- **[v0.1]** Barra lateral en tarjeta flotante: logo, buscador ⌘K, navegación (Tablas, Editor SQL),
  tarjeta de conexión (base, host, versión, estado), tema, ajustes.
- **[v0.1]** Barra plegada a 64 px: solo iconos y logo arriba, con tooltips; ⌘B; el estado se recuerda.
- **[v0.1]** Paleta ⌘K: saltar a tablas y consultas guardadas, acciones (nueva consulta, tema, idioma,
  plegar barra, ajustes, cerrar sesión).
- **[v0.1]** URLs con estado: cada vista con su enlace, incluidos filtros, orden y pestaña.
- **[v0.1]** Temas claro, oscuro y automático; brillo neón del logo solo en oscuro.
- **[v0.1]** Idioma inglés/español: switch con banderas 🇬🇧 EN / 🇪🇸 ES en login, ajustes y paleta;
  por defecto `GRESBASE_LANG`; la elección del usuario se recuerda.
- **[v0.1]** Atajos: ⌘K paleta, ⌘↵ ejecutar, ⌘S guardar (según contexto), ⌘Z/⌘⇧Z deshacer/rehacer,
  ⌘B plegar barra, `/` buscar en la vista, `?` ayuda de atajos. En Windows/Linux, Ctrl en lugar de ⌘.
- **[v0.1]** Notificaciones discretas abajo, con acción de deshacer cuando aplica.
- **[v0.1]** Estados vacíos y errores claros, con el error de Postgres completo desplegable.
- **[v0.1]** Usable en tablet; en móvil, consulta y lectura.
- **[v0.4]** Selector de modo básico/avanzado.

## Tablas

**Navegador**
- **[v0.1]** Selector de esquema, buscador, número aproximado de filas.
- **[v0.1]** Tablas, vistas, vistas materializadas, tablas foráneas y particionadas con icono distinto.
- **[v0.3]** Favoritas, recientes y pestañas de tablas abiertas.

**Editor de datos**
- **[v0.1]** Grid virtualizado; cabeceras con nombre, tipo, PK y FK.
- **[v0.1]** Paginación keyset con PK y offset sin PK; tamaño de página 50/100/200.
- **[v0.1]** Filtros como chips, operadores por tipo (=, ≠, <, ≤, >, ≥, contiene, empieza por, es nulo,
  no es nulo, en lista, entre, JSON contiene), combinación Y/O.
- **[v0.1]** Orden por varias columnas (shift+clic).
- **[v0.1]** Edición inline por tipo: texto, número, booleano, fecha/hora, enum, JSON, arrays, NULL.
- **[v0.1]** Panel lateral para ver/editar una fila completa e insertar filas con defaults visibles.
- **[v0.1]** Selección múltiple y borrado; duplicar fila.
- **[v0.1]** Recuento exacto bajo demanda.
- **[v0.1]** Tablas sin PK: solo lectura con explicación.
- **[v0.1]** Valores largos truncados con vista completa; binarios como tamaño.
- **[v0.1]** Ver el SQL equivalente y abrirlo en el editor SQL.
- **[v0.1.1]** Fijar columnas: candado en la cabecera; se quedan a la izquierda al hacer scroll
  horizontal, en el orden en que se fijaron. La columna de selección va siempre fijada.
- **[v0.1.1]** Fijar filas (solo tablas con PK): candado en la columna de selección; se quedan bajo la
  cabecera al hacer scroll y al cambiar de página, filtrar u ordenar. Se pueden editar como las demás.
  Se recuerdan por tabla en el navegador; "Desfijar todo" en la toolbar.
- **[v0.3]** Mostrar/ocultar/reordenar columnas y anchos; copiar y pegar desde hoja de cálculo.
- **[después]** Búsqueda rápida en toda la tabla.

## Estructura y relaciones

- **[v0.1]** Pestaña Estructura (lectura): columnas (tipo, nulos, default, identidad/generada,
  comentario), índices (definición, tamaño, uso), constraints, FKs con acciones, triggers, tamaños,
  DDL copiable.
- **[v0.1]** Pestaña Relaciones: tablas a las que apunta y que la referencian.
- **[v0.1]** Clic en celda FK: panel lateral con la fila referenciada y "abrir tabla"; desde una fila,
  ver quién la referencia.
- **[v0.3]** Edición de estructura con UI (crear/renombrar/eliminar tablas, columnas, índices,
  constraints, FKs) mostrando el SQL y si bloquea o reescribe.

## Editor SQL

- **[v0.1]** CodeMirror 6: resaltado, autocompletado de esquemas, tablas, columnas, funciones y palabras
  clave; formatear; comentar; buscar y reemplazar.
- **[v0.1]** ⌘↵ ejecuta la sentencia bajo el cursor o la selección; ejecutar todo; cancelar.
- **[v0.1]** Resultados en grid; varias sentencias en pestañas de resultado; filas afectadas y tiempo;
  errores con posición marcada en el editor.
- **[v0.1]** Exportar resultados a CSV y JSON; copiar como tabla Markdown.
- **[v0.1]** Modo transacción: ejecuta dentro de `BEGIN`, muestra filas afectadas, Confirmar o Revertir;
  revierte solo si se abandona o caduca.
- **[v0.1]** Historial en el navegador, buscable.
- **[v0.1]** Consultas guardadas como `.sql` en `/data/snippets`, con carpetas.
- **[v0.1]** `statement_timeout` visible; límite de filas devueltas (1.000 por defecto) con aviso.
- **[v0.3]** Varias pestañas de consulta y parámetros `:variable` enviados como parámetros enlazados.
- **[v0.4]** EXPLAIN visual.

## Escritura segura [v0.1]

**Cola de cambios:** ediciones, inserciones y borrados del grid quedan pendientes y tintados; píldora con
contador, Ver diff, Descartar y Guardar (⌘S); el diff muestra antes/después y el SQL; se guarda en una
transacción; aviso al salir con cambios pendientes.

**Deshacer:** ⌘Z/⌘⇧Z sobre la cola antes de guardar; después de guardar, aviso "Guardado · Deshacer" y
⌘Z mientras sigas en la tabla, ejecutando la operación inversa con comprobación de conflictos. Sin
deshacer cuando no es fiable (cascadas, triggers, etc.), y se dice antes de guardar.

**Confirmaciones graduadas:**

| Acción | Confirmación |
| --- | --- |
| Borrar filas en el grid | El diff de la cola |
| Borrado con `ON DELETE CASCADE` / `SET NULL` | Modal con el impacto real por tabla |
| Vaciar (`TRUNCATE`) o eliminar (`DROP`) tabla | Modal escribiendo el nombre de la tabla |
| SQL destructivo en el editor | Modal con la sentencia; en modo transacción, filas afectadas antes de confirmar |

**Límites:** modo solo lectura en dos capas con distintivo visible; `statement_timeout` en todo.

## Autenticación y seguridad

- **[v0.1]** Login opcional por variables; pantalla con el estilo de la app y switch de idioma.
- **[v0.1]** Sin login, solo se aceptan peticiones con `Host` local (o `GRESBASE_ALLOWED_HOSTS`); aviso
  visible en la UI y en el log de arranque.
- **[v0.1]** Cookie firmada `HttpOnly`, `SameSite=Strict`, caducidad configurable, cerrar sesión.
- **[v0.1]** Límite de intentos de login; cabeceras de seguridad; cabecera anti-CSRF.
- **[v0.1]** Detrás de proxy: `X-Forwarded-*` y ruta base.
- **[v0.6]** Varios usuarios con roles, invitaciones, permisos por conexión; SSO/OIDC; auditoría.

## Import y export

- **[v0.1]** Exportar tabla o vista filtrada a CSV o JSON, en streaming.
- **[v0.1]** Importar CSV a tabla existente: vista previa, mapeo de columnas, separador y cabecera,
  validación, transacción, informe de errores por fila.
- **[v0.5]** Importar a tabla nueva, exportar DDL de esquema/base, backups con `pg_dump`.

## Esquema visual [v0.4]

Diagrama ER con tarjetas por tabla, líneas entre columnas relacionadas, auto-organizar, resaltar
relaciones, filtrar, zoom y minimapa, exportar SVG/PNG/Mermaid.

## Métricas [v0.4]

Dashboards tipo Supabase con muestreo cada pocos segundos (24 h en memoria, opcional en `/data`):
visión general (tamaño, conexiones, TPS, cache hit), tablas, consultas (`pg_stat_statements`), actividad
y bloqueos (cancelar/terminar), índices, replicación.

## Administración [v0.5]

Roles y permisos, extensiones, vistas y materializadas, funciones, triggers, RLS, enums, esquemas,
`pg_settings`. (Las varias conexiones llegan antes, en v0.2.)

## Futuro [después]

Gresbase Cloud, BaaS, Evidence Mode (auditoría), asistente SQL. Implicación hoy: toda escritura pasa por
un único punto (`internal/pg/write`) que emite un evento a una interfaz `ChangeRecorder` (no-op en v0.1).

## Fuera de alcance

Hosting de bases y telemetría de producto sin opt-in. Otros motores solo como idea sin fecha (ver Roadmap).
