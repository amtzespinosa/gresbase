<p align="right"><a href="README.md">English</a> · <b>Español</b></p>

<div align="center">

<img src="assets/brand/app-icon.svg" width="96" height="96" alt="Logo de Gresbase: un mamut negro sobre un cuadrado amarillo">

<h1>gresbase</h1>

<p><b>Un estudio moderno y autoalojado para cualquier PostgreSQL. Un contenedor, cero configuración.</b></p>

<p>
  <a href="LICENSE"><img alt="Licencia: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-FFC929?style=flat-square"></a>
  <a href="https://github.com/amtzespinosa/gresbase/releases"><img alt="Última versión" src="https://img.shields.io/github/v/release/amtzespinosa/gresbase?style=flat-square&color=FFC929&label=release"></a>
  <a href="https://github.com/amtzespinosa/gresbase/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/amtzespinosa/gresbase/ci.yml?branch=main&style=flat-square&label=ci"></a>
  <a href="#compatibilidad"><img alt="PostgreSQL 12–19" src="https://img.shields.io/badge/PostgreSQL-12%E2%80%9319-FFC929?style=flat-square&logo=postgresql&logoColor=white"></a>
  <a href="https://github.com/amtzespinosa/gresbase/pkgs/container/gresbase"><img alt="Imagen en GHCR" src="https://img.shields.io/badge/image-ghcr.io-FFC929?style=flat-square&logo=docker&logoColor=white"></a>
  <a href="go.mod"><img alt="Versión de Go" src="https://img.shields.io/github/go-mod/go-version/amtzespinosa/gresbase?style=flat-square&color=FFC929&logo=go&logoColor=white"></a>
</p>

<p>
  <a href="https://gresbase.pages.dev/es/docs/introduction/">Documentación</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#prueba-la-demo">Demo</a> ·
  <a href="CHANGELOG.md">Cambios</a> ·
  <a href="README.md">English</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/hero-dark.gif">
  <img src=".github/assets/hero-light.gif" width="960" alt="Gresbase en acción: explorar tablas, editar dos celdas en la cola de cambios, revisar el SQL, guardar y deshacer, y ejecutar una consulta en el editor SQL">
</picture>

</div>

## Contenido

