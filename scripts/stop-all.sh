#!/usr/bin/env bash
cd "$(dirname "$0")/.."
for name in web worker; do
  f="data/pids/$name.pid"
  if [ -f "$f" ]; then
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" && echo "stopped $name ($pid)"; fi
    rm -f "$f"
  fi
done
