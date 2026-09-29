#!/usr/bin/env bash
#
# Nightly off-server backup of the magnet catalogue.
#
# The catalogue exists to outlive zamunda.life, so a copy that lives only on the Hetzner disk
# defeats its purpose. This pulls the key-protected export over HTTPS — no SSH trust between
# the machines is needed — and keeps dated, gzipped copies.
#
# A download is only kept if it is COMPLETE and PLAUSIBLE: every line must be a record with a
# 40-hex infohash and a magnet, and the count must not drop below 90% of the last good backup.
# A truncated or empty export can therefore never replace a good copy. A failure is pushed to
# ntfy so a silently broken backup does not go unnoticed for months.
#
# Runs on the Oracle egress box (root cron) and on the Mac (launchd). Config:
#   KEY_FILE    file containing DASHBOARD_KEY=...   (required, chmod 600)
#   BACKUP_DIR  where the copies go                  (required)
#   KEEP_DAYS   dated copies to keep                 (default 30)
#   SOURCE_URL  export endpoint                      (default: the live addon)
#   NTFY_URL    failure alerts                       (default: the source-monitor topic; "" = off)
#
set -uo pipefail

: "${KEY_FILE:?KEY_FILE not set}"
: "${BACKUP_DIR:?BACKUP_DIR not set}"
KEEP_DAYS="${KEEP_DAYS:-30}"
SOURCE_URL="${SOURCE_URL:-https://zamunda-stremio.tzkppv.com/catalogue.jsonl}"
NTFY_URL="${NTFY_URL-https://ntfy.sh/zamunda-src-fd726b876154}"
HOST="$(hostname -s 2>/dev/null || hostname)"

fail() {
    echo "$(date -u +%FT%TZ) FAIL: $1" >&2
    [ -n "$NTFY_URL" ] && curl -s -m 15 -H "Title: Zamunda catalogue backup FAILED ($HOST)" \
        -d "$1" "$NTFY_URL" >/dev/null 2>&1
    rm -f "$TMP"
    exit 1
}

KEY="$(grep -E '^DASHBOARD_KEY=' "$KEY_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
[ -n "$KEY" ] || { TMP=""; fail "no DASHBOARD_KEY in $KEY_FILE"; }

mkdir -p "$BACKUP_DIR" || { TMP=""; fail "cannot create $BACKUP_DIR"; }
TMP="$BACKUP_DIR/.incoming.jsonl"
STATE="$BACKUP_DIR/.last-count"

curl -sS --fail -m 300 -G --data-urlencode "key=$KEY" "$SOURCE_URL" -o "$TMP" \
    || fail "download failed from $SOURCE_URL"

# Validate every line; print the record count.
COUNT="$(python3 - "$TMP" <<'PY'
import json, re, sys
hexh = re.compile(r'^[0-9a-f]{40}$')
n = 0
for i, line in enumerate(open(sys.argv[1], encoding='utf-8'), 1):
    if not line.strip():
        continue
    r = json.loads(line)                       # raises -> non-zero exit -> rejected
    if not hexh.match(r.get('h', '')) or not str(r.get('m', '')).startswith('magnet:'):
        sys.exit(f'bad record on line {i}')
    n += 1
print(n)
PY
)" || fail "export did not validate (corrupt or not a catalogue)"

LAST="$(cat "$STATE" 2>/dev/null || echo 0)"
[ "$COUNT" -gt 0 ] || fail "export is empty"
if [ "$LAST" -gt 0 ] && [ "$COUNT" -lt $(( LAST * 9 / 10 )) ]; then
    fail "export has $COUNT magnets, last good backup had $LAST — refusing to keep it"
fi

OUT="$BACKUP_DIR/magnet-catalogue-$(date -u +%F).jsonl.gz"
gzip -c "$TMP" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT" || fail "could not write $OUT"
ln -sfn "$(basename "$OUT")" "$BACKUP_DIR/latest.jsonl.gz"
echo "$COUNT" > "$STATE"
rm -f "$TMP"

# Prune dated copies beyond KEEP_DAYS (by name, oldest first).
ls -1 "$BACKUP_DIR"/magnet-catalogue-*.jsonl.gz 2>/dev/null | sort -r | tail -n +"$((KEEP_DAYS + 1))" \
    | while read -r old; do rm -f "$old"; done

echo "$(date -u +%FT%TZ) OK: $COUNT magnets (was $LAST) -> $OUT"
