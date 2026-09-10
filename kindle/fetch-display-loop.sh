#!/bin/sh
# Low-power periodic dashboard loop.
# This process does not hold preventScreenSaver while waiting between updates.

set -u

ENV_FILE=/mnt/us/openrouter-dashboard.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

DASHBOARD_URL="${DASHBOARD_URL:-}"
FBINK="${FBINK:-/usr/bin/fbink}"
INTERVAL="${INTERVAL:-21600}"
FULL_EVERY="${FULL_EVERY:-1}"
WIFI_RETRY_EVERY="${WIFI_RETRY_EVERY:-3}"
MAX_FAILURES="${MAX_FAILURES:-3}"
IMAGE=/mnt/us/openrouter-dashboard.png
TEMP="$IMAGE.tmp"
STOP=/mnt/us/openrouter-dashboard.stop
PIDFILE=/mnt/us/openrouter-dashboard.pid

case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=21600;; esac
case "$FULL_EVERY" in ''|*[!0-9]*|0) FULL_EVERY=1;; esac
case "$WIFI_RETRY_EVERY" in ''|*[!0-9]*|0) WIFI_RETRY_EVERY=3;; esac
case "$MAX_FAILURES" in ''|*[!0-9]*) MAX_FAILURES=3;; esac

[ -n "$DASHBOARD_URL" ] || { echo 'DASHBOARD_URL is required' >&2; exit 2; }
[ -x "$FBINK" ] || { echo "FBInk not found: $FBINK" >&2; exit 2; }

if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    echo "already running: $OLD" >&2
    exit 0
  fi
fi
echo $$ > "$PIDFILE"

cleanup() {
  lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
  rm -f "$PIDFILE" "$TEMP"
}
trap cleanup EXIT INT TERM

reconnect_wifi() {
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1 || true
  wpa_cli -i wlan0 reassociate >/dev/null 2>&1 || true
  sleep 8
}

rm -f "$STOP"
i=0
failures=0

while [ ! -f "$STOP" ]; do
  if curl -fsS --connect-timeout 10 --max-time 45 "$DASHBOARD_URL" -o "$TEMP" 2>/dev/null && [ -s "$TEMP" ]; then
    mv "$TEMP" "$IMAGE"
    failures=0
    lipc-set-prop com.lab126.powerd preventScreenSaver 1 2>/dev/null || true
    if [ $((i % FULL_EVERY)) -eq 0 ]; then
      "$FBINK" -f -c >/dev/null 2>&1 || true
    fi
    "$FBINK" -g "file=$IMAGE" -W GC16 >/dev/null 2>&1 || true
    lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
  else
    rm -f "$TEMP"
    failures=$((failures + 1))
    if [ "$MAX_FAILURES" -gt 0 ] && [ "$failures" -ge "$MAX_FAILURES" ]; then
      exit 1
    fi
    if [ $((failures % WIFI_RETRY_EVERY)) -eq 0 ]; then
      reconnect_wifi
    fi
  fi

  i=$((i + 1))
  sleep "$INTERVAL"
done
