# Gresbase — Registro de decisiones

Formato: fecha · título · contexto · decisión · alternativa descartada. La más reciente arriba.

---

### 2026-10-14 · Búsqueda global en la v0.4; Studio pasa a la v0.5
- **Contexto:** la búsqueda global, diseñada para después de publicar, se convierte en la siguiente
  versión.
- **Decisión:** v0.4 es la búsqueda global y cada versión siguiente sube una (Studio v0.5, administración
  v0.6, equipos v0.7). Los datos se buscan en el servidor y se envían por partes (NDJSON por tabla); los
  nombres, en el navegador con las completions que ya están cargadas. Los tipos exactos se comparan con el
  término convertido al tipo base (`$n::text::numeric`), no al de la columna, para que un `numeric(10,2)`
  no desborde.
- **Descartado:** buscar los nombres en el servidor (una consulta más para algo que el navegador ya tiene);
  WebSockets o sondeo para el progreso (una respuesta en streaming basta y pasa por los proxies).

### 2026-10-14 · La primera versión pública es la v0.3.0
- **Contexto:** el plan era no publicar nada hasta la v1.0.
- **Decisión:** la v0.3.0 es la primera versión pública. El repositorio público recibe una exportación del
  árbol de trabajo por versión; en él, `ci.yml` corre en cada push y pull request y `release.yml` publica
  binarios e imagen en GHCR al subir un tag `v*`.
- **Descartado:** esperar a la v1.0.

### 2026-10-14 · Latidos para las peticiones largas detrás de un proxy
- **Contexto:** Nginx corta a los 60 s sin respuesta y Cloudflare a los 100 s sin que empiece; la
  documentación pedía subir `proxy_read_timeout`.
- **Decisión:** `api.Heartbeat` en `sql/execute`, importación y estructura: sin respuesta a los 10 s, envía
  `200` y un espacio cada 10 s; un error posterior viaja como `200` con el cuerpo `{"error": …}`, que
  `api()` trata como error.
- **Descartado:** ejecución en segundo plano con sondeo (más código y estado por endpoint; se puede
  añadir si hace falta sobrevivir a una recarga).

### 2026-10-11 · Fila seleccionada con un clic, en gris; el amarillo solo para cambios
- **Contexto:** para el uso diario se pide seleccionar filas con un clic (Ctrl/Cmd+clic y Mayús+clic),
  resaltadas en gris medio, dejando el amarillo para los cambios pendientes.
- **Decisión:** es la misma selección que los checkboxes (`useTableEditing`), así que "Borrar N filas"
  actúa sobre ella; en tablas de solo lectura la selección solo resalta. Mayús+clic selecciona el rango
  desde la última fila pulsada (sin Ctrl reemplaza la selección; con Ctrl la amplía) y además sigue
  extendiendo el rectángulo de celdas de B14; arrastrar solo selecciona celdas. Colores: `--row-selected`
  (`#DEDBD4` / `#34332F`); dentro de una fila seleccionada se redefinen `--accent-tint` (amarillo opaco
  `#ECD38C` / `#61542E`), `--muted` y `--accent-ink` (variantes que mantienen 4,5:1), con un selector
  `[data-row-selected]` en vez de clases por celda. El botón "Borrar filas" está siempre en la barra
  (desactivado sin selección): al aparecer con el primer clic hacía saltar de línea la barra y el grid se
  movía bajo el puntero (rompía el doble clic para editar).
- **Descartado:** un gris más oscuro con `--muted` sin cambiar (no llega a 4,5:1 en claro); un tinte
  amarillo semitransparente sobre el gris (en oscuro el texto secundario baja de 3:1); mostrar el botón
  solo con selección por checkbox (serían dos selecciones distintas).

### 2026-10-11 · Licencia Apache 2.0, marca aparte y licencias de terceros generadas
- **Contexto:** Gresbase se publica bajo Apache 2.0.
- **Decisión:** `LICENSE` es el texto oficial descargado de apache.org (sha256 `cfc7749b…3d30`, idéntico
  al que traen los módulos Apache de la caché de Go). `NOTICE`: "Gresbase", "Copyright 2026 Alex M.
  Espinosa"; no hay código de terceros adaptado (revisado: ni postgres-meta ni otros), así que no lleva
  atribuciones de código, solo la referencia a los avisos de terceros. `TRADEMARKS.md`: el nombre y el
  logo del mamut no se licencian; los forks usan otro nombre y logo. `scripts/licenses.mjs` (`task
  licenses`) genera `docs/third-party-licenses.md` y `web/public/licenses/` (`LICENSE.txt`, `NOTICE.txt`,
  `THIRD_PARTY_NOTICES.txt` con el texto completo de cada licencia) a partir de `go list -deps
  ./cmd/gresbase` y `pnpm licenses list --prod`; falla si una licencia no está en la lista de compatibles
  (MIT, ISC, 0BSD, BSD-2/3, Apache-2.0, Unlicense, CC0-1.0, Python-2.0, BlueOak, MPL-2.0, OFL-1.1) y
  `task lint`/`ci:quick` comprueban que está al día. Al estar en `web/public`, Vite los copia al `dist`
  embebido: el binario los sirve en `/licenses/…` y Ajustes → Acerca de enlaza a ellos (sustituye la
  lista a mano de B09). La imagen (ambos Dockerfiles) los copia a `/licenses/` y los archivos de
  GoReleaser incluyen `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `README.md` y `THIRD_PARTY_NOTICES.txt`.
  Resultado de la auditoría: 142 componentes, todos compatibles (sin GPL/LGPL/AGPL ni desconocidas).
- **Descartado:** `go-licenses` (otra herramienta en el contenedor para 10 módulos cuyos textos se
  reconocen con tres patrones); un subcomando `gresbase licenses` (los ficheros ya viajan en el binario y
  se sirven desde la UI embebida sin código Go nuevo).

### 2026-10-11 · CI local en vez de GitHub Actions
- **Contexto:** la cuenta se quedó sin minutos de GitHub Actions (la CI del merge de B17 no arrancó).
  GitHub solo recibe push.
- **Decisión:** todos los workflows quedan solo con `workflow_dispatch` (se conservan, no se ejecutan
  solos). La CI se replica en `scripts/ci.sh`, que corre dentro del contenedor de desarrollo:
  `task ci:quick` (lint, tipos, Go en PG 18, Vitest, e2e en PG 18) antes de cada merge a `main` y
  `task ci:full` (además matriz de Go 12–19, e2e en 12 y 17, smoke en 19, binario, imagen y smoke Docker)
  al cerrar un bloque o ronda. Nunca push a `main` con la CI local en rojo; cada tarea anota qué CI
  local se ejecutó, sobre qué commit y el resultado. El script sigue tras un fallo para que el resumen
  esté completo y sale con código 1 si algo falla. Paralelismo: la matriz de Go va de 3 en 3 versiones
  (`CI_GO_JOBS`), segura desde que los datos de test viven en `tmpfs` (B00); los e2e van en serie porque
  comparten la base de desarrollo y los puertos de Playwright. La primera ejecución completa tardó 6m37s.
- **Descartado:** `act` para ejecutar `ci.yml` en local (otra imagen y otra toolchain, más lento y sin
  el Docker interno); un runner autoalojado (una máquina más que mantener para un proyecto de una persona).

### 2026-10-11 · B17: e2e en CI por versión y demo con un volumen por instancia
- **Contexto:** B17 pide la suite e2e completa contra Postgres 12 y 18 en CI y smoke contra 19, y un
  compose de demo con variantes sin configuración y en modo libre.
- **Decisión:** el job `e2e` de `ci.yml` es una matriz: suite completa en 12 (la más antigua), 17 (la de
  la demo y la de por defecto) y 18 (la estable más nueva); `19beta4` solo corre `01`, `02` y `06`
  (login/idioma/tema, navegación, editor SQL) con `continue-on-error` mientras sea pre-release, como en
  `test-go`. En la demo cada instancia tiene su propio volumen `/data`: desde B03 el directorio de datos
  guarda `gresbase.json` y `secret.key`, y compartirlo mezclaría la cuenta, las conexiones guardadas y el
  estado del asistente entre variantes (la del asistente dejaría de estar "sin configurar"). La variante
  en modo libre fija `GRESBASE_ALLOWED_DB_HOSTS=db`.
- **Descartado:** suite completa también contra 13–16 en CI: alargaría mucho el job sin cubrir nada que
  no cubran ya los tests de Go en las 8 versiones.

### 2026-10-10 · Editor SQL (B16): parámetros enlazados en el servidor y pestañas por conexión
- **Contexto:** B16 pide parámetros `:nombre` enviados como parámetros enlazados (nunca interpolados) y
  pestañas de consulta persistidas por conexión.
- **Decisión:** el cliente envía el SQL **tal cual** y un mapa `params`; el servidor detecta los
  `:nombre` de cada sentencia con su lexer (`sqlguard.Placeholders`: fuera de cadenas, identificadores
  entrecomillados y comentarios; un `:` pegado a un identificador, número, `)`, `]` u otro `:` no cuenta,
  así no confunde `::tipo` ni `a[lo:hi]`), los sustituye por `$1, $2…` numerados **por sentencia** (Postgres
  exige que los `$n` de una sentencia sean consecutivos y tipables) y la ejecuta con el protocolo extendido
  (`ExecParams`) con los valores como texto sin tipo, para que Postgres los tipe como en psql. Así la
  garantía "nunca interpolado" vive en el servidor, no en la confianza en el cliente. La posición de los
  errores se traduce del texto reescrito al enviado. Las sentencias sin parámetros siguen por el protocolo
  simple. `web/src/features/sql/params.ts` aplica la misma regla para el diálogo; ambos lados comparten
  casos de test.
  Pestañas: el estado del editor (`doc`, `snippet`, resultados) es el de la pestaña abierta; las demás
  guardan su copia al cambiar, y los resultados de cada pestaña solo viven en memoria. Mientras una
  consulta corre no se cambia de pestaña (sus resultados son de la que la lanzó). La transacción del modo
  transacción es **del editor de esa conexión**, compartida por sus pestañas. Abrir una consulta guardada
  abre su pestaña (o una nueva) en vez de pedir descartar cambios. Al cambiar de conexión se guardan sus
  pestañas aparte y se muestran las de la otra (persistido en `gresbase:sql`, versión 1, con migración del
  texto único de la versión 0).
- **Descartado:** reescribir `:nombre` a `$n` en el cliente (la garantía dependería del navegador);
  numerar `$n` en todo el script (falla en sentencias que no usan todos); una transacción por pestaña
  (cuenta contra el límite de 3 por sesión y complica la banda).

### 2026-10-10 · Pestañas de tablas (B15): Alt+W y limpieza por 404
- **Contexto:** B15 pide cerrar pestañas con `⌘W`, y las pestañas, favoritas y recientes por conexión.
- **Decisión:** el atajo es **Alt+W** (⌥W): Chrome y Firefox reservan `Ctrl+W`/`⌘W` para cerrar su
  pestaña y la página no puede impedirlo, así que el atajo pedido cerraría Gresbase. Con Alt se compara
  la tecla física (`KeyW`), porque en macOS ⌥W escribe `∑`. Las pestañas de tablas que ya no existen se
  quitan cuando su tabla responde 404 al abrirla (y al borrarla desde su menú), no comparando con la
  lista de completado: esa lista se refresca después de crear una tabla, y la pestaña recién abierta se
  habría cerrado sola en ese intervalo. Pestañas y favoritas viven en un store propio
  (`gresbase:tables:<base path>`); los recientes siguen en las preferencias con un campo `connection`
  (los antiguos, sin él, son de `env`).
- **Descartado:** `mod+w` con `preventDefault` (no funciona en navegadores de escritorio); limpiar
  pestañas contra la lista de completado (cerraba pestañas válidas).

### 2026-10-10 · Pegar desde hoja de cálculo (B14): a la cola tal cual, marcar en vez de rechazar
- **Contexto:** B14 pide pegar TSV/CSV en la cola de cambios "validado por tipo" con los errores
  marcados en la cola, y copiar en varios formatos.
- **Decisión:** lo pegado se convierte con las mismas reglas que el editor (`pastedValue`); lo que no
  encaja entra igualmente en la cola como texto y la validez se **deriva** de la cola en cada render
  (`valueError`), sin estado aparte: así sirve también para valores tecleados y sobrevive a deshacer.
  Un valor no válido bloquea Guardar en el cliente (el servidor rechazaría el cast igualmente). Un pegado
  es una sola entrada de deshacer (acción `batch`). Ctrl+C usa el evento `copy` (síncrono, sin permisos);
  el menú contextual usa `navigator.clipboard` (en HTTP fuera de localhost puede fallar: avisa y remite a
  Ctrl+V). TSV sin cabecera (como Excel); CSV con cabecera. Al pegar sin tabuladores solo se trata como
  CSV si varias líneas tienen el mismo número (> 1) de campos, para no partir "Smith, John".
- **Descartado:** rechazar el pegado entero con un error (pierde lo válido); validar en el servidor con
  un preview por cada pegado (una petición por pegado y el cast ya se hace al guardar).

### 2026-10-10 · Vista de tabla (B13): una entrada por conexión y tabla, el fijado manda sobre el orden
- **Contexto:** B13 añade columnas ocultas, orden y anchos a lo que ya guardaba el fijado (v0.1.1), y
  desde B08 la misma tabla puede existir en varias conexiones.
- **Decisión:** una sola entrada de `localStorage` por instancia, conexión, esquema y tabla con todo el
  estado de la vista (`view.ts`). Las columnas fijadas se pintan primero en orden de fijado; el orden
  guardado se aplica al resto. Ocultar gana a fijar. "Restablecer vista" borra la entrada entera
  (también los fijados); "Desfijar todo" solo los fijados. Los anchos se guardan al soltar el arrastre.
  Reordenar en el panel: arrastrar (HTML5 nativo) o botones subir/bajar para teclado, sin dependencias.
- **Descartado:** reordenar arrastrando las cabeceras del grid (choca con el clic para ordenar y con la
  virtualización de columnas); migrar la clave antigua de fijados (se pierden una vez).

### 2026-10-10 · Condiciones de checks e índices parciales: única excepción de SQL del cliente (B12)
- **Contexto:** B12 pide checks y índices parciales con `WHERE`. Una condición solo puede escribirse como
  expresión SQL; no hay forma de construirla con piezas validadas como en B11, y el DDL no admite `$1`.
- **Decisión:** aceptar la condición como texto del cliente, acotada en tres capas:
  1. `expression()` exige que quede como **un único grupo entre paréntesis**: tokeniza con el lexer de
     `sqlguard`, rechaza `;`, rechaza un `)` que cierre el grupo antes del final y exige que el último
     token sea el `)` final (así una cadena o comentario sin cerrar, que se tragaría ese paréntesis, se
     detecta).
  2. El preview muestra la sentencia exacta; preview y ejecución salen de la misma función.
  3. **Todo el DDL de estructura (también el de B11) se ejecuta con el protocolo extendido** (`execOne`,
     `PgConn().ExecParams` sin parámetros), que el servidor solo acepta con una sentencia. `Exec` de pgx
     sin argumentos usa el protocolo simple, que ejecuta varias: no vale.
  Quien puede editar estructura ya puede ejecutar SQL arbitrario en el editor; la capa real es el rol de
  Postgres. La regla 2 de `AGENTS.md` recoge la excepción.
- **`CONCURRENTLY`:** `CREATE INDEX CONCURRENTLY` no puede ir en una transacción: se ejecuta sola en una
  conexión del pool (protocolo extendido, fuera de bloque de transacción), con el aviso "fuera de
  transacción: si falla deja un índice inválido". El resto de cambios siguen en una transacción.
- **Descartado:** un constructor de condiciones (columna, operador, valor): no cubre `CHECK (a < b)` ni
  funciones, que es justo para lo que se usan; validar la condición ejecutándola antes en una consulta
  aparte (no impide que el DDL la interprete distinto y duplica la ejecución).

### 2026-10-10 · Restricciones NOT NULL de Postgres 18 fuera de la lista de restricciones
- **Contexto:** desde 18, `pg_constraint` guarda los NOT NULL (`contype = 'n'`, incluidos los de las
  columnas de la PK). Aparecían en Estructura como restricciones sin tipo y B12 las ofrecería para
  eliminar o validar.
- **Decisión:** la introspección excluye `contype = 'n'`; el NOT NULL se sigue mostrando y cambiando en
  la columna (B11), igual en todas las versiones.
- **Descartado:** mostrarlos como un tipo nuevo solo en 18+: duplica lo que ya dice la columna y haría la
  pantalla distinta según la versión.

### 2026-10-10 · Edición de estructura sin SQL del cliente (B11)
- **Contexto:** el DDL no admite parámetros (`$1`), y B11 pide tipos validados contra `pg_type` y "nada
  interpolado del cliente", pero también defaults y `USING`, que en Postgres son expresiones.
- **Decisión:** el servidor construye cada sentencia con piezas que no vienen del cliente tal cual:
  nombres validados y escapados con `pgx.Identifier`; tipos resueltos con `to_regtype($1)` y escritos con
  `format_type()`, con los modificadores pasados como parámetro a la función `typmodin` del tipo; defaults
  como **valor** (literal `E'…'` escapado en Go, con cast al tipo de la columna) o como **función de una
  lista fija** (`now()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `gen_random_uuid()`); `USING` solo como
  `columna::tipo_nuevo`. El preview y la ejecución usan la misma función, así que el SQL mostrado es el
  ejecutado. Los avisos (reescritura, bloqueo, recorrido, datos existentes) son códigos que la UI traduce.
