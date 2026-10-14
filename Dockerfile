# Gresbase image: one static binary with the frontend embedded, on distroless.
#   docker build -t gresbase --build-arg VERSION=v0.1.0 .
# Multi-arch with buildx: the web and Go stages run on the build platform and cross-compile.

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY testdata/ /src/testdata/
COPY web/ ./
RUN pnpm build

FROM --platform=$BUILDPLATFORM golang:1.27-bookworm AS build
ARG TARGETOS TARGETARCH VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web /src/internal/ui/dist/ internal/ui/dist/
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/gresbase ./cmd/gresbase \
 && mkdir -p /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gresbase /gresbase
COPY LICENSE NOTICE TRADEMARKS.md web/public/licenses/THIRD_PARTY_NOTICES.txt /licenses/
# /data must be writable by nonroot (uid 65532) for saved queries when no volume is mounted
COPY --from=build --chown=65532:65532 /out/data /data
USER nonroot
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 CMD ["/gresbase", "healthcheck"]
ENTRYPOINT ["/gresbase"]
