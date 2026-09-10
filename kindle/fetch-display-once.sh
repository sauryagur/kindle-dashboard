#!/bin/sh
# Download one dashboard image, display it, then return control to Kindle powerd.
# Configure DASHBOARD_URL in the environment or /mnt/us/openrouter-dashboard.env.

set -u

ENV_FILE=/mnt/us/openrouter-dashboard.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

DASHBOARD_URL="${DASHBOARD_URL:-}"
FBINK="${FBINK:-/usr/bin/fbink}"
IMAGE=/mnt/us/openrouter-dashboard.png
TEMP="$IMAGE.tmp"

if [ -z "$DASHBOARD_URL" ]; then
  echo "DASHBOARD_URL is required" >&2
  exit 2
fi
if [ ! -x "$FBINK" ]; then
  echo "FBInk not found: $FBINK" >&2
  exit 2
fi

if ! curl -fsS --connect-timeout 10 --max-time 45 "$DASHBOARD_URL" -o "$TEMP"; then
  rm -f "$TEMP"
  exit 1
fi
[ -s "$TEMP" ] || { rm -f "$TEMP"; exit 1; }

mv "$TEMP" "$IMAGE"
lipc-set-prop com.lab126.powerd preventScreenSaver 1 2>/dev/null || true
"$FBINK" -g "file=$IMAGE" -W GC16 >/dev/null 2>&1
lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