- **Descartado:** aceptar expresiones libres de default o `USING` (serían SQL del cliente dentro del DDL;
  quien las necesite tiene el editor SQL, con su detector y su confirmación); calcular la reescritura
  exacta probando el cambio en una transacción revertida (toma el bloqueo fuerte solo para avisar).

### 2026-10-10 · B10 · Carga diferida por pantalla y capturas con un e2e opcional
- **Contexto:** el bundle era un único chunk de 510 KB gzip; el plan pide < 300 KB y capturas de cada
  pantalla para la revisión y el README.
- **Decisión:**
  - Diferir lo pesado que no hace falta para la primera pantalla: el editor SQL, Ajustes y el asistente
    (`lazyRouteComponent` de TanStack Router), el editor JSON de celdas (CodeMirror) y la hoja de
    importación (Papa Parse) con `React.lazy`. La vista de tablas sigue en el chunk inicial: es la pantalla
    de entrada. Resultado: 274,7 KB gzip.
  - Las capturas y el recuento de peticiones duplicadas viven en `web/e2e/16-audit.spec.ts`, omitido salvo
    con `GRESBASE_AUDIT=1`: escribe en `docs/` y su resultado no es pasa/falla.
  - `renderApp` (tests) importa las pantallas diferidas al cargarse, como cuando estaban en el bundle: la
    primera importación dinámica dentro de un test incluye la transformación de CodeMirror y no debe contar
    en el tiempo del test.
- **Descartado:** `manualChunks` por librería (no reduce lo que carga la primera pantalla); subir
  `asyncUtilTimeout` en los tests.

### 2026-10-10 · B09 · Ajustes: qué se aplica en caliente, límite de filas como ajuste del servidor
- **Contexto:** B03 dejó todos los ajustes salvo `lang` para el reinicio porque vivían en el pool global.
  B05 rehízo los pools por conexión, así que tocaba revisar cuáles pueden aplicarse ya. B09 pide además un
  "límite de filas" del editor SQL, que no existía como ajuste.
- **Decisión:**
  - En caliente: `lang` (ya lo era) y el nuevo `sql_max_rows` (`GRESBASE_SQL_MAX_ROWS`, 1000). El ejecutor
    SQL lo lee en cada ejecución mediante una función del gestor de conexiones, y `/config` lo publica.
  - Siguen pidiendo reinicio: `statement_timeout`, `max_conns` e `import_timeout` (se fijan al abrir cada
    pool y en la conexión `env`, que nunca se cierra; aplicarlos exigiría cerrar pools con transacciones o
    exportaciones en curso), `max_pools` y `pool_idle_timeout` (los usa el gestor desde el arranque),
    `session_ttl` y `allowed_hosts` (los fija el middleware de autenticación al construirse) y `read_only`
    (dos capas: conexiones abiertas con `default_transaction_read_only` y comprobación de la API; a medias
    sería peor que nada). La UI lo indica con "Se aplica al reiniciar".
  - El límite de filas es del servidor (no una preferencia del navegador): protege la memoria del
    servidor y del navegador igual para todos. El editor sigue aceptando `max_rows` por petición.
  - "Acerca de" se muestra también en modo libre y a quien no es administrador: es informativo, no
    configuración del servidor.
  - Las licencias de terceros son una lista manual de dependencias directas (`licenses.ts`).
- **Descartado:** hacer todos los ajustes en caliente recreando pools al guardar (cortaría
  transacciones abiertas y exportaciones en curso); límite de filas como preferencia personal (no
  protegería al servidor).

### 2026-10-10 · B08 · Conexión en la URL de cada pestaña; consultas por conexión en `@<id>/`
- **Contexto:** con varias conexiones guardadas, el frontend tenía que dejar de usar las rutas sin
  conexión (`/api/v1/…`, que resuelven la conexión por defecto de la sesión) y permitir dos pestañas con
  conexiones distintas. También había que decidir dónde viven las consultas "de una conexión".
- **Decisión:**
  - Pantallas bajo `/c/$connectionId/…`. El `beforeLoad` de esa ruta fija la conexión del módulo
    `lib/api/client.ts` (cada pestaña tiene el suyo) y `apiPath` antepone `c/<id>/` a toda ruta de base
    (`connection`, `schemas`, `tables/`, `sql/`, `changesets/`). Las rutas antiguas (`/tables…`, `/sql…`,
    `/settings`, `/`) piden `GET /connections` y redirigen a la conexión por defecto; sin ninguna,
    `/no-connection` ofrece añadir una.
  - Cambiar de conexión en la misma pestaña descarta la caché de Query salvo las globales (config,
    conexiones, consultas guardadas, ajustes, sesión), remonta la shell (`remountDeps`) y deja el editor
    SQL sin transacción (el texto se conserva): la transacción sigue abierta en la otra conexión y la red
    de seguridad "Retomar / Revertir" la ofrece al volver.
  - El estado y la versión del selector se piden a `/c/<id>/connection` solo con el selector abierto
    (abrir un pool por conexión no es gratis).
  - Consultas guardadas: las de una conexión en la carpeta `@<id>/` (el servidor no cambia: es una carpeta
    más); el resto son de todas las conexiones, sin migrar las existentes. El panel muestra primero las de
    la conexión (con su nombre) y luego "Todas las conexiones"; las carpetas de otras conexiones no se
    ven. Al guardar, "Solo para esta conexión".
  - `PUT /connections/{id}` con contraseña vacía conserva la guardada (editar sin reescribirla);
    "Probar conexión" con el `id` hace lo mismo. `GRESBASE_ALLOWED_DB_HOSTS` sigue siendo solo del modo
    libre: las conexiones guardadas las crea el administrador.
- **Descartado:** prefijo implícito solo cuando la conexión no es la por defecto (si se borra la primera
  guardada, la por defecto cambia y una pestaña apuntaría en silencio a otra base); claves de Query con la
  conexión (habría que tocar cada hook y no evita que componentes montados conserven datos viejos);
  consultas por conexión en el servidor (`/c/{id}/snippets`) por ahora: más API para lo mismo.
- **Límites:** borrar una conexión deja su carpeta `@<id>/` en disco, oculta; no se mueven consultas
  entre "esta conexión" y "todas" desde el panel (renombrar conserva el ámbito).

### 2026-10-10 · B08 · Inactividad de pools con reloj monótono
- **Contexto:** `TestIdlePoolsClose` falló de forma intermitente (1 de cada ~40 ejecuciones): el contador
  dio 4 pools abiertos y todos con último uso ~400 ms **en el futuro**. El reloj de pared del contenedor
  da saltos hacia atrás (sincronización de hora de la VM de Docker Desktop) y el gestor guardaba
  `time.Now().UnixNano()`, que pierde la lectura monótona. Después, `Manager.Close` esperaba para siempre
  al pool con la transacción abierta del test fallido.
