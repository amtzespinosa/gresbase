#!/usr/bin/env bash
# Runs the backend and restarts it when a Go file changes. Polls file mtimes because inotify does not
# fire reliably on the Windows/macOS bind mount used by the dev container.
set -uo pipefail

stamp() { find . -path ./web -prune -o -path ./data -prune -o \( -name '*.go' -o -name go.mod -o -name go.sum \) -printf '%p %T@\n' | sort | md5sum; }

pid=""
stop() { [ -n "$pid" ] && kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null; pid=""; }
trap 'stop; exit 0' INT TERM

while true; do
  last=$(stamp)
  if go build -o /tmp/gresbase-api ./cmd/gresbase; then
    /tmp/gresbase-api & pid=$!
  else
    echo "dev-api: build failed, waiting for changes" >&2
  fi
  while [ "$(stamp)" = "$last" ]; do sleep 1; done
  echo "dev-api: change detected, restarting" >&2
  stop
done
