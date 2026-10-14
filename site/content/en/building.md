---
description: Build the Gresbase binary and Docker image yourself, with the same commands the project uses.
---

## Before you start {#before-you-start}

The recommended way needs only Docker and git. Every toolchain runs inside the development container.

If you prefer to build on your own machine, you need:

| Tool | Version | Where it comes from |
| --- | --- | --- |
| Go | 1.27.2 | `go.mod` |
| Node.js | 22 or newer | `engines` in `web/package.json` |
| pnpm | 12.10.1 | `packageManager` in `web/package.json` (enable it with `corepack enable`) |
| Task | v3 | `Taskfile.yml` |

:::note
You don't need to build Gresbase to use it: each release publishes the image `{{imageName}}` and binaries for Linux, macOS and Windows. Build it yourself to try unreleased changes or to contribute.
:::

## Build the Docker image {#image}

Run this from the root of the repository. You don't need Go or Node: the `Dockerfile` brings its own.

```sh title="Terminal"
docker build -t gresbase --build-arg VERSION=dev .
```

The build has three stages:

1. `node:22-bookworm-slim` installs the web dependencies with pnpm and compiles the frontend.
2. `golang:1.27-bookworm` compiles a static binary with `CGO_ENABLED=0` and the frontend embedded.
3. `gcr.io/distroless/static-debian12:nonroot` is the final image: the binary, the license files in `/licenses/` and the `/data` volume.

`VERSION` is optional and defaults to `dev`. The binary prints it with `gresbase version`. The image listens on port 8080, runs as a non-root user and has its own health check (`gresbase healthcheck`).

Use `gresbase` as the image name in the examples of [Running with docker run](./docker-run.md) or the [Quick start](./quick-start.md).

## Use the development container {#dev-container}

`dev.compose.yml` starts a container with Go, Node 22 with pnpm, Task, golangci-lint, tygo, Playwright and `psql`. It also starts its own Docker daemon for integration tests and the sample database.

:::steps
### Start the container {#start-container}

```sh title="Terminal"
docker compose -f dev.compose.yml up -d --build
```

The first build takes a while. Later starts reuse the image and the caches.

### Run a task inside it {#run-task}

```sh title="Terminal"
docker compose -f dev.compose.yml exec -T workspace bash -lc "task build"
```

Replace `task build` with any command from the table below.

### Develop with live reload {#dev}

```sh title="Terminal"
docker compose -f dev.compose.yml exec workspace bash -lc "task dev"
```

Open `http://localhost:15173` for Vite or `http://localhost:18080` for the backend. The backend restarts when a Go file changes.
:::

:::tip
Use git from your machine, not from the container. The container has no git identity and no SSH keys.
:::

## Task commands {#tasks}

| Command | What it does |
| --- | --- |
| `task build` | Builds the frontend and then `bin/gresbase` with the frontend embedded |
| `task dev` | Sample PostgreSQL, backend with reload and Vite |
| `task dev:db` | Sample PostgreSQL only (`deploy/docker-compose.dev.yml`) |
| `task test` | Go tests and Vitest |
| `task test:go:all` | Go tests against PostgreSQL 12 to 19, one version after another |
| `task e2e` | Playwright against the compiled binary and a freshly reset sample database |
| `task lint` | golangci-lint, ESLint, `tsc`, Prettier, generated types, license report and actionlint |
| `task gen` | Regenerates `web/src/lib/api/types.gen.ts` from the Go structs with tygo |
| `task licenses` | Regenerates the third-party license report and notices |
| `task ci:quick` | Local CI for every merge: lint, generated types, Go on PostgreSQL 18, Vitest and e2e on 18 |
| `task ci:full` | `ci:quick` plus Go on 12 to 19, e2e on 12, 17 and 18, the binary, the image and a Docker smoke test |
| `task image:local` | Builds the image `gresbase:local` |
| `task image:export` | Saves `gresbase:local` to `dist/gresbase-local.tar` |

The Go integration tests start a real PostgreSQL with testcontainers. `PG_VERSION` picks its version (17 by default).

## How the binary is built {#binary}

`task build` runs `pnpm build` in `web/` first. Vite writes the frontend to `internal/ui/dist`, and the `internal/ui` package embeds that folder with `go:embed`.

Then it runs `go build` on `./cmd/gresbase` and writes `bin/gresbase`. The Taskfile sets `CGO_ENABLED=0`, so the binary is static and has no system dependencies.

The version comes from `git describe`. Without a tag it is `dev+<short commit>`, with `-dirty` if there are uncommitted changes.

To run the binary outside Docker, point it at a database and at a writable data folder:

```sh title="Terminal"
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
GRESBASE_DATA_DIR=./data \
./bin/gresbase
```

It listens on port 8080 (`GRESBASE_PORT`) on every interface. `GRESBASE_DATA_DIR` is `/data` by default, which rarely exists outside a container. The rest of the options are in [Environment variables](./environment.md).

## Try a local image on another machine {#local-image}

`task image:local` builds `gresbase:local` inside the development container's own Docker daemon. Your machine's Docker doesn't see it.

To take it out, export it and load it on your machine:

```sh title="Terminal"
docker compose -f dev.compose.yml exec -T workspace bash -lc "task image:export"
docker load -i dist/gresbase-local.tar
```

The project folder is mounted in the container, so `dist/gresbase-local.tar` appears in your copy of the repository.

`goreleaser release --snapshot --clean` builds the standalone binaries for Linux, macOS and Windows (amd64 and arm64) locally. It publishes nothing.