- **Decisión:** `Manager.clock()` = nanosegundos monótonos desde `New` (`time.Since`); último uso y corte
  de inactividad usan ese reloj. Un salto de hora ya no cierra pools en uso ni deja abiertos los inactivos.
- **Descartado:** subir el `sleep` del test (taparía el fallo y el bug seguiría en producción).

### 2026-10-10 · B07 · Modo libre: la sesión vive con su conexión, destinos fijados por DNS
- **Contexto:** en modo libre cualquiera que llegue a la pantalla de conexión puede pedir a Gresbase que
  se conecte a un host y puerto arbitrarios (riesgo tipo SSRF: sondear la red interna) y las
  credenciales de Postgres hacen de login.
- **Decisión:**
  - `POST /api/v1/auth/connect` valida el formulario, conecta una vez (`pg.Probe`) y solo entonces crea la
    sesión (cookie firmada con huella `free`, `SameSite=Strict`, sin contraseña) y una conexión `adhoc`
    cuyo `Owner` es la sesión, con pool de 3 y caducidad igual a la de la cookie. La contraseña solo vive
    en el DSN de esa conexión, en memoria; nunca en cookies, logs (DSN enmascarado) ni respuestas.
  - La sesión es válida mientras exista su conexión (`Manager.Owns`): al desconectar se retira
    (`Manager.RemoveOwned`), al caducar la retira el barrido y tras un reinicio no existe, así que la
    cookie deja de valer sola. Reconectar desde una sesión ("Cambiar") sustituye su conexión y no cuenta
    como sesión nueva para `GRESBASE_MAX_SESSIONS` (10).
  - `GRESBASE_ALLOWED_DB_HOSTS` (nombres, IPs o CIDR): se comprueba antes de conectar (`403
    db_host_not_allowed`) y además `pg.RestrictHosts` sustituye el `LookupFunc` de pgconn para que cada
    conexión del pool resuelva solo a direcciones permitidas; un cambio de DNS posterior a la comprobación
    no puede llevar la conexión a otro servidor. Un nombre listado permite lo que resuelva. Sin la
    variable se permite cualquier destino (como Adminer) y el README explica el riesgo.
  - Límite de 5 intentos por minuto e IP compartido con el login (`Auth.Limit`).
  - Rol `user`: sin ajustes ni consultas guardadas (son ficheros compartidos entre sesiones), con
    `auth.RequireAdmin` en sus rutas; el historial del editor sigue en el navegador.
  - No hay guardia de Host en modo libre (las credenciales son el login, como con cuenta).
  - `GRESBASE_MODE_FREE` no se combina con `DATABASE_URL` ni `GRESBASE_USER` (error de configuración). Si
    el asistente eligió modo libre y después se añade `DATABASE_URL`, manda `DATABASE_URL`.
- **Descartado:** guardar la contraseña cifrada en la cookie para sobrevivir a reinicios (sacaría el
  secreto del servidor) y comprobar los hosts permitidos solo antes de conectar (DNS rebinding contra la
  propia comprobación).

### 2026-10-10 · B06 · Asistente de primer arranque: token salvo petición local de verdad
- **Contexto:** sin `DATABASE_URL` la app se configura desde el navegador. Quien complete el asistente
  crea el administrador y elige la base, así que es un punto de toma de control del servidor.
- **Decisión:**
  - **Modo setup** = no hay ninguna conexión (`env` ni guardada) y `gresbase.json` no tiene `mode`. Al
    completarlo se guarda `mode` (`saved` o `free`) en la misma escritura atómica que el administrador, la
    conexión (contraseña sellada con AES-GCM en `secrets["connection:<id>"]`) y el idioma: o se guarda
    todo o nada. Desde ese momento `/api/v1/setup*` responde `404` hasta que se borre la configuración.
  - **"Desde localhost"** = peer de loopback **y** `Host` local (`auth.Local`). Solo el `Host` no sirve
    (lo elige quien hace la petición) y solo el peer tampoco: una página con DNS rebinding en el navegador
    del propio usuario llega desde 127.0.0.1 con su propio `Host`. Cualquier otra petición necesita el
    token (cabecera `X-Gresbase-Setup-Token`, comparación en tiempo constante, límite de 5 intentos por
    minuto e IP). El token es aleatorio (128 bits) y se imprime en los logs al arrancar, o se toma de
    `GRESBASE_SETUP_TOKEN` (≥ 16 caracteres, y entonces no se imprime).
  - Dentro de un contenedor las peticiones del anfitrión no llegan por loopback, así que allí siempre se
    pide el token; el asistente muestra el comando `docker compose logs gresbase | grep setup_token`.
  - En modo setup la guardia de Host deja pasar solo el SPA, `/api/v1/config` y `/api/v1/setup*` (para
    poder configurar un servidor remoto con el token); el resto de rutas de sesión responde
    `409 setup_required` antes de la sesión local implícita, así que ni `/settings` es accesible.
  - "Probar conexión" y el guardado conectan una sola vez (`pg.Probe`, 10 s, sin reintentos) y devuelven
    `422 connection_failed` con `error.reason` (`dns`, `connection_refused`, `authentication`, `ssl`,
    `database_not_found`, `timeout`, `other`); el mensaje de pgconn nombra host, usuario y base, nunca la
    contraseña. Servidores ≤ 11: `422 unsupported_version`.
  - Los campos que fija el entorno aparecen rellenos y bloqueados: `GRESBASE_DB_HOST`/`GRESBASE_DB_PORT`
    (nuevas, las comparte el modo libre de B07), la cuenta de `GRESBASE_USER` (se salta el paso) y el
    idioma de `GRESBASE_LANG` (no se guarda el del asistente).
  - `DATABASE_URL` deja de ser obligatoria. Las rutas sin conexión usan `Manager.DefaultID`: la `adhoc` de
    la sesión (B07), si no la de `DATABASE_URL`, si no la primera guardada.
  - La URL pegada se descompone en el navegador en los campos; el servidor solo recibe campos y monta el
    DSN (`config.BuildDSN`), así que parámetros extra de la URL se pierden.
- **Descartado:** no pedir nunca token (cualquiera en la red o una página maliciosa podría quedarse con la
  instancia) y pedirlo siempre (rompe el caso sencillo de `localhost` fuera de Docker que pide el plan).

### 2026-10-10 · B05 · Gestor de conexiones: rutas con la conexión, pool de `DATABASE_URL` fijo
- **Contexto:** B05 pasa de un pool global a uno por conexión, con catálogo, tipos, transacciones SQL y
  deshacer sin mezclarse. B08 pondrá la conexión en las rutas del frontend (`/c/$connectionId/…`), así que
  dos pestañas con conexiones distintas deben poder llamar a la API a la vez.
- **Decisión:**
  - La conexión viaja en la ruta de la API: cada ruta de base existe como `/api/v1/…` (conexión
    `env`, comportamiento idéntico al de antes) y como `/api/v1/c/{connection}/…`. Un middleware la
    resuelve y la pone en el contexto; los handlers de `internal/api` no cambian, el servidor les monta
    los de la conexión de la petición.
  - `connections.Conn` agrupa pool, `introspect.Catalog`, `pgvalue.Types` (los OID de tipos propios
    cambian entre bases), `write.Writer` (deshacer) y `sqlexec.Executor` (transacciones y cancelación).
  - Pool perezoso (`pgxpool.NewWithConfig` no conecta hasta la primera consulta) y cierre tras
    `GRESBASE_POOL_IDLE_TIMEOUT` (10m) sin uso. Nunca se cierra un pool con peticiones en curso (contador
    por `Acquire`/`release`, también durante una exportación en streaming) ni con transacciones SQL
    abiertas. Al cerrarse se pierde su historial de deshacer y su caché, como en un reinicio.
  - El pool de `DATABASE_URL` no se cierra por inactividad: se abre y valida al arrancar (reintentos y
    rechazo de Postgres ≤ 11, como antes) y así su deshacer no caduca. Lo cierra quien lo abrió (`main`).
  - `GRESBASE_MAX_POOLS` (20): al abrir uno más se cierra el inactivo usado hace más tiempo; si no hay
    ninguno, `503 too_many_connections`. `GRESBASE_MAX_CONNS` pasa a ser el tamaño de cada pool.
  - Una conexión `adhoc` lleva `Owner` (la sesión): otra sesión recibe `404`, igual que una conexión que
    no existe, para no revelar ids. B07 la crea y la retira (`Manager.Remove`).
  - La conexión guarda su DSN como `config.Secret`; host, puerto, base y demás campos los añadirá B08
    cuando haya formularios que los editen.
- **Descartado:** una cabecera `X-Gresbase-Connection` (invisible en los logs de acceso y fácil de
  olvidar en un `fetch`); resolver solo por sesión (rompe las dos pestañas de B08); cerrar también el
  pool de `DATABASE_URL` (perdería el deshacer de la conexión principal tras cada pausa).

### 2026-10-10 · B04 · Cuentas locales: invalidar sesiones con la huella de la credencial
- **Contexto:** cambiar la contraseña debe cerrar las demás sesiones, y las cookies son firmadas y sin
  estado en el servidor (salvo la lista de revocadas al hacer logout).
- **Decisión:** la cookie incluye una huella de la credencial (8 bytes de SHA-256 del hash argon2id, o de
  la contraseña de entorno). Al validar, la huella debe coincidir con la de la cuenta actual; cambiar la
  contraseña cambia la huella y todas las cookies anteriores dejan de valer sin guardar nada más. La sesión
  que cambia la contraseña recibe una cookie nueva con el mismo id. argon2id con los parámetros de la segunda
  recomendación de RFC 9106 (64 MiB, t=3, p=4); el límite de 5 intentos por minuto e IP acota la memoria.
  Contraseña actual incorrecta → `403 forbidden` (un `401` haría que el cliente cerrase la sesión).
- **Descartado:** un contador de época por usuario en `gresbase.json` (más estado y una escritura por
  cambio, para lo mismo); la recomendación mínima de OWASP (19 MiB, t=2): hay memoria de sobra y un solo
  administrador.

### 2026-10-10 · B03 · Capa de configuración: qué va al fichero y cuándo se aplica
- **Contexto:** B03 pide tres capas (entorno > `gresbase.json` > defecto) sin concretar qué claves ni
  cómo se aplican los cambios en caliente.
- **Decisión:** al fichero solo van los ajustes de servidor que tiene sentido cambiar desde la app
  (`lang`, `session_ttl`, `allowed_hosts`, `read_only`, `statement_timeout`, `import_timeout`,
  `max_conns`), guardados como texto con el mismo formato y validación que su variable. Puerto, ruta base,
  data dir y logs son de arranque y siguen solo en el entorno (el fichero vive dentro del data dir).
  `lang` se aplica al momento; el resto se aplica al reiniciar y la API lo marca con `restart_required`,
  porque hoy viven en el pool y en middlewares que se construyen al arrancar. B05 rehace los pools por
  conexión y es el momento de aplicar en caliente lo que lo merezca. Los secretos se sellan con AES-GCM
  (nonce aleatorio por valor); la clave es SHA-256 de `GRESBASE_SECRET_KEY` o 32 bytes aleatorios en
  `secret.key`. **Limitación:** si el volumen se filtra entero, `secret.key` va con él; para más seguridad,
  `GRESBASE_SECRET_KEY` (documentado en el README). El secreto de sesión generado también se guarda, así
  que las sesiones sobreviven a reinicios con volumen.
- **Descartado:** aplicar todo en caliente ya (habría que reconstruir pool, guardia de Host y
  autenticador en cada cambio antes de que B05 cambie esa estructura); cifrar el fichero entero (los
  ajustes no son secretos y el usuario debe poder leerlo y editarlo).

### 2026-10-10 · B01 · Forma de las capacidades y detección de pre-release
- **Contexto:** el frontend necesita saber si una capacidad existe y, si no, explicar qué versión o
  extensión hace falta; el plan no fija la forma ni cómo detectar una beta.
