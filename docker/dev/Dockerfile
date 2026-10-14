# Gresbase development environment: everything needed to build and test without installing anything on
# the host. Docker runs in a separate container (docker:dind).
FROM node:22-bookworm AS node
FROM docker:cli AS dockercli

FROM golang:1-bookworm

ARG USER_UID=1000
ARG USER_GID=1000

ENV DEBIAN_FRONTEND=noninteractive \
    GOPATH=/home/dev/go \
    PATH=/home/dev/go/bin:/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    PNPM_HOME=/home/dev/.pnpm \
    npm_config_store_dir=/home/dev/.pnpm/store \
    pnpm_config_store_dir=/home/dev/.pnpm/store \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Utilidades del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
      git openssh-client ca-certificates curl jq less unzip zip postgresql-client sudo procps \
    && rm -rf /var/lib/apt/lists/*

# Node 22 + corepack (pnpm)
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && ln -s /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && corepack enable

# Docker CLI + compose (el daemon es el servicio "docker" del compose de desarrollo)
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins

# Dependencias de sistema de Playwright (los navegadores se instalan desde el proyecto)
RUN npx -y playwright install-deps chromium && rm -rf /var/lib/apt/lists/*

# Unprivileged user
RUN groupadd -o -g ${USER_GID} dev && useradd -o -m -u ${USER_UID} -g ${USER_GID} -s /bin/bash dev \
 && mkdir -p /ms-playwright /workspace/web/node_modules /home/dev/.pnpm/store \
      /home/dev/go/pkg /home/dev/.cache/go-build \
 && chown -R dev:dev /ms-playwright /workspace /home/dev

# `bash -l` (lo que usa `docker compose exec … bash -lc`) reinicia PATH en /etc/profile: lo restauramos
RUN echo 'export PATH="/home/dev/go/bin:/usr/local/go/bin:$PNPM_HOME:$PATH"' > /etc/profile.d/gresbase-path.sh

# github.com conocido para git por SSH
RUN mkdir -p /etc/ssh && ssh-keyscan -t ed25519,rsa github.com >> /etc/ssh/ssh_known_hosts

# El bind mount de Windows aparece como propiedad de root: sin esto, `go build` (VCS stamping) y
# `git describe` fallan con "dubious ownership"
RUN git config --system --add safe.directory /workspace

USER dev
WORKDIR /workspace

# Herramientas de Go
RUN go install github.com/go-task/task/v3/cmd/task@latest \
 && go install github.com/gzuidhof/tygo@latest \
 && go install github.com/rhysd/actionlint/cmd/actionlint@latest \
 && go install github.com/goreleaser/goreleaser/v2@latest \
 && curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh | sh -s -- -b /home/dev/go/bin \
 && go clean -cache

CMD ["sleep", "infinity"]
