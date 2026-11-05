#!/usr/bin/env bash
# Start the production web app + standalone worker (jobs, scheduler, health monitor) in the background.
#   PORT=3100 npm run start:all      → logs in data/logs/, pids in data/pids/
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"
mkdir -p data/logs data/pids
[ -d .next ] || { echo "No build found — running npm run build"; npm run build; }
bash scripts/stop-all.sh >/dev/null 2>&1 || true
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:$PORT}" FORMFORGE_INTERNAL_URL="${FORMFORGE_INTERNAL_URL:-http://127.0.0.1:$PORT}" PORT
FORMFORGE_INLINE_WORKER=0 nohup node_modules/.bin/next start -p "$PORT" > data/logs/web.log 2>&1 &
echo $! > data/pids/web.pid
nohup node --import tsx scripts/worker.ts > data/logs/worker.log 2>&1 &
echo $! > data/pids/worker.pid
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "FormForge is up → $PUBLIC_URL  (web pid $(cat data/pids/web.pid), worker pid $(cat data/pids/worker.pid))"
    echo "Logs: data/logs/web.log, data/logs/worker.log · Stop: npm run stop:all"
    exit 0
  fi
  sleep 1
done
echo "Web app did not become healthy in 60s — see data/logs/web.log" >&2
exit 1