- **Decisión:** `capabilities` es un objeto nombre → `{available, min_version?, extension?}`, así el
  tooltip se construye sin duplicar la tabla de versiones en TS. Los tipos TS (`SupportLevel`,
  `Capability`) salen de `tygo.yaml` (frontmatter + `type_mappings`) para no exportar al módulo generado
  constantes genéricas como `Full` o `Merge`; el nombre de capacidad es `string` en TS. `prerelease` se
  detecta por `beta`/`rc`/`devel` en el primer token de `server_version` (el resto es texto de la
  distribución). Con ≤ 11 el arranque falla con un error permanente (no reintenta).
- **Descartado:** un mapa nombre → booleano (el motivo tendría que vivir también en el frontend) y
  comparar `server_version_num` contra la última versión final conocida para detectar betas (habría que
  tocarlo en cada versión).

### 2026-10-10 · B00 · Postgres de test en RAM: causa de los contenedores "parados"
- **Contexto:** en v0.1.1 (punto 9), tras compilar imágenes en el Docker interno, dos contenedores de
  `pgtest` superaron los 60 s de espera de testcontainers. Con la matriz 12–19 la carga crece.
- **Investigación:** con la matriz secuencial y con tres versiones a la vez (27 contenedores sembrando a
  la vez) no se reprodujo: los paquetes pasan de ~10 s a ~30 s, lineal con la carga. Con **presión de
  disco** en el dind (4 bucles `dd … conv=fsync`, como una compilación de imágenes) sí: una sola versión
  con el paralelismo normal tardó 40–63 s por paquete, al borde del límite. El arranque de cada
  contenedor (initdb con su `fsync` final, servidor temporal del seed, checkpoint de parada y reinicio)
  depende del disco; el módulo de testcontainers ya pone `fsync=off`, pero solo al servidor, no a initdb ni
  al volumen. El dind tiene 12 CPU y 54 GB: no faltaban CPU ni memoria.
- **Decisión:** el directorio de datos de los contenedores de test vive en un `tmpfs` (`/pgdata`, con
  `PGDATA=/pgdata/data`: una ruta propia porque la de la imagen cambió en 18 y 18+ se niega a arrancar con
  un montaje en la antigua) e initdb va con `--no-sync`. Resultado: sin presión, los paquetes bajan de ~10 s
  a 4–7 s; con la misma presión de disco, 20–32 s, y del arranque a "ready" quedan 4–5 s (el resto es el
  propio daemon creando y parando contenedores). Los timeouts no se tocan.
- **Descartado:** subir el timeout de espera (esconde el problema); limitar `go test -p` (alarga todas las
  ejecuciones y no quita la dependencia del disco); un único contenedor compartido entre paquetes (más
  complejo y acopla paquetes que hoy son independientes).

### 2026-10-10 · B00 · Matriz de Postgres 12–19 y etiqueta de 19
- **Contexto:** el producto base soporta Postgres 12–19 . Postgres 19 no tiene
  versión final en Docker Hub el 2026-10-10: la última etiqueta es `19beta4` (sin RC aún).
- **Decisión:** la matriz usa `12 … 18` y `19beta4`, en `Taskfile.yml` (`test:go:all`, `PG_VERSIONS`) y en
  el job `test-go` de `ci.yml`, con `continue-on-error` solo para la pre-release. **Cuando salga 19 (o un
  RC), cambia `19beta4` por `19` (o `19rc1`) en esos dos sitios** y quita `prerelease: true`. El seed sirve
  para todas: en 12 crea `pgcrypto` para `gen_random_uuid()` (núcleo desde 13). `pgtest` borra las bases
  de cada test terminando antes sus sesiones (`DROP DATABASE … WITH (FORCE)` es de 13). El compose de la
  base de desarrollo monta el volumen en `/var/lib/postgresql` con `PGDATA` propio, para que
  `PG_VERSION=18` o `19beta4` funcionen (18+ rechaza un montaje en `/var/lib/postgresql/data`); el compose
  de demo se queda en 17 y no cambia, para no perder sus datos.
- **Descartado:** separar el seed en común + extras por versión: con un único bloque condicional basta;
  se separará cuando haga falta algo más que `pgcrypto`.

### 2026-10-10 · Publicación desactivada hasta la primera versión pública
- **Sustituida** el 2026-10-14: la v0.3.0 es la primera versión pública (entrada de arriba).
- **Contexto:** no se publica nada (imágenes, releases, paquetes, tags) hasta decidir la primera versión
  pública. `release.yml` publicaba en GHCR y GitHub Releases al subir un tag.
