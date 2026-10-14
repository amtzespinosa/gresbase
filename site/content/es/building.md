---
description: Compila tú mismo el binario y la imagen Docker de Gresbase, con los mismos comandos que usa el proyecto.
---

## Antes de empezar {#before-you-start}

La forma recomendada solo necesita Docker y git. Todas las herramientas corren dentro del contenedor de desarrollo.

Si prefieres compilar en tu máquina, necesitas:

| Herramienta | Versión | De dónde sale |
| --- | --- | --- |
| Go | 1.27.2 | `go.mod` |
| Node.js | 22 o posterior | `engines` en `web/package.json` |
| pnpm | 12.10.1 | `packageManager` en `web/package.json` (actívalo con `corepack enable`) |
| Task | v3 | `Taskfile.yml` |

:::note
No hace falta compilar Gresbase para usarlo: cada versión publica la imagen `{{imageName}}` y binarios para Linux, macOS y Windows. Compílalo tú para probar cambios aún sin publicar o para contribuir.
:::

## Construir la imagen Docker {#image}

Lanza esto desde la raíz del repositorio. No te hace falta Go ni Node: el `Dockerfile` trae los suyos.

```sh title="Terminal"
docker build -t gresbase --build-arg VERSION=dev .
```

La construcción tiene tres etapas:

1. `node:22-bookworm-slim` instala las dependencias web con pnpm y compila el frontend.
2. `golang:1.27-bookworm` compila un binario estático con `CGO_ENABLED=0` y el frontend dentro.
3. `gcr.io/distroless/static-debian12:nonroot` es la imagen final: el binario, las licencias en `/licenses/` y el volumen `/data`.

`VERSION` es opcional y vale `dev` si no la pasas. El binario la muestra con `gresbase version`. La imagen escucha en el puerto 8080, corre sin root y trae su propia comprobación de salud (`gresbase healthcheck`).

Usa `gresbase` como nombre de imagen en los ejemplos de [Con docker run](./docker-run.md) o del [Inicio rápido](./quick-start.md).

## Usar el contenedor de desarrollo {#dev-container}

`dev.compose.yml` arranca un contenedor con Go, Node 22 con pnpm, Task, golangci-lint, tygo, Playwright y `psql`. También levanta su propio daemon de Docker para los tests de integración y la base de ejemplo.

:::steps
### Arranca el contenedor {#start-container}

```sh title="Terminal"
docker compose -f dev.compose.yml up -d --build
```

La primera vez tarda un rato. Después reutiliza la imagen y las cachés.

### Lanza una tarea dentro {#run-task}

```sh title="Terminal"
docker compose -f dev.compose.yml exec -T workspace bash -lc "task build"
```

Cambia `task build` por cualquier comando de la tabla de abajo.

### Desarrolla con recarga {#dev}

```sh title="Terminal"
docker compose -f dev.compose.yml exec workspace bash -lc "task dev"
```

Abre `http://localhost:15173` para Vite o `http://localhost:18080` para el backend. El backend se reinicia cuando cambia un fichero de Go.
:::

:::tip
Usa git desde tu máquina, no desde el contenedor. El contenedor no tiene identidad de git ni claves SSH.
:::

## Comandos de Task {#tasks}

| Comando | Qué hace |
| --- | --- |
| `task build` | Compila el frontend y luego `bin/gresbase` con el frontend dentro |
| `task dev` | PostgreSQL de ejemplo, backend con recarga y Vite |
| `task dev:db` | Solo el PostgreSQL de ejemplo (`deploy/docker-compose.dev.yml`) |
| `task test` | Tests de Go y Vitest |
| `task test:go:all` | Tests de Go contra PostgreSQL 12 a 19, una versión tras otra |
| `task e2e` | Playwright contra el binario compilado y una base de ejemplo recién creada |
| `task lint` | golangci-lint, ESLint, `tsc`, Prettier, tipos generados, informe de licencias y actionlint |
| `task gen` | Regenera `web/src/lib/api/types.gen.ts` desde los structs de Go con tygo |
| `task licenses` | Regenera el informe y los avisos de licencias de terceros |
| `task ci:quick` | CI local de cada merge: lint, tipos generados, Go en PostgreSQL 18, Vitest y e2e en 18 |
| `task ci:full` | `ci:quick` más Go de 12 a 19, e2e en 12, 17 y 18, el binario, la imagen y una prueba de humo en Docker |
| `task image:local` | Construye la imagen `gresbase:local` |
| `task image:export` | Guarda `gresbase:local` en `dist/gresbase-local.tar` |

Los tests de integración de Go arrancan un PostgreSQL real con testcontainers. `PG_VERSION` elige su versión (17 por defecto).

## Cómo se compila el binario {#binary}

`task build` lanza primero `pnpm build` en `web/`. Vite deja el frontend en `internal/ui/dist` y el paquete `internal/ui` lo incrusta con `go:embed`.

Después ejecuta `go build` sobre `./cmd/gresbase` y genera `bin/gresbase`. El Taskfile fija `CGO_ENABLED=0`, así que el binario es estático y no depende de nada del sistema.

La versión sale de `git describe`. Sin tag es `dev+<commit corto>`, con `-dirty` si hay cambios sin commitear.

Para usar el binario fuera de Docker, dale una base de datos y una carpeta de datos con permiso de escritura:

```sh title="Terminal"
DATABASE_URL=postgres://USUARIO:CONTRASEÑA@HOST:5432/BASE \
GRESBASE_DATA_DIR=./data \
./bin/gresbase
```

Escucha en el puerto 8080 (`GRESBASE_PORT`) en todas las interfaces. `GRESBASE_DATA_DIR` vale `/data` por defecto, una ruta que fuera de un contenedor casi nunca existe. El resto de opciones están en [Variables de entorno](./environment.md).

## Probar una imagen local en otra máquina {#local-image}

`task image:local` construye `gresbase:local` en el daemon de Docker propio del contenedor de desarrollo. El Docker de tu máquina no la ve.

Para sacarla, expórtala y cárgala en tu máquina:

```sh title="Terminal"
docker compose -f dev.compose.yml exec -T workspace bash -lc "task image:export"
docker load -i dist/gresbase-local.tar
```

La carpeta del proyecto está montada en el contenedor, así que `dist/gresbase-local.tar` aparece en tu copia del repositorio.

`goreleaser release --snapshot --clean` compila en local los binarios sueltos para Linux, macOS y Windows (amd64 y arm64). No publica nada.
