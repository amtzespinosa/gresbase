#!/usr/bin/env bash
# Local CI (GitHub Actions only runs on demand). Run inside the dev container:
#   scripts/ci.sh quick   gate for every merge to main
#   scripts/ci.sh full    gate for closing a block or round
# Every step runs even if an earlier one failed (except steps that need an earlier one), logs go to
# tmp/ci/, and the run ends with a summary table. Exit code is non-zero if any step failed.
set -uo pipefail
cd "$(dirname "$0")/.."

mode=${1:-}
case $mode in quick | full) ;; *) echo "usage: $0 quick|full" >&2; exit 2 ;; esac

# Keep in sync with test:go:all in Taskfile.yml. 19beta4 becomes 19 at release.
GO_MATRIX="12 13 14 15 16 17 19beta4" # 18 already runs in the quick part
GO_JOBS=${CI_GO_JOBS:-3}               # versions tested at once (see docs/decisions.md)
E2E_SMOKE="e2e/01 e2e/02 e2e/06"

logs=tmp/ci
rm -rf "$logs" && mkdir -p "$logs"
names=() results=() times=()
started=$SECONDS

fmt() { printf '%dm%02ds' $(($1 / 60)) $(($1 % 60)); }

record() { # record <name> <PASS|FAIL|SKIP> <seconds>
  names+=("$1") results+=("$2") times+=("$3")
  echo "    $2 in $(fmt "$3")"
}

step() { # step <name> <command...>
  local name=$1 t=$SECONDS log
  shift
  log="$logs/$(echo "$name" | tr -c 'a-zA-Z0-9.\n' '-').log"
  echo "==> $name (log: $log)"
  if "$@" >"$log" 2>&1; then
    record "$name" PASS $((SECONDS - t))
  else
    tail -n 40 "$log" | sed 's/^/    | /'
    record "$name" FAIL $((SECONDS - t))
  fi
}

passed() { [[ ${results[-1]} == PASS ]]; }

lint_web() { (cd web && pnpm lint && pnpm typecheck && pnpm format:check); }
types_check() {
  rm -rf tmp/tygo && tygo generate || return 1
  cat tmp/tygo/*.ts | cmp -s - web/src/lib/api/types.gen.ts || { echo "types.gen.ts is stale, run task gen"; return 1; }
  bash scripts/demo-compose.sh | cmp -s - deploy/docker-compose.demo.yml || { echo "docker-compose.demo.yml is stale, run task gen"; return 1; }
}
e2e() { PG_VERSION=$1 task e2e -- "${@:2}"; }

# One Postgres version of the Go matrix; writes "<PASS|FAIL> <seconds>" for the summary.
go_one() {
  local v=$1 t=$SECONDS status=PASS
  PG_VERSION=$v go test -count=1 ./... >"$logs/go-pg$v.log" 2>&1 || status=FAIL
  echo "$status $((SECONDS - t))" >"$logs/go-pg$v.status"
}

go_matrix() {
  echo "==> Go matrix: $GO_MATRIX ($GO_JOBS at a time, logs: $logs/go-pg*.log)"
  export -f go_one
  export logs
  printf '%s\n' $GO_MATRIX | xargs -P "$GO_JOBS" -I{} bash -c 'go_one {}'
  local v r
  for v in $GO_MATRIX; do
    read -r r t <"$logs/go-pg$v.status" 2>/dev/null || { r=FAIL t=0; }
    [[ $r == FAIL ]] && tail -n 40 "$logs/go-pg$v.log" | sed 's/^/    | /'
    echo "--- go test PG $v"
    record "go test PG $v" "$r" "$t"
  done
}

# The e2e runs leave the dev database on whatever version ran last: wipe it at the end so the next
# `task dev:db` starts clean on the default version.
trap 'docker compose -f deploy/docker-compose.dev.yml down -v >/dev/null 2>&1' EXIT

(cd web && pnpm install --frozen-lockfile >/dev/null 2>&1)

step "lint go (golangci-lint)" golangci-lint run ./...
step "lint web (eslint, tsc, prettier)" lint_web
step "lint workflows (actionlint)" actionlint
step "generated files up to date" types_check
step "licenses up to date and allowed" node scripts/licenses.mjs --check
step "go test PG 18" env PG_VERSION=18 go test -count=1 ./...
step "web tests (vitest)" task test:web
step "e2e PG 18 (full)" e2e 18

if [[ $mode == full ]]; then
  go_matrix
  step "e2e PG 12 (full)" e2e 12
  step "e2e PG 17 (full)" e2e 17
  # shellcheck disable=SC2086
  step "e2e PG 19beta4 (smoke)" e2e 19beta4 $E2E_SMOKE
  step "build binary" bash -c 'task build && ./bin/gresbase version'
  docker compose -f deploy/docker-compose.dev.yml down -v >/dev/null 2>&1 # smoke uses the default version
  step "docker image build" docker build -t gresbase:smoke --build-arg VERSION=smoke .
  if passed; then
    step "docker smoke (scripts/smoke-docker.sh)" scripts/smoke-docker.sh
  else
    echo "==> docker smoke skipped (image build failed)"
    record "docker smoke (scripts/smoke-docker.sh)" SKIP 0
  fi
fi

echo
echo "Local CI ($mode) on $(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo ' + uncommitted changes')"
printf '%-42s %-6s %s\n' STEP RESULT TIME
failed=0
for i in "${!names[@]}"; do
  printf '%-42s %-6s %s\n' "${names[$i]}" "${results[$i]}" "$(fmt "${times[$i]}")"
  [[ ${results[$i]} == FAIL ]] && failed=$((failed + 1))
done
echo "Total: $(fmt $((SECONDS - started))) — $([[ $failed == 0 ]] && echo 'ALL PASSED' || echo "$failed FAILED")"
[[ $failed == 0 ]]