- **Decisión:** garantía técnica en tres capas: `release.yml` sin disparador por tags, solo
  `workflow_dispatch`, con permisos de solo lectura y un único paso que falla siempre ("Publicación
  desactivada hasta v1.0"); el job de publicación anterior (login en GHCR + `goreleaser release`) se retira
  y queda en la historia (commit `f5c01ce`) para restaurarlo en v1.0. `ci.yml` revisado: no hace login, push
  ni releases. GoReleaser solo se usa como `goreleaser release --snapshot --clean`.
- **Descartado:** dejar los pasos de publicación detrás del paso que falla: quitar ese paso bastaría para
  publicar, y la regla pide que ningún workflow haga login en registros.

### 2026-10-10 · Importación CSV con timeout propio
- **Contexto:** la importación heredaba el `statement_timeout` del pool (30 s): un CSV grande se cortaba.
- **Decisión:** `GRESBASE_IMPORT_TIMEOUT` (por defecto `10m`) se aplica de dos formas coherentes:
  `SET LOCAL statement_timeout` en la transacción de la importación (cada sentencia) y un `context` con
  la misma duración para la importación entera (las sentencias del bisecado se suman). El contexto de la
  petición HTTP se propaga, así que una desconexión cancela el `COPY` y revierte.
- **Descartado:** quitar el límite (`statement_timeout = 0`, como la exportación): una importación sin
  cliente que la vigile no debe poder quedarse colgada indefinidamente.

### 2026-10-10 · Transacciones SQL al salir: rollback con `fetch` keepalive y retomar/revertir al volver
- **Contexto:** recargar o cerrar el editor con una transacción abierta la dejaba viva en el servidor
  (ocupando uno de los 3 huecos de la sesión) hasta caducar a los 5 min. `navigator.sendBeacon` no puede
  enviar la cabecera anti-CSRF `X-Gresbase: 1`.
- **Decisión:** en `pagehide` (solo se dispara si la página se va de verdad: si el usuario cancela el aviso
  de `beforeunload`, no) el editor envía `POST …/transactions/{id}/rollback` con
  `fetch(…, { keepalive: true })` y la cabecera `X-Gresbase: 1`, por el endpoint normal y protegido. No hay
  ninguna excepción a la regla de CSRF. Como esa petición puede perderse (navegador cerrado, red caída,
  pestaña matada), la red de seguridad real es `GET /api/v1/sql/transactions` (las transacciones abiertas de
  la sesión, la más reciente primero): al cargar, el editor muestra una banda "Transacción abierta
  encontrada" con **Retomar** (la adopta: banda normal, cuenta atrás y Confirmar/Revertir) o **Revertir**.
  La cuenta atrás de una transacción retomada parte del `expires_at` del servidor (no hay otra referencia);
  la comprobación al llegar a cero corrige un reloj desfasado. Sin login, todas las pestañas comparten la
  sesión local, así que otra pestaña abierta con su transacción también aparece como "encontrada".
- **Descartado:** `sendBeacon` con un endpoint exento de CSRF (abre una excepción a la regla 8) y guardar el
  `tx_id` en `sessionStorage` (no cubre el navegador cerrado).

### 2026-10-10 · Exportación CSV con parámetros y CSV escrito en Go
- **Contexto:** la exportación CSV usaba `COPY (SELECT …) TO STDOUT` con los valores de los filtros como
  literales escapados (excepción a la regla 2 de seguridad, protegida con `standard_conforming_strings`).
- **Decisión:** el CSV sale de un `SELECT` normal con parámetros (`$n`), el mismo que usa el JSON, pedido en
  formato texto; Go escribe cada fila en cuanto llega, con un búfer de una fila (memoria acotada). Se copian
  las reglas de `COPY … (FORMAT csv, HEADER)`: `NULL` como campo vacío, cadena vacía como `""`, comillas si
  hay coma, comilla, CR o LF, y `\.` entre comillas cuando es el único campo de la línea. Un test comprueba
  que la salida es idéntica byte a byte a la de `COPY` en esos casos, y otro que filtros y nombres de columna
  hostiles no inyectan SQL. Se retira la comprobación de `standard_conforming_strings` en la exportación.
- **Descartado:** `encoding/csv` (no distingue cadena vacía de `NULL`: escribe ambas sin comillas).

### 2026-10-10 · Grupos de concurrencia de la CI por evento
- **Contexto:** al hacer push de `main` y de la rama de un PR ya mergeado a la vez, el run `pull_request`
  tardío se ejecuta con `github.ref = refs/heads/main` y cancelaba el run de `push` a `main` (mismo grupo
  `ci-refs/heads/main`).
- **Decisión:** grupo `ci-<event_name>-<head_ref || ref>`: cada evento y cada rama de PR tiene el suyo.
  Se añade también `workflow_dispatch` para lanzar la CI a mano.
- **Descartado:** quitar `cancel-in-progress` (se pierde la cancelación de runs obsoletos en un PR).

### 2026-10-09 · Fijar columnas y filas
- **Contexto:** mejora pedida tras el MVP (v0.1.1): fijar columnas y filas en el grid de tablas.
- **Decisión:** columnas con `columnPinning` de TanStack Table, por nombre y en orden de fijado; solo se
  virtualizan las no fijadas. Filas por PK, pedidas aparte con `rows:query` (filtro `eq` por cada columna de
  la PK, `limit 1`) e **independientes de los filtros y la página**: una fila fijada se ve aunque el filtro
  la excluya; si ya no existe, desaparece. Los pines viven en `localStorage` por base, esquema y tabla. El
  editor de celda se pinta dentro de su celda, para seguirla cuando está fija. En los resultados del
  editor SQL no hay pines (sin PK fiable y con nombres de columna repetibles).
- **Descartado:** aplicar los filtros a las filas fijadas (dejarían de verse justo al filtrar) y guardar
  los pines en el servidor o en la URL.

### 2026-10-09 · Select propio sobre Radix
- **Contexto:** los `<select>` nativos no siguen `docs/design.md` (panel del sistema operativo, sin tema
  oscuro coherente).
- **Decisión:** `components/ui/Select` sobre `radix-ui` (ya instalado) con `options: {value, label}[]`.
  Radix reserva `''` para "sin valor": `''` muestra el `placeholder` y las opciones especiales usan un
  centinela (`-1` en el mapeo de la importación). En el editor de celda, el `blur` hacia la lista (que va en
  un portal) no cuenta como salir del editor; Enter en el disparador cerrado confirma la celda y la lista se
  abre con ↓/↑, Espacio o clic.
- **Descartado:** un combobox propio sin Radix, y mantener el `<select>` nativo solo en el grid.

### 2026-10-09 · Los specs e2e se mudan a `web/e2e/`
- **Contexto:** con `testDir: '../e2e'` Playwright resuelve `@playwright/test`, pero no el resto de
  paquetes (`@axe-core/playwright` daba `Cannot find module`): Node busca `node_modules` desde la
  carpeta del fichero, y `e2e/` en la raíz no tiene.
- **Decisión:** specs en `web/e2e/`, config en `web/playwright.config.ts`. Mismo lockfile y mismo
  volumen; además ESLint, Prettier y `tsc` (vía `tsconfig.node.json`) cubren los e2e. Vitest limita su
  `include` a `src/**/*.test.{ts,tsx}` para no recoger los `*.spec.ts`. Sustituye a la decisión de la
  tarea 00 sobre `../e2e`.
- **Descartado:** `NODE_PATH` o symlinks a `web/node_modules` desde la raíz.

### 2026-10-09 · Base limpia por suite e instancias del e2e
- **Contexto:** los escenarios escriben (editar, cascada, vaciar, importar…) y la tarea pide base limpia.
- **Decisión:** `task e2e` hace `task dev:db:reset` (seed completo, unos segundos), compila y lanza
  Playwright con `workers: 1` y los ficheros en orden numérico. El `webServer` de Playwright arranca tres
  instancias del binario: sin login (`:18091`), con login (`:18092`) y solo lectura (`:18093`), cada una
  con su `GRESBASE_DATA_DIR` en `tmp/e2e/`. Los tests comprueban la base a través de la propia API SQL
  de la instancia local, sin `psql`. Sin reintentos: un fallo con estado compartido debe verse.
- **Descartado:** clonar una base por test con `CREATE DATABASE … TEMPLATE` (habría que arrancar una
  instancia por base) y escenarios en paralelo.

### 2026-10-09 · README y CHANGELOG en inglés
- **Contexto:** `AGENTS.md` pide la documentación de `docs/` en español, pero README y CHANGELOG son la
  cara pública del proyecto en GitHub.
- **Decisión:** `README.md` y `CHANGELOG.md` en inglés; `docs/` sigue en español.
- **Descartado:** README en español o bilingüe.

### 2026-10-09 · Avisos de acceso en la barra lateral
- **Contexto:** el diseño pide un badge de solo lectura en la barra lateral y la spec un aviso discreto
  cuando no hay login.
- **Decisión:** ambos van encima de la tarjeta de conexión, como chips pequeños con tooltip que explica
  el modo y qué hacer (definir `GRESBASE_USER`/`GRESBASE_PASSWORD`). Plegada, solo el icono.
- **Descartado:** un banner en la parte superior (no hay barra superior por diseño).

### 2026-10-09 · Texto sobre el botón de peligro
- **Contexto:** el diseño pide texto blanco sobre `--danger`, pero en oscuro (`#F97316`) da 2,8:1, por
  debajo de WCAG AA.
- **Decisión:** token `--on-danger`: blanco en claro (5,2:1) y `#17130C` en oscuro. El resto de tokens
  ya cumplen ≥ 4,5:1 (medidos en la tarea 23 del MVP).
- **Descartado:** oscurecer `--danger` en el tema oscuro (cambia el color de marca de los avisos).

### 2026-10-09 · Descargas con comprobación previa
- **Contexto:** un enlace `<a download>` guarda como fichero la respuesta de error (sesión caducada,
  filtro inválido).
- **Decisión:** `download(url)` en `lib/api/client.ts` hace el `GET`, y solo si es 2xx aborta la
  petición y lanza la descarga con un enlace; si no, el error se muestra como aviso. Cuesta empezar y
  cancelar la exportación una vez (el servidor la corta al desconectarse).
- **Descartado:** ruta `HEAD` o un token de descarga (más código para un caso raro).

### 2026-10-09 · Particiones fuera de la paleta
- **Contexto:** las completions del editor SQL listan las particiones (útiles al escribir SQL), y la
  paleta las mostraba como tablas sueltas.
- **Decisión:** `CompletionTable.partition` (`relispartition`); la paleta las omite y se llega a ellas
  desde su tabla padre en el navegador.
- **Descartado:** un endpoint propio para la paleta.

### 2026-10-09 · Importación CSV en el punto único de escritura
- **Contexto:** el plan pide `COPY` a una tabla temporal, casteo con el tipo del catálogo, bisección de
  errores y separador/cabecera/BOM configurables.
- **Decisión:** la importación vive en `internal/pg/write` (único punto de escritura; avisa al
  `ChangeRecorder` con `kind: import`). El CSV lo parsea Go con `encoding/csv` y se copia ya normalizado
  (vía `CopyFrom` de pgx), así el separador, el BOM y las comillas no dependen de las opciones de `COPY`.
  Las partes del multipart deben ir en orden (`options` y luego `file`) para no guardar el fichero en
  memoria ni en disco. `row` del informe es la línea del fichero donde empieza el registro (la cabecera es
  la línea 1). Se admiten tablas sin PK (solo se insertan filas); vistas → `422 not_writable`; columnas
  generadas e identidad `ALWAYS` no se pueden mapear. Respuesta 200 con `{inserted, errors}` también
  cuando hay errores. Los rangos que funcionan durante la bisección se quedan dentro de la transacción,
  así también se encuentran duplicados dentro del fichero; al final todo se revierte.
- **Descartado:** `COPY … FROM STDIN (FORMAT csv)` directo con las opciones del usuario (error al primer
  fallo, sin línea fiable) y paquete `internal/pg/importcsv` aparte.

### 2026-10-09 · Exportación: completa, literales en COPY y errores a mitad
> **Revertida en parte (2026-10-10):** el CSV ya no usa `COPY` con literales; ver "Exportación CSV con
> parámetros y CSV escrito en Go". El resto (valor completo, errores a mitad) sigue vigente.

- **Contexto:** la exportación debe sacar todos los datos en streaming, también de tablas grandes.
- **Decisión:** se exporta el valor completo: sin truncar textos y `bytea` como su texto hex de Postgres
  (`\x…`), igual que en el CSV de `COPY`. `COPY` no admite parámetros, así que los valores de los filtros
  van como literales escapados (`'…'::tipo`), solo si `standard_conforming_strings` está en `on` (se
  comprueba). El JSON va con parámetros. Si falla antes del primer byte, error JSON normal; si falla a
  mitad, se aborta la respuesta (`http.ErrAbortHandler`) para que la descarga no parezca completa. En el
  editor SQL se exporta lo cargado en el navegador (bytea con su marca de tamaño).
- **Descartado:** CSV escrito en Go fila a fila (el plan pide `COPY`) y exportar con el mismo truncado del grid.

### 2026-10-09 · Paleta: tablas desde las completions y recientes en preferencias
- **Contexto:** la paleta busca tablas de todos los esquemas y muestra "Recientes".
- **Decisión:** las tablas salen de `GET /api/v1/sql/completions` (ya lista todas las relaciones de los
  esquemas de usuario en una petición, con caché de 60 s). Recientes: las 6 últimas tablas o consultas
  guardadas abiertas, en `gresbase:prefs` (por navegador); se ocultan las que ya no existen.
- **Descartado:** pedir `schemas/{s}/relations` por esquema al abrir la paleta (N peticiones) o un endpoint
  nuevo.

### 2026-10-09 · Consultas guardadas: ficheros, rutas y modo no persistente
- **Contexto:** la tarea 19 pide `.sql` bajo `GRESBASE_DATA_DIR/snippets` con carpetas, rutas saneadas,
  escritura atómica y un modo en memoria si el directorio no es escribible.
- **Decisión:** el id de una consulta es su ruta relativa (`informes/mensual.sql`), codificada en la URL
  (`/sql/informes%2Fmensual.sql`) y en query/body en la API (`GET /snippets/file?path=`, `POST`/`PUT
  /snippets {path, sql}`, `POST /snippets:move`, `DELETE /snippets?path=`, `POST /snippets/folders`). Todo
  acceso a ficheros pasa por `os.Root` (Go ≥ 1.25), que impide salir del directorio con `..` o symlinks;
  además se rechazan segmentos que empiezan por punto (los temporales de la escritura atómica lo hacen).
  Una ruta que acaba en `.sql` es una consulta; cualquier otra, una carpeta. El "modo en memoria" es un
  directorio temporal: mismo código, se pierde al recrear el contenedor igual que la memoria, y
  `data_persistent` sale de ahí (se quita la sonda de `main.go`). Las consultas guardadas son datos de la
  app, no de la base: siguen disponibles en `GRESBASE_READ_ONLY`.
- **Descartado:** un almacén en memoria aparte (segunda implementación que mantener) e ids opacos (URLs
  ilegibles y un índice que mantener).

### 2026-10-09 · Historial del editor SQL en IndexedDB
- **Contexto:** historial de 500 entradas buscable, solo en el navegador.
- **Decisión:** IndexedDB sin librería (unas 40 líneas), una entrada por ejecución con el SQL ejecutado,
  fecha, duración, filas de la última sentencia (o afectadas) y error. La búsqueda es en memoria sobre las
  500. Si IndexedDB no está disponible, el historial vive solo en la sesión. Cargar una entrada o abrir una
  guardada con cambios sin guardar pide confirmación; un texto sin título cuenta como guardado si está en
  el historial.
- **Descartado:** `idb` (dependencia para tres operaciones) y `localStorage` (límite de tamaño).

### 2026-10-09 · SPA para rutas cliente con punto
- **Contexto:** el fallback SPA respondía 404 a cualquier ruta con extensión que no fuera un fichero, y
  `/sql/informes%2Fmensual.sql` o `/tables/public/v1.2` son rutas del cliente.
- **Decisión:** un fichero que existe se sirve; uno que no existe con extensión es 404 solo si está en la
  raíz o bajo `/assets` (assets que faltan); el resto recibe `index.html`.
- **Descartado:** quitar `.sql` del id en la URL (no arregla las tablas con punto).

### 2026-10-09 · Modo transacción en el editor SQL
- **Contexto:** la tarea 18 pide abrir la transacción en la primera ejecución, una cuenta atrás hasta el
  rollback automático y detectar la caducidad sin añadir configuración que la spec no prevé.
- **Decisión:** el estado vive en `useSqlEditor` (`txMode`, `tx`, `txDeadline`, `txExpired`, `pending`).
  La cuenta atrás usa el reloj del navegador: la duración de inactividad sale de la primera `TxInfo`
  (`expires_at − created_at`) y se reinicia en cada ejecución, así un reloj del servidor desfasado no la
  falsea. Al llegar a cero se consulta `GET …/transactions/{id}`; un `404` (o un `404` al ejecutar,
  confirmar o revertir) significa que caducó y la UI lo explica. El interruptor no se puede apagar con una
  transacción abierta, y Confirmar/Revertir se deshabilitan mientras se ejecuta algo (el servidor los
  rechazaría con `409`). Salir de la pantalla pregunta y revierte; recargar la página avisa con
  `beforeunload` y la transacción huérfana caduca en el servidor a los 5 min. *(Superado el 2026-10-10: rollback con `fetch` keepalive en `pagehide` y retomar/revertir al volver.)*
- **Descartado:** una variable de entorno para acortar la caducidad en pruebas (se probó esperando los
  5 min reales) y revertir con `sendBeacon` al cerrar la pestaña (no puede enviar la cabecera anti-CSRF).

### 2026-10-09 · Autocompletado del editor SQL con un único endpoint
- **Contexto:** el editor necesita tablas y columnas de todos los esquemas y funciones; pedir el detalle
  de cada tabla serían N peticiones.
- **Decisión:** `GET /api/v1/sql/completions` devuelve `{tables: [{schema, name, columns}], functions}`
  con dos consultas a `pg_catalog`, cacheadas como el resto de la introspección (30 s, se invalidan con
  el DDL). Funciones de `pg_catalog` y de esquemas de usuario, sin las que solo usan pseudo-tipos (E/S de
  tipos, handlers, triggers). Tras `nombre.` solo se sugieren tablas y columnas. `GET /api/v1/config`
  expone `statement_timeout_ms` para el badge de timeout.
- **Descartado:** cargar las columnas tabla a tabla bajo demanda.

### 2026-10-09 · Qué ejecuta ⌘↵
- **Contexto:** con el cursor fuera de una sentencia (tras su `;`, en una línea vacía o un comentario)
  hay que elegir una.
- **Decisión:** con selección, la selección; si no, la sentencia que contiene el cursor o, si no, la
  última que empieza antes del cursor (o la primera). El separador TS es un port del de Go y pasa los
  mismos vectores (`testdata/sql-split-cases.json`, que el `Dockerfile` copia porque el test lo importa).
- **Descartado:** ejecutar el bloque entre líneas vacías (no respeta `;` ni comentarios).

### 2026-10-09 · Editor SQL: estado y piezas para las tareas 18 y 19
- **Contexto:** el modo transacción y las consultas guardadas se apoyan en el editor.
- **Decisión:** store zustand `useSqlEditor` (`features/sql/store.ts`): `doc` (persistido en
  `gresbase:sql`), `timeoutMs`, `running`, `results`, `offset`, `error`, `active` y las acciones `run` y
  `cancel`. La 18 añade la transacción y su `tx_id` en `run`; la 19, la consulta guardada y el historial
  tras `run`. Hasta la 18, un `409 confirmation_required` se muestra como error en los resultados. Las
  llamadas a funciones se colorean con `--syntax-function` con un plugin propio (lang-sql no las
  distingue de otros identificadores).
- **Descartado:** guardar la vista de CodeMirror en el store.

### 2026-10-09 · Editor SQL: una conexión nueva por ejecución
- **Contexto:** el SQL del usuario puede cambiar la sesión (`SET`, `SET ROLE`, tablas temporales, un
  `BEGIN` sin cerrar) y esa conexión volvería al pool para otras peticiones.
- **Decisión:** cada ejecución fuera de una transacción usa una conexión del pool que se **cierra** al
  terminar (el pool abre otra). Las transacciones del modo transacción retienen la suya hasta
  confirmar, revertir o caducar, y también se cierra después. Un `BEGIN` sin `COMMIT` en un script
  normal se revierte al cerrar.
- **Descartado:** `RESET ALL`/`DISCARD ALL` al devolverla (rompe la caché de sentencias de pgx y no
  cubre todo).

### 2026-10-09 · Separador de sentencias junto al tokenizador
- **Contexto:** el plan pone el separador en `sqlexec` y el detector en `sqlguard`, pero ambos necesitan
  el mismo lexer y `sqlexec` usa el detector (ciclo de imports).
- **Decisión:** lexer, `Split` y `Analyze` viven en `internal/pg/sqlguard`; `sqlexec` los usa. Se asume
  `standard_conforming_strings=on` (por defecto desde PG 9.1). Las sentencias van del primer al último
  token (sin comentarios alrededor ni `;`).
- **Descartado:** dos lexers.

### 2026-10-09 · Offsets del editor SQL en UTF-16
- **Contexto:** Postgres da `position` en caracteres de la sentencia; CodeMirror trabaja en unidades
  UTF-16.
- **Decisión:** rangos de sentencias (`from`/`to`), hallazgos del detector y `position` de los errores se
  devuelven en unidades UTF-16 del texto enviado (`position` 1-based). Los vectores compartidos solo
  fijan el texto de cada sentencia, así sirven a Go (bytes) y a TypeScript (UTF-16).
- **Descartado:** caracteres Unicode (obligaría al frontend a convertir).

### 2026-10-09 · Ejecución SQL: id del cliente, sin truncar y control de transacción
- **Contexto:** cancelar exige conocer el id antes de que llegue la respuesta; los resultados del editor
  no tienen PK para pedir un valor completo; `COMMIT`/`ROLLBACK` del usuario romperían el modo
  transacción y el solo lectura.
- **Decisión:** `execution_id` lo elige el cliente (opcional; si falta lo genera el servidor). Los
  valores de los resultados no se truncan (el límite es `max_rows`). Los errores de cada sentencia van
  en su resultado (`200`), no como error HTTP, para conservar los resultados anteriores. En modo
  transacción y en solo lectura se rechazan `BEGIN`/`START`/`COMMIT`/`END`/`ROLLBACK`/`ABORT`/
  `PREPARE TRANSACTION` con `400` (los savepoints sí se permiten). En solo lectura todo corre en
  `BEGIN READ ONLY` con el snapshot ya tomado, y no se pide confirmación de destructivas ni se abren
  transacciones (`403 read_only`). Una transacción que caduca o no existe responde `404 not_found`.
  Solo los avisos de nivel peligro exigen confirmación (`DELETE`/`UPDATE` con `WHERE` no).
- **Descartado:** id generado por el servidor y devuelto en streaming; errores como `422`.

### 2026-10-09 · DDL comprobado recreando la tabla en una copia de la base
- **Contexto:** el plan pide ejecutar el DDL generado "en una base vacía", pero `users` e `invoices`
  tienen FKs a otras tablas y usan el enum `plan_t`, que no existirían.
- **Decisión:** el test clona la base del seed, borra la relación (`DROP … CASCADE`) y ejecuta su DDL;
  después compara columnas, constraints, índices y comentario con los originales. Prueba que el DDL es
  ejecutable y fiel sin generar también el de las dependencias. El DDL cubre tabla, constraints,
  índices, comentarios, particiones y vistas; no triggers, permisos ni secuencias de `serial`.
- **Descartado:** generar el DDL de todo el grafo de dependencias (es la "exportación de DDL" de v0.3).

### 2026-10-09 · Panel de salto FK y "referenciado por"
- **Contexto:** el clic en una celda FK abre un panel; la celda también es la celda activa del grid.
- **Decisión:** el valor FK es un botón dentro de la celda (fuera del orden de tabulación); Espacio
  sobre la celda activa hace lo mismo. Con FKs de varias columnas se usan todas las de la fila; con
  algún `NULL` no hay salto. "Referenciado por" es un endpoint propio
  (`GET …/rows/referenced-by?pk=`) que cuenta con `(cols) IN (SELECT refcols FROM tabla WHERE pk)`, así
  el cliente solo envía la PK; el enlace filtra la tabla que referencia con los valores de la fila.
- **Descartado:** un recuento por FK desde el cliente con `rows:count` (N peticiones y enviar valores de
  columnas no PK).

### 2026-10-09 · Confirmación por nombre también en el servidor
- **Contexto:** vaciar y eliminar tablas piden escribir el nombre exacto en la UI; la API podría
  aceptarlos sin más.
- **Decisión:** `…:truncate` y `DELETE /api/v1/tables/{schema}/{table}` exigen `confirm` igual al nombre
  de la tabla; si no, `409 confirmation_required`. Una petición suelta (script, error de la UI) no puede
  vaciar ni borrar una tabla. Solo tablas y particionadas; vistas → `422 not_writable`.
- **Descartado:** comprobarlo solo en el cliente.

### 2026-10-09 · Impacto de borrados: conteo por niveles
- **Contexto:** el modal de cascada necesita filas afectadas por tabla antes de guardar.
- **Decisión:** por cada FK entrante con `CASCADE`/`SET NULL`/`SET DEFAULT` se cuenta con
  `(cols) IN (SELECT refcols FROM padre WHERE …)` anidando el predicado de los borrados (con sus
  parámetros), en una transacción de solo lectura con el `statement_timeout` del pool, recursivo en
  `CASCADE` hasta 5 niveles. Un mismo registro alcanzable por dos caminos se cuenta dos veces.
- **Descartado:** ejecutar el borrado en una transacción y revertir (exacto, pero escribe y dispara
  triggers).

### 2026-10-09 · Atajos: registro central y foco en campos de texto
- **Contexto:** la tarea 13 pide que los atajos no actúen en inputs (allí deshacen texto) y la 20
  generará la ayuda `?` desde un registro común.
- **Decisión:** `lib/shortcuts.ts` define cada atajo (`keys` con `mod` = ⌘/Ctrl, clave i18n, `inInputs`)
  y `useShortcut` lo escucha en `window`. Por defecto no actúan con el foco en input, textarea, select o
  editor de texto; `⌘S` y `⌘B` sí (guardar desde un editor de celda es lo esperado y evita el diálogo
  "guardar página"). Un handler que devuelve `false` deja pasar la tecla.
- **Descartado:** un único listener global con prioridades (innecesario con tan pocos atajos).

### 2026-10-09 · Deshacer tras guardar: pila por tabla
- **Contexto:** "⌘Z sigue disponible mientras estés en esa tabla en la sesión".
- **Decisión:** pila `done/undone` de ids por tabla en memoria del navegador; `⌘Z` actúa solo con la
  tabla abierta. Guardar un changeset no deshacible vacía la pila (deshacer saltándoselo sería confuso).
  Guardar o "Descartar y salir" borra el historial local; "Descartar" en la píldora se puede deshacer.
- **Descartado:** historial en el servidor por tabla (el registro del servidor ya es por sesión).

### 2026-10-09 · Cola de cambios: un reducer puro por tabla y un único `dispatch`
- **Contexto:** la tarea 13 necesita deshacer/rehacer sobre la cola antes de guardar.
- **Decisión:** la cola (`features/tables/changes/queue.ts`) es un dato inmutable por tabla
  (`updates` por PK, `deletes` por PK, `inserts` en orden) que solo cambia con `reduceQueue(queue,
  action)`; el store de zustand expone un único `dispatch(tableKey, action)`. Guardar el historial es
  apilar instantáneas en ese punto. Editar una celda de vuelta a su valor original la saca de la cola.
- **Descartado:** mutaciones sueltas en el store (el historial tendría que conocer cada una).

### 2026-10-09 · Qué valores se envían como `expected`
- **Contexto:** el servidor compara `expected` con la fila actual para detectar conflictos.
- **Decisión:** en un `update`, solo los valores originales de las columnas editadas (dos personas que
  editan columnas distintas de la misma fila no chocan); en un `delete`, la fila completa tal como se
  cargó (borrar algo que otra persona acaba de cambiar sí es un conflicto).
- **Descartado:** enviar siempre la fila completa (conflictos falsos por columnas que no se tocaron).

### 2026-10-09 · Editores por tipo sin librerías de calendario
- **Contexto:** el plan pide fecha/hora con calendario y JSON con un CodeMirror pequeño.
- **Decisión:** `date` usa `<input type="date">` (el calendario nativo del navegador); `timestamp` y
  `timestamptz` se editan como texto validado (`AAAA-MM-DD HH:MM:SS` con zona opcional) para no perder la
  zona horaria; JSON y arrays usan `codemirror` (`minimalSetup` + `@codemirror/lang-json`). Los números
  se envían como texto (sin perder precisión en `int8`/`numeric`). No son editables `bytea`, columnas
  generadas ni identidades `ALWAYS`. Un valor truncado se carga completo antes de editarlo.
- **Descartado:** un selector de fechas de terceros (más dependencias para lo mismo).

### 2026-10-09 · Pendientes al navegar
- **Contexto:** los cambios pendientes no deben perderse sin aviso.
- **Decisión:** la cola sobrevive a filtros, orden y páginas de la misma tabla (las filas se identifican
  por PK). Salir de la tabla (otra ruta) muestra un diálogo con `useBlocker` de TanStack Router; "Descartar
  y salir" vacía la cola. Cerrar o recargar la pestaña usa `beforeunload`.
- **Descartado:** bloquear también al cambiar de página (molesto y sin riesgo real).

### 2026-10-09 · Escritura: valores en la codificación del cable
- **Contexto:** los valores deben llegar como texto y castearse con el tipo del catálogo, pero el
  frontend tiene las celdas en la codificación del cable (números, booleanos, arrays JSON, JSON tal cual).
- **Decisión:** `changesets` acepta esa misma codificación y el servidor la pasa a texto: texto, número o
  booleano → su texto; `json`/`jsonb` → el valor JSON en sí; arrays → literal de array de Postgres. En
  `expected`, las celdas que solo describen el valor (`$bytea`, `$text` truncado) no se comparan. Así el
  cliente manda en `expected` la celda tal cual la recibió.
- **Descartado:** que el cliente mande siempre texto de Postgres (obliga a reimplementar el formato de
  arrays y de JSON en TypeScript).

### 2026-10-09 · Conflictos: comparación como texto del tipo
- **Contexto:** `json`, `point` o `xml` no tienen operador de igualdad, y `'1.5'` frente a `1.50` en
  `numeric(12,2)` debe contar como igual.
- **Decisión:** `col::text IS NOT DISTINCT FROM ($n::<tipo del catálogo>)::text` dentro del
  `SELECT … FOR UPDATE`; el valor del cliente se normaliza con el tipo antes de comparar. Las inversas
  guardan como `expected` la fila completa que devolvió `RETURNING`, así que deshacer detecta cualquier
  cambio posterior. Un insert que trae una PK ya existente también es conflicto (`exists`).
- **Descartado:** comparar en Go (no sabe normalizar cada tipo) o con `=` (falla en `json`).

### 2026-10-09 · Cuándo un changeset no se puede deshacer
- **Contexto:** la spec pide `undoable=false` con triggers de usuario o borrados con FKs entrantes
  `CASCADE`/`SET NULL`/`SET DEFAULT`.
- **Decisión:** motivos `user_triggers`, `delete_cascade` y también `update_cascade` (un update de
  columnas referenciadas con `ON UPDATE` en cascada). Un insert sigue siendo deshacible aunque la tabla
  tenga FKs entrantes en cascada: su inversa (borrar la fila nueva) comprueba `expected`, y que alguien
  haya colgado filas nuevas de ella en segundos es improbable. El servidor rechaza `undo` si hay motivos.
- **Descartado:** marcar también los inserts como no deshacibles en esas tablas (casi todas las tablas
  "padre" perderían el deshacer).

### 2026-10-09 · Códigos de error `not_writable` y `not_undoable`
- **Contexto:** escribir en una vista debe dar `422`, y `no_primary_key` explicaría mal el motivo; deshacer
  algo no deshacible (o ya deshecho) necesita su propio código para que el frontend lo traduzca.
- **Decisión:** dos códigos nuevos con sus traducciones en `en.json`/`es.json`, añadidos a `AGENTS.md`. El
  `409 conflict` lleva el detalle en `error.conflict`.
- **Descartado:** reutilizar `no_primary_key` y `bad_request`.

### 2026-10-09 · TanStack Table v8 en el grid
- **Contexto:** `pnpm add @tanstack/react-table` instala la v9, con una API nueva y poco asentada.
- **Decisión:** fijar `@tanstack/react-table@^8` (8.21). Solo se usa para definiciones y anchos ajustables
  de columnas; la virtualización es de `@tanstack/react-virtual`.
- **Descartado:** v9 (migrar cuando sea estable y aporte algo).

### 2026-10-09 · Estado de la tabla en la URL
- **Contexto:** la spec pide URLs con estado (filtros, orden, página, tamaño, pestaña) y la paginación
  keyset necesita poder volver atrás.
- **Decisión:** search params validados con un esquema `zod` en la ruta (`tableSearch.ts`); cada clave
  tiene default y `.catch`, así un enlace manipulado no rompe la pantalla. La página keyset se guarda
  como pila de cursores (`cursors`); sin PK, `offset`. Los valores por defecto se quitan de la URL con
  `stripSearchParams`. Cambiar filtros, orden o tamaño vuelve a la primera página.
- **Descartado:** guardar solo el cursor actual (no permite "anterior" sin historial del navegador).

### 2026-10-09 · "Abrir en el editor SQL" pasa la consulta por la URL
- **Contexto:** el botón "Ver SQL" del grid debe abrir la consulta en el editor, que llega en la tarea 17.
- **Decisión:** navega a `/sql?sql=<consulta>`; la ruta `/sql` ya valida ese parámetro y la tarea 17 lo
  cargará en el editor.
- **Descartado:** un store compartido en memoria (se pierde al recargar y acopla las dos pantallas).

### 2026-10-09 · Lectura de filas: formato de texto de Postgres y forma de los valores truncados
- **Contexto:** la tabla de codificación pide fechas, intervalos, etc. tal como los imprime Postgres, y
  marcar el texto largo con `truncated: true` sin confundirlo con un objeto JSON de una columna jsonb.
- **Decisión:** las consultas piden resultados en formato texto y `internal/pg/pgvalue` convierte por OID
  (arrays parseados elemento a elemento, dominios por su tipo base, tipos desconocidos como texto). El
  texto > 10 KB viaja como `{"$text": …, "truncated": true, "size": n}`; la clave con `$` lo distingue de
  un JSON de usuario, igual que `$bytea`. `AGENTS.md` actualizado.
- **Descartado:** formato binario de pgx y volver a formatear en Go (fechas e intervalos distintos de
  Postgres).

### 2026-10-09 · Filtros: semántica de `neq` y errores de valores
- **Contexto:** `col <> v` excluye las filas con NULL, y un valor mal formado (p. ej. `"abc"` en `int8`)
  lo rechaza Postgres al castear.
- **Decisión:** `neq` usa `IS DISTINCT FROM` (las filas con NULL cuentan como distintas). Los errores de
  datos de Postgres (SQLSTATE clase 22) en la API de filas responden `400 bad_request` con `pg_code` y el
  mensaje de Postgres. `contains`/`starts_with` solo en texto (`ILIKE` con `%`, `_` y `\` escapados);
  `json_contains` en json/jsonb (`col::jsonb @>`); comparaciones de orden y `between` no se permiten en
  json, bool ni arrays; `in` hasta 1.000 valores.
- **Descartado:** validar cada valor en Go por tipo (duplicaría la lógica de entrada de Postgres).

### 2026-10-09 · Selector de esquema nativo en el navegador de tablas
- **Contexto:** el navegador necesita elegir esquema; Radix Select añade bastante código y no hay más
  selects en la app todavía.
- **Decisión:** `<select>` nativo con los tokens de la app; accesible y usable con teclado sin código
  extra. El esquema elegido se guarda en `usePrefs().schema` y se sincroniza al abrir una tabla de otro
  esquema.
- **Descartado:** Radix Select (más dependencias de estilo para el mismo resultado).

### 2026-10-09 · Tipos TS generados: tygo por paquete y `snake_case`
- **Contexto:** tygo escribe un fichero por paquete (si dos comparten `output_path`, el último pisa al
  resto) y no sabe incluir tipos sueltos, solo ficheros. `AGENTS.md` decía `camelCase` en TS, pero el
  cliente no convierte y el código ya usaba `snake_case`.
- **Decisión:** los structs de la API viven en `wire.go` (server, auth), `info.go` (pg) y `types.go`
  (introspect); `tygo.yaml` los incluye con `include_files` y salida en `tmp/tygo/`, y `task gen` los
  concatena en `types.gen.ts`. Los campos se quedan en `snake_case` (nombres JSON); `AGENTS.md` actualizado.
  Los punteros son `T | null` (`optional_type: null`), sin `omitempty` en esos structs.
- **Descartado:** convertir claves a `camelCase` en el cliente (coste en cada respuesta y en las filas).

### 2026-10-09 · Introspección: caché y `Lookup`
- **Contexto:** filas, escritura y SQL necesitan validar nombres del cliente sin consultar el catálogo
  en cada petición.
- **Decisión:** `Catalog` cachea 30 s esquemas, relaciones y detalle de tabla; los "no existe" no se
  cachean (una tabla recién creada se ve al momento en `Lookup`). `Invalidate()` lo borra todo.
  FKs entrantes clonadas por partición (`conparentid <> 0`) se omiten.
- **Descartado:** `information_schema` (lento y sin tamaños, índices ni enums).

### 2026-10-09 · Sesión en cookie firmada sin estado, con lista de revocadas
- **Contexto:** la spec dice que con `GRESBASE_SESSION_SECRET` aleatorio las sesiones caducan al
  reiniciar, lo que implica que con un secreto fijo deben sobrevivir al reinicio.
- **Decisión:** la cookie lleva `expiración|id|usuario` firmado con HMAC-SHA256. Cerrar sesión borra la
  cookie y mete el id en una lista en memoria hasta su caducidad. El id es la clave de sesión para el
  estado por sesión de tareas futuras (`auth.SessionID(ctx)`, `"local"` sin login).
- **Descartado:** almacén de sesiones en memoria (se perderían al reiniciar aunque el secreto sea fijo).

### 2026-10-09 · Límite de login por IP directa y código `rate_limited`
- **Contexto:** la spec pide respetar `X-Forwarded-For` solo si viene de un proxy configurado, pero no
  define ninguna variable para configurarlo.
- **Decisión:** el límite (5 intentos por minuto, ventana fija, cuenta todos los intentos) usa siempre la
  IP del par TCP; `X-Forwarded-For` se ignora. Responde `429` con `Retry-After` y el código nuevo
  `rate_limited` (añadido a `AGENTS.md`). `X-Forwarded-Proto: https` sí se respeta para la cookie
  `Secure` (falsearlo solo perjudica a quien lo hace).
- **Descartado:** confiar en `X-Forwarded-For` siempre (permitiría saltarse el límite) o añadir una
  variable de proxies de confianza que la spec no tiene.

### 2026-10-09 · Guardia de Host: `/healthz` abierto, CSRF solo en `/api`
- **Contexto:** los healthchecks de Docker u otros contenedores pueden usar un `Host` que no es local; las
  rutas de la SPA no aceptan métodos de escritura.
- **Decisión:** sin login, `/healthz` queda fuera de la guardia (no expone datos); el resto recibe `403`
  (JSON en `/api`, página explicativa EN/ES en la UI). La cabecera `X-Gresbase: 1` se exige a todo método
  distinto de GET/HEAD/OPTIONS bajo `/api`, incluido el login. Con login activo no hay guardia de Host.
- **Descartado:** guardia también sobre `/healthz` (rompería healthchecks desde otros hosts).

### 2026-10-09 · Idioma inicial sin parpadeo
- **Contexto:** la prioridad es elección guardada → `GRESBASE_LANG` → `en`, pero `/api/v1/config` llega
  después del primer pintado.
- **Decisión:** i18next arranca con el idioma guardado en `gresbase:prefs` (lectura síncrona de
  `localStorage`); `useApplyLang` aplica después el del servidor si no hay elección. Los nombres de idioma
  ("English", "Español") se escriben en su propio idioma en ambos ficheros.
- **Descartado:** esperar a `/api/v1/config` antes de pintar (retrasa toda la app).

### 2026-10-09 · Literales en JSX con una regla nativa de ESLint
- **Contexto:** hay que detectar texto sin traducir en `features/` y `routes/`.
- **Decisión:** `no-restricted-syntax` con selectores sobre `JSXText` y atributos visibles que contengan
  letras (`\p{L}`). Sin dependencias nuevas.
- **Descartado:** `eslint-plugin-i18next` (otra dependencia para lo mismo).

### 2026-10-09 · Script anti-parpadeo del tema como fichero
- **Contexto:** la CSP es `script-src 'self'` y no admite scripts inline; el tema debe aplicarse antes
  del primer pintado.
- **Decisión:** `web/public/theme.js` (script clásico en `<head>`) lee la preferencia de `localStorage`
  (`gresbase:prefs`, formato de `zustand/persist`) y fija `data-theme`. Vite lo reescribe a `./theme.js`.
- **Descartado:** hash del script inline en la CSP (hay que mantenerlo sincronizado a mano).

### 2026-10-09 · i18next mínimo desde la tarea 04
- **Contexto:** la 04 pide claves i18n antes de que la 05 monte la librería.
- **Decisión:** `i18next` + `react-i18next` ya configurados solo con `en.json`; la 05 añade `es.json`,
  la detección del idioma y el switch. Evita una función `t` temporal que habría que migrar.
- **Descartado:** `t` provisional que devuelve la clave (la UI mostraría claves en la revisión visual).

### 2026-10-09 · Ruta base en el cliente
- **Contexto:** el servidor inyecta `<base href="{base}/">`; en Vite (dev) no hay `<base>`.
- **Decisión:** `lib/basePath.ts` lee el `<base>` al cargar (o `/`); lo usan el `basepath` del router
  y el cliente HTTP, que construye URLs absolutas con `window.location.origin`. No hace falta esperar a
  `/api/v1/config`.
- **Descartado:** obtener la base de `/api/v1/config` (una petición más antes de poder enrutar).

### 2026-10-09 · Imagen de release de GoReleaser con un Dockerfile aparte
- **Contexto:** `dockers_v2` de GoReleaser construye la imagen con un contexto que solo contiene los
  binarios ya compilados (`$TARGETPLATFORM/gresbase`), sin el código fuente.
- **Decisión:** `Dockerfile` multi-stage (Node → Go → distroless) para builds locales y el smoke test;
  `Dockerfile.release` mínimo para GoReleaser. `/data` se crea copiando `/home/nonroot` de la propia
  imagen distroless (vacío y con dueño 65532), porque distroless no tiene shell. El dueño de la imagen
  sale de `IMAGE_OWNER` (el workflow usa `github.repository_owner`).
- **Descartado:** construir la imagen de release con `docker/build-push-action` fuera de GoReleaser
  (dos fuentes de verdad para etiquetas y versiones).

### 2026-10-09 · Smoke test de la imagen en la red de la base de desarrollo
- **Contexto:** con `DOCKER_HOST` remoto (dind) el contenedor de la app no ve `localhost` del cliente.
- **Decisión:** `scripts/smoke-docker.sh` arranca la base de `deploy/docker-compose.dev.yml`, conecta el
  contenedor a su red (`postgres:5432`), publica un puerto aleatorio y lo consulta en el host de
  `DOCKER_HOST` con `Host: localhost` (sigue valiendo cuando llegue la guardia de Host de la tarea 06).
- **Descartado:** `--network host` (no funciona con un daemon remoto).

### 2026-10-09 · testcontainers con Ryuk sobre dind
- **Contexto:** los tests corren dentro de `workspace` con `DOCKER_HOST=tcp://docker:2375`.
- **Decisión:** Ryuk activo (por defecto): funciona contra dind con `TESTCONTAINERS_HOST_OVERRIDE=docker`
  y limpia los contenedores aunque el test muera. Además `pgtest.Main` termina el contenedor al acabar.
- **Descartado:** `TESTCONTAINERS_RYUK_DISABLED=true` (deja contenedores huérfanos si el test aborta).

### 2026-10-09 · Bases limpias por test con una plantilla sin conexiones
- **Contexto:** `CREATE DATABASE … TEMPLATE app` falla si alguien está conectado a `app`, y los tests de
  lectura comparten esa base.
- **Decisión:** al arrancar, `pgtest` copia el seed a `gresbase_seed`, a la que nadie se conecta;
  `NewDatabase` clona esa plantilla y la borra con `DROP DATABASE … WITH (FORCE)` al terminar el test.
- **Descartado:** un contenedor por test (lento) o reseed con los `.sql` (lento con 12.000 usuarios).

### 2026-10-09 · Códigos HTTP de los errores de base de datos
- **Contexto:** hace falta una traducción única de errores de Postgres al formato común de la API.
- **Decisión:** `api.DBError`: error de Postgres → `422 pg_error` con SQLSTATE, detalle, pista y
  posición; `25006` → `403 read_only`; `57014` y plazo agotado → `504 timeout`; contexto cancelado →
  `400 canceled`; cualquier otro (conexión caída) → `503 internal` sin detalles.
- **Descartado:** `500` para todo (el frontend no podría distinguir errores del usuario de caídas).

### 2026-10-09 · Reintentos de conexión al arrancar
- **Contexto:** la spec pide reintentar hasta 30 s y explicar el fallo.
- **Decisión:** backoff de 250 ms a 2 s; contraseña, base inexistente y SSL son fallos permanentes y no
  se reintentan. Si se agota el plazo se informa del último error real (p. ej. `connection_refused`), no
  de un genérico "timeout". SSL se detecta por texto porque pgx no expone un tipo de error.
- **Descartado:** reintentar todo durante 30 s (con contraseña mala solo retrasa el mensaje).

### 2026-10-09 · Frontend embebido desde `internal/ui/dist`
- **Contexto:** `go:embed` no puede subir de directorio, así que `internal/ui` no puede embeber `web/dist`.
- **Decisión:** Vite compila directamente en `internal/ui/dist` (`build.outDir`), con un `.gitkeep`
  versionado que un plugin de Vite recrea tras vaciar la carpeta; sin build, el servidor responde `503`
  "frontend not built" en las rutas de la UI.
- **Descartado:** copiar `web/dist` en un paso aparte (otra pieza que olvidar) o un paquete Go en `web/`.

### 2026-10-09 · Ruta base con `<base href>` y assets relativos
- **Contexto:** `GRESBASE_BASE_PATH` se decide en runtime, pero Vite fija las URLs de assets al compilar.
- **Decisión:** Vite compila con `base: './'` y el servidor inyecta `<base href="{base}/">` en
  `index.html`; las rutas del servidor se montan con `http.StripPrefix`. `/api/v1/config` expone
  `base_path` para el router del cliente.
- **Descartado:** reescribir las URLs de los assets al servir.

### 2026-10-09 · CSP con estilos inline
- **Contexto:** la CSP debe ser estricta y sin orígenes externos, pero TanStack Virtual y Radix posicionan
  con atributos `style`.
- **Decisión:** `default-src 'self'`, `script-src 'self'` (sin inline), `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`, `frame-ancestors 'none'`, `object-src 'none'`.
- **Descartado:** nonces de estilo (no cubren atributos `style`).

### 2026-10-09 · Recarga del backend por sondeo
- **Contexto:** `task --watch` no detectaba cambios ni reiniciaba el proceso largo en el bind mount de
  Windows.
- **Decisión:** `scripts/dev-api.sh` compila, arranca y reinicia el binario cuando cambia la huella
  (ruta + mtime) de los `.go`, comprobada cada segundo.
- **Descartado:** `air` u otra herramienta extra en la imagen.

### 2026-10-09 · Versiones del frontend fijadas por compatibilidad
- **Contexto:** `pnpm add` instaló TypeScript 7 y MSW 3, pero `typescript-eslint` 8.71 exige
  `typescript <6.1` y `@vitest/mocker` 5 espera `msw ^2`.
- **Decisión:** `typescript ~6.0` y `msw ^2`. pnpm 12 falla ante scripts de instalación no aprobados:
  `web/pnpm-workspace.yaml` declara `allowBuilds: {msw: false}` (el `postinstall` de MSW solo copia el
  service worker, que no usamos: los tests usan `msw/node`).
- **Descartado:** quitar `typescript-eslint` o ignorar los avisos de peers.

### 2026-10-09 · Playwright vive en `web/`, los specs en `e2e/`
- **Contexto:** `web/node_modules` es un volumen del entorno; un segundo `node_modules` en `e2e/` necesitaría
  otro volumen y otro lockfile.
- **Decisión:** en la tarea 24, `@playwright/test` se añade a `web/package.json` y su configuración
  apunta a `../e2e` como `testDir`. Un solo lockfile y un solo `pnpm install`.
- **Descartado:** workspace de pnpm en la raíz con `e2e/` como paquete propio.

### 2026-10-09 · `safe.directory` y permisos del bind mount en el contenedor
- **Contexto:** en el contenedor, `/workspace` aparece como propiedad de root, así que `go build` (VCS
  stamping) y `git describe` fallaban con "dubious ownership". Además, una carpeta creada por Docker como
  punto de montaje (`web/` al crear el volumen de `node_modules`) quedó con permisos 755 de root.
- **Decisión:** la imagen de desarrollo hace `git config --system --add safe.directory /workspace`.
  Si una carpeta del proyecto la crea Docker, se arregla con
  `docker compose -f dev.compose.yml exec -T -u root workspace chmod 777 /workspace/<dir>` (en Git Bash,
  con `MSYS_NO_PATHCONV=1`). `web/` ya está en el repo, así que en un clon nuevo no pasa.
  pnpm 11+ ignora `npm_config_store_dir`: la imagen define también `pnpm_config_store_dir` para que
  el store no acabe en `/workspace/.pnpm-store`.
- **Descartado:** `-buildvcs=false` (perdería la versión en `task build` dentro del contenedor).

### 2026-10-09 · Datos del seed deterministas
- **Contexto:** los tests de integración comprobarán valores exactos del seed.
- **Decisión:** `deploy/seed/02_data.sql` no usa `random()`; todo sale de `generate_series`. Incluye un
  usuario con `id = 9007199254740993` (> 2^53) para probar la precisión de `int8`, y la tabla
  particionada `events` usa `bigserial` (identidad en tablas particionadas no es uniforme en PG 14–16).
- **Descartado:** datos aleatorios con semilla (`setseed`), menos legibles en los tests.

### 2026-10-09 · `web/node_modules` y caché de Go en volúmenes
- **Contexto:** el bind mount de Windows es lento y no garantiza los symlinks que crea pnpm.
- **Decisión:** `web/node_modules` y `~/.cache/go-build` son volúmenes con nombre del compose de
  desarrollo (creados en la imagen con dueño `dev`). En Windows aparece una carpeta `web/node_modules`
  vacía, ignorada por git.
- **Descartado:** `node-linker=hoisted` sobre el bind mount.

### 2026-10-09 · Entorno en Windows: toolchain en contenedor, git en el anfitrión
- **Contexto:** el anfitrión de desarrollo puede ser Windows sin Go ni Node, y montar el ssh-agent en el
  contenedor solo es sencillo en macOS y Linux.
- **Decisión:** comandos de desarrollo con `docker compose -f dev.compose.yml exec -T workspace bash -lc …`;
  git y SSH desde Windows. Se quitan del servicio `workspace` los montajes de ssh-agent, `.gitconfig` y
  `.ssh` y las variables `SSH_AUTH_SOCK`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `GIT_CONFIG_*`.
  `.gitattributes` con `eol=lf` y `core.autocrlf=false`.
- **Descartado:** WSL2 con el ssh-agent montado (más piezas que configurar en cada máquina).

### 2026-10-09 · Arreglos del Dockerfile de desarrollo
- **Contexto:** el build fallaba con `exit code: 127` en `groupadd`, y en `bash -l` no aparecían `go`,
  `task` ni `golangci-lint`.
- **Decisión:** `PATH` del `ENV` incluye `/usr/sbin` y `/sbin`; `/etc/profile.d/gresbase-path.sh`
  restaura `go/bin`, `/usr/local/go/bin` y `PNPM_HOME`, porque `/etc/profile` reinicia `PATH` en shells
  de login.
- **Descartado:** rutas absolutas a las herramientas en el Taskfile.

### 2026-10-09 · Puertos del anfitrión 18080 y 15173
- **Contexto:** 8080 y 5173 ya están ocupados en la máquina por otros proyectos y `up` fallaba con
  `port is already allocated`.
- **Decisión:** el compose publica `127.0.0.1:${GRESBASE_HOST_PORT:-18080}:8080` y
  `127.0.0.1:${VITE_HOST_PORT:-15173}:5173`. Dentro del contenedor los puertos siguen siendo 8080 y 5173.
- **Descartado:** parar los contenedores de otros proyectos.

### 2026-10-09 · Guardia de Host cuando no hay login
- **Contexto:** dentro de Docker el servidor escucha en `0.0.0.0`, así que no puede saber si el puerto se
  publicó solo en `127.0.0.1`.
- **Decisión:** sin login, solo se aceptan peticiones cuyo `Host` sea local (o esté en
  `GRESBASE_ALLOWED_HOSTS`). Protege de exposición accidental y de DNS rebinding.
- **Descartado:** negarse a arrancar sin login si no se escucha en loopback (imposible de detectar en Docker).

### 2026-10-09 · Detector de SQL destructivo sin cgo
- **Contexto:** `pg_query_go` es el parser real de Postgres pero exige cgo y complica la imagen multi-arch.
- **Decisión:** tokenizador propio en `internal/pg/sqlguard`. Es una ayuda de UX, no seguridad.
- **Descartado:** `pg_query_go`.

### 2026-10-09 · Paginación keyset con desempate por PK
- **Contexto:** offset es lento en tablas grandes e inestable si cambian datos.
- **Decisión:** keyset cuando hay PK (orden del usuario + PK como desempate); offset sin PK.
- **Descartado:** solo offset.

### 2026-10-09 · Escritura con cola, transacción y deshacer por operaciones inversas
- **Contexto:** queremos una UX segura y deshacer real.
- **Decisión:** toda escritura de datos pasa por `internal/pg/write`, en una transacción, con
  comprobación de conflictos y cálculo de la inversa; deshacer desactivado si hay triggers o cascadas.
- **Descartado:** guardar celda a celda sin cola.

### 2026-10-09 · int8 y numeric como texto en JSON
- **Contexto:** JavaScript pierde precisión por encima de 2^53.
- **Decisión:** `int8`, `numeric` y `money` viajan como texto.
- **Descartado:** números JSON.

### 2026-10-09 · Stack
- **Decisión:** Go (binario único, imagen distroless) + React/Vite/TS, TanStack, CodeMirror 6,
  Tailwind v4 + Radix, i18next. Ver `AGENTS.md`.
- **Descartado:** backend Node/TypeScript (imagen más pesada y arranque más lento).
