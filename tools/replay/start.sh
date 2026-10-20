#!/usr/bin/env bash
# Start the replay pair: OLD = a git revision of server-full.js on :7101, NEW = the working copy on :7102.
#   ./start.sh [old-rev]     (default HEAD)
# Both get an empty data dir (so every search goes to the stub), the stubbed archive, itorrents and RD (rd-stub.js),
# and a dead tracker port so seeder counts cannot make the two runs differ.
set -euo pipefail
cd "$(dirname "$0")"
REV="${1:-HEAD}"
ROOT="$(git rev-parse --show-toplevel)"
for side in old new; do
    rm -rf "run/$side"; mkdir -p "run/$side/data"
    if [ "$side" = old ]; then git -C "$ROOT" show "$REV:server-full.js" > "run/$side/server.js"
    else cp "$ROOT/server-full.js" "run/$side/server.js"; fi
    cp "$ROOT/config-page-v2.html" "run/$side/config.html"
    sed -i '' -e 's#https://itorrents.org/torrent/#http://127.0.0.1:9912/torrent/#' \
              -e "s#host: 'tracker.opentrackr.org', port: 1337#host: '127.0.0.1', port: 9#" \
              -e "s#'https://api.real-debrid.com/rest/1.0'#'http://127.0.0.1:9913/rest/1.0'#" "run/$side/server.js"
done
pkill -f "tools/replay/run/(old|new)/server.js" 2>/dev/null || true
pgrep -f "tools/replay/stubs.js" >/dev/null || (node stubs.js > run/stubs.log 2>&1 &)
pgrep -f "tools/replay/rd-stub.js" >/dev/null || (node "$PWD/rd-stub.js" > run/rd-stub.log 2>&1 &)
for pair in old:7101 new:7102; do
    side=${pair%%:*}; port=${pair##*:}
    (PORT=$port DATA_DIR="$PWD/run/$side/data" ZAMUNDA_PROVIDERS=http://127.0.0.1:9911/ PROXY_API_KEY=replay \
        PUBLIC_URL=http://127.0.0.1:$port DASHBOARD_KEY=replay node "$PWD/run/$side/server.js" > "run/$side.log" 2>&1 &)
done
for port in 7101 7102; do
    for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$port/health" >/dev/null && break; sleep 0.5; done
    curl -s "http://127.0.0.1:$port/health"; echo
done
