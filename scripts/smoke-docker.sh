#!/usr/bin/env bash
# Builds the image, runs it against the development database and checks /healthz, /api/v1/config and
# the Docker HEALTHCHECK. Works with a remote DOCKER_HOST: published ports are reached on that host.
set -euo pipefail
cd "$(dirname "$0")/.."

image=${IMAGE:-gresbase:smoke}
name=gresbase-smoke
devdb="docker compose -f deploy/docker-compose.dev.yml"

host=localhost
if [[ ${DOCKER_HOST:-} =~ ^tcp://([^:/]+) ]]; then host=${BASH_REMATCH[1]}; fi

cleanup() { docker rm -f -v "$name" "$name-setup" "$name-nginx" >/dev/null 2>&1 || true; } # -v: its anonymous /data volume too
trap cleanup EXIT
cleanup

echo "==> building $image"
docker build -t "$image" --build-arg VERSION=smoke .
echo "==> image size: $(docker image inspect "$image" --format '{{.Size}}' | awk '{printf "%.1f MB", $1/1000/1000}')"

echo "==> starting development database"
$devdb up -d --wait
network=$(docker inspect "$($devdb ps -q postgres)" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')

docker run -d --name "$name" --network "$network" -p 8080 \
  -e DATABASE_URL=postgres://gresbase:gresbase@postgres:5432/app?sslmode=disable "$image" >/dev/null
port=$(docker port "$name" 8080/tcp | head -1 | sed 's/.*://')
base="http://$host:$port"

get() { curl -fsS -H 'Host: localhost' "$base$1"; }

echo "==> waiting for $base/healthz"
for _ in $(seq 60); do
  if get /healthz >/dev/null 2>&1; then break; fi
  sleep 1
done

fail() { echo "FAIL: $*" >&2; docker logs "$name" >&2 || true; exit 1; }

health=$(get /healthz) || fail "/healthz"
[[ $health == *'"ok"'* ]] || fail "/healthz returned $health"
cfg=$(get /api/v1/config) || fail "/api/v1/config"
[[ $cfg == *'"version":"smoke"'* ]] || fail "/api/v1/config returned $cfg"
# Started without -v: /data is the anonymous volume of the image's VOLUME. Writable, but lost when the
# container is removed, and Gresbase must say so.
[[ $cfg == *'"data_loss":"anonymous_volume"'* ]] || fail "no anonymous volume warning: $cfg"
[[ $(docker logs "$name" 2>&1) == *'data dir is an anonymous volume'* ]] || fail "no anonymous volume warning in the log"
notices=$(get /licenses/THIRD_PARTY_NOTICES.txt) || fail "/licenses/THIRD_PARTY_NOTICES.txt"
[[ $notices == *'github.com/jackc/pgx'* ]] || fail "third-party notices served without the Go modules"
for f in LICENSE NOTICE TRADEMARKS.md THIRD_PARTY_NOTICES.txt; do
  docker cp "$name:/licenses/$f" - >/dev/null || fail "/licenses/$f missing from the image"
done

echo "==> waiting for Docker HEALTHCHECK"
for _ in $(seq 60); do
  status=$(docker inspect "$name" --format '{{.State.Health.Status}}')
  [[ $status == healthy ]] && break
  sleep 1
done
[[ $status == healthy ]] || fail "container health is $status"

echo "==> a 25 s query behind Nginx with proxy_read_timeout 15s (heartbeats every 10 s)"
docker run -d --name "$name-nginx" --network "$network" -p 80 nginx:stable-alpine sh -c "
  printf 'server { listen 80; location / { proxy_pass http://$name:8080; proxy_set_header Host localhost; proxy_read_timeout 15s; } }' \
    > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'" >/dev/null
nport=$(docker port "$name-nginx" 80/tcp | head -1 | sed 's/.*://')
for _ in $(seq 30); do
  curl -fsS "http://$host:$nport/healthz" >/dev/null 2>&1 && break
  sleep 1
done
slow=$(curl -sS -w ' HTTP %{http_code}' -X POST -H 'X-Gresbase: 1' -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT pg_sleep(25) AS slept","timeout_ms":60000}' "http://$host:$nport/api/v1/sql/execute") ||
  fail "slow query behind Nginx"
[[ $slow == *'"slept"'*' HTTP 200' ]] || fail "slow query behind Nginx: $slow"

echo "==> global search streams through Nginx: the first event long before a table locked for 3 s"
psql() { $devdb exec -T postgres psql -v ON_ERROR_STOP=1 -qAt -U gresbase -d app "$@"; }
psql -c "DROP TABLE IF EXISTS smoke_locked; CREATE TABLE smoke_locked (id int PRIMARY KEY, v text);
  INSERT INTO smoke_locked VALUES (1, 'locktest')"
psql -c "BEGIN; LOCK TABLE smoke_locked; SELECT pg_sleep(3); COMMIT" >/dev/null &
locker=$!
sleep 0.5
found=$(curl -sS -N -w '\nFIRST %{time_starttransfer} TOTAL %{time_total}' -X POST -H 'X-Gresbase: 1' \
  -H 'Content-Type: application/json' -d '{"q":"locktest","schemas":["public"],"timeout_ms":10000}' \
  "http://$host:$nport/api/v1/search") || fail "search behind Nginx"
wait $locker
psql -c "DROP TABLE smoke_locked"
timing=$(tail -1 <<<"$found")
[[ $found == *'"type":"start"'* && $found == *'"snippet":"locktest"'* && $found == *'"type":"done"'* ]] ||
  fail "search behind Nginx: $found"
awk '{ exit !($2 < 1.5 && $4 >= 2.4) }' <<<"$timing" || fail "search did not stream ($timing)"
echo "    $timing"

echo "==> setup mode: token link and setup-token"
docker run -d --name "$name-setup" "$image" >/dev/null
for _ in $(seq 30); do
  [[ $(docker logs "$name-setup" 2>&1) == *'SETUP MODE'* ]] && break
  sleep 1
done
line=$(docker logs "$name-setup" 2>&1 | grep 'SETUP MODE') || fail "no SETUP MODE line"
logged=$(sed -E 's/.*setup_token=([0-9a-f]+).*/\1/' <<<"$line")
[[ $line == *"path=\"/setup#token=$logged\""* ]] || fail "no setup link in: $line"
printed=$(docker exec "$name-setup" /gresbase setup-token) || fail "setup-token"
[[ $printed == "$logged" ]] || fail "setup-token printed $printed, the log has $logged"

echo "OK: /healthz, /api/v1/config, licenses, HEALTHCHECK and setup token"