- [Por qué Gresbase](#por-qué-gresbase)
- [Funciones](#funciones)
- [Inicio rápido](#inicio-rápido)
  - [Prueba la demo](#prueba-la-demo)
  - [Añádelo a tu proyecto](#añádelo-a-tu-proyecto)
  - [Sin configuración: el asistente](#sin-configuración-el-asistente)
- [Capturas](#capturas)
- [Comparativa](#comparativa)
- [Configuración](#configuración)
  - [Variables principales](#variables-principales)
  - [Fichero de ajustes](#fichero-de-ajustes)
- [Seguridad](#seguridad)
- [Compatibilidad](#compatibilidad)
- [Hoja de ruta](#hoja-de-ruta)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Por qué Gresbase

Adminer y pgAdmin siguen cumpliendo, pero **se sienten de otra década**, y cada edición va directa a la
base de datos. Supabase Studio es un gusto de usar, pero **viene con todo Supabase**.

Gresbase es **un contenedor pequeño** que pones junto a tu Postgres. Cada cambio **espera en una cola**,
enseña su SQL y se puede deshacer incluso después de guardarlo.

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Funciones

<table>
  <tr>
    <td width="50%"><b>Tablas rápidas</b><br>Grid virtualizado, <b>paginación por clave</b>, filtros y orden por varias columnas en la URL.</td>
    <td width="50%"><b>Cola de cambios</b><br>Las ediciones esperan con su diff y su SQL, y se guardan en <b>una transacción</b>.</td>
  </tr>
  <tr>
    <td><b>Deshacer y rehacer</b><br><b>También después de guardar</b>, con operaciones inversas que comprueban conflictos.</td>
    <td><b>Edición de estructura</b><br>Tablas, columnas, índices, restricciones y claves foráneas, con <b>el DDL exacto</b> antes.</td>
  </tr>
  <tr>
    <td><b>Editor SQL</b><br><b>Autocompletado</b>, pestañas, parámetros <code>:nombre</code>, modo transacción, historial y consultas guardadas.</td>
    <td><b>Como una hoja de cálculo</b><br>Copia un rectángulo como TSV, CSV, JSON o <code>INSERT</code>; <b>pega en la cola</b>.</td>
  </tr>
  <tr>
    <td><b>Varias conexiones</b><br>Conexiones guardadas con etiqueta de color; <b>cada pestaña del navegador</b> puede usar una.</td>
    <td><b>Modo libre</b><br>Entra con <b>cualquier usuario de Postgres</b>, como en Adminer, solo en los servidores que permitas.</td>
  </tr>
  <tr>
    <td><b>Cero configuración</b><br>Variables de entorno o <b>un asistente</b>; ajustes en un fichero, secretos cifrados.</td>
    <td><b>Seguro por defecto</b><br><b>Solo localhost</b> sin login, modo solo lectura, timeouts, CSRF y límite de intentos.</td>
  </tr>
  <tr>
    <td><b>Importar y exportar</b><br>CSV a tablas existentes; exportaciones que <b>llegan desde el primer byte</b>.</td>
    <td><b>Pequeño y privado</b><br>Una imagen, funciona sin internet, <b>sin telemetría</b>; en español e inglés, claro y oscuro.</td>
  </tr>
</table>

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Inicio rápido

### Prueba la demo

PostgreSQL con datos de ejemplo y Gresbase, con la imagen publicada. **Solo necesitas Docker:**

```bash
curl -fsSLO https://raw.githubusercontent.com/amtzespinosa/gresbase/main/deploy/docker-compose.demo.yml
docker compose -f docker-compose.demo.yml up -d
```

Abre **<http://localhost:8080>**. Los puertos 8081 a 8084 muestran las otras formas de usar Gresbase:
con login, solo lectura, asistente y modo libre, descritas al principio del fichero.

Para borrarlo todo: `docker compose -f docker-compose.demo.yml down -v`.

### Añádelo a tu proyecto

Pon Gresbase **junto a tu Postgres** en tu `docker-compose.yml`:

```yaml
services:
  gresbase:
    image: ghcr.io/amtzespinosa/gresbase:0.3
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app?sslmode=disable
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - gresbase-data:/data

volumes:
  gresbase-data:
```

```bash
docker compose up -d
```

Después abre <http://localhost:8080>. Cada [versión](https://github.com/amtzespinosa/gresbase/releases)
incluye binarios para **Linux, macOS y Windows**.

### Sin configuración: el asistente

Sin `DATABASE_URL`, Gresbase **arranca un asistente de configuración**. El log trae un enlace con su
token, o imprime el token con:

```bash
docker compose exec gresbase /gresbase setup-token
```

La [guía de inicio rápido](https://gresbase.pages.dev/es/docs/quick-start/) cubre `docker run`, el
asistente y **bases de datos fuera de Docker**.

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Capturas

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/tables-desktop-light.png" alt="Tablas, tema claro">
      <p align="center"><sub>Tablas · claro</sub></p>
    </td>
    <td width="50%">
      <img src="docs/screenshots/sql-desktop-dark.png" alt="Editor SQL con resultados, tema oscuro">
      <p align="center"><sub>Editor SQL · oscuro</sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/structure-desktop-dark.png" alt="Estructura: columnas, índices y restricciones, tema oscuro">
      <p align="center"><sub>Estructura · oscuro</sub></p>
    </td>
    <td width="50%">
      <img src="docs/screenshots/setup-desktop-light.png" alt="Asistente de configuración, primer paso, tema claro">
      <p align="center"><sub>Asistente · claro</sub></p>
    </td>
  </tr>
</table>

Más pantallas, en escritorio y tableta, en [`docs/screenshots/`](docs/screenshots/). Las capturas
están en inglés; **la app también está en español**.

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Comparativa

Cada herramienta de esta tabla es buena en algo. Así se diferencian **para lo que hace Gresbase**: una
interfaz web junto a tu propio Postgres.

| | Gresbase | Adminer | pgAdmin | Supabase Studio | DbGate |
| --- | --- | --- | --- | --- | --- |
| Interfaz web autoalojada | Sí | Sí | Sí (también escritorio) | Con todo Supabase | Sí (también escritorio) |
| Un contenedor y nada más | Sí | Sí | Sí | No | Sí |
| Bases de datos | PostgreSQL | Muchas | PostgreSQL | PostgreSQL | Muchas, SQL y NoSQL |
| Las ediciones esperan a guardar | Sí, con diff y SQL | No | Sí | No | Sí |
| Deshacer después de guardar | Sí | No | No | No | No |
| Edición de estructura | Sí | Sí | Sí | Sí | Sí |
| Administración del servidor (roles, copias, monitorización) | Aún no | Parcial | Sí | Funciones de la plataforma | Parcial |
| Licencia | Apache-2.0 | Apache-2.0 o GPL-2.0 | PostgreSQL | Apache-2.0 | GPL-3.0 |

Elige **pgAdmin** para administrar el servidor a fondo, **Adminer o DbGate** si trabajas con varios
motores de bases de datos, y **Supabase Studio** si usas Supabase.

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Configuración

**Todos los ajustes son opcionales.** Usa variables de entorno o cámbialos desde la app.

### Variables principales

| Variable | Qué hace |
| --- | --- |
| `DATABASE_URL` | La base que se abre. Sin ella, el asistente o las conexiones guardadas. |
| `GRESBASE_USER` / `GRESBASE_PASSWORD` | Activan el inicio de sesión. Sin cuenta, solo se acepta `localhost`. |
| `GRESBASE_READ_ONLY` | `true` bloquea cualquier escritura. |
| `GRESBASE_MODE_FREE` | `true` entra con credenciales de Postgres, como en Adminer. |
| `GRESBASE_ALLOWED_DB_HOSTS` | Servidores a los que llega el modo libre (hosts, IP o CIDR). |
| `GRESBASE_ALLOWED_HOSTS` | Nombres de host extra aceptados sin inicio de sesión. |
| `GRESBASE_TRUSTED_PROXIES` | Proxies inversos cuyo `X-Forwarded-For` da la IP del cliente. |
| `GRESBASE_BASE_PATH` | Servir bajo una ruta, como `/gresbase`. |
| `GRESBASE_STATEMENT_TIMEOUT` | Límite de tiempo por consulta (`30s` por defecto). |
| `GRESBASE_DATA_DIR` | Ajustes y consultas guardadas (`/data`); monta un volumen ahí. |

### Fichero de ajustes

Los ajustes cambiados desde la app se guardan en `gresbase.json`, y **una variable de entorno siempre
manda** sobre él. Los secretos de ese fichero van cifrados.

Todas las variables, puertos y límites están en la
[referencia de configuración](https://gresbase.pages.dev/es/docs/configuration-reference/).

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Seguridad

- Sin cuenta, Gresbase **solo responde a peticiones para `localhost`**, contra la exposición accidental
  y el DNS rebinding.
- Las contraseñas se guardan como **hash argon2id**, los secretos de `gresbase.json` van cifrados y los
  logs nunca llevan credenciales.
- Las sesiones usan cookies `SameSite=Strict` y una cabecera contra CSRF; **los intentos fallidos están
  limitados**.
- El modo solo lectura se aplica **dos veces**: en la sesión de la base y en la API.
- Cada consulta tiene un timeout, y las consultas largas **siguen vivas detrás de Nginx o Cloudflare**.
- El límite real es **el rol de Postgres con el que conectas**: dale solo los privilegios que quieras.

Proxies inversos, HTTPS y el token de configuración están en
[Seguridad y red](https://gresbase.pages.dev/es/docs/security/).

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Compatibilidad

| PostgreSQL | Soporte |
| --- | --- |
| 14, 15, 16, 17, 18 | Completo, probado en cada cambio |
| 19 | Completo, probado con la última beta hasta que salga |
| 12, 13 | Heredado: probado en cada cambio; algunas funciones dependen de la versión y la interfaz lo dice |
| 11 y anteriores | Sin soporte; Gresbase lo explica al conectar |

La imagen funciona en **`linux/amd64` y `linux/arm64`**. El detalle por versión está en
[`docs/compatibility.md`](docs/compatibility.md).

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Hoja de ruta

- **Búsqueda global:** encontrar un valor en todas las tablas, con progreso y resultados por tabla.
- **Edición Studio (0.4):** modo avanzado, esquema visual, métricas y `EXPLAIN` visual.
- **Administración (0.5):** roles, extensiones, vistas, funciones, triggers, RLS y copias de seguridad.
- **Equipos (0.6):** varios usuarios con roles, permisos por conexión, SSO y registro de auditoría.

El plan completo está en [`docs/spec.md`](docs/spec.md).

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Contribuir

**Las issues y pull requests son bienvenidas.** Empieza por [`CONTRIBUTING.md`](CONTRIBUTING.md); el
stack, las reglas de seguridad y las convenciones están en [`AGENTS.md`](AGENTS.md), tanto para
personas como para agentes de código.

**Solo necesitas Docker y git:** todas las herramientas van en el contenedor de desarrollo.

```bash
docker compose -f dev.compose.yml up -d --build
docker compose -f dev.compose.yml exec workspace bash -lc "task dev"
```

<div align="right"><a href="#readme">↑ Volver arriba</a></div>

## Licencia

Gresbase se distribuye bajo la **[Apache License 2.0](LICENSE)**. Copyright 2026 Alex M. Espinosa;
consulta [`NOTICE`](NOTICE).

El **nombre Gresbase y el logo del mamut** no entran en la licencia: los forks usan otro nombre y otro
logo, como explica [`TRADEMARKS.md`](TRADEMARKS.md). Las licencias de terceros están en
[`docs/third-party-licenses.md`](docs/third-party-licenses.md).

<div align="right"><a href="#readme">↑ Volver arriba</a></div>
