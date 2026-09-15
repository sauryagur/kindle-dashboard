#!/bin/sh
# Install Kindle Dashboard runtime and SpiderCat scriptlets over USB.
# Usage: R2_PUBLIC_HOST=your-host.com IMAGE_PATH=openrouter-dashboard.png sh scripts/install-spidercat.sh
# Optional: KINDLE_DIR=/path/to/Kindle

set -eu

usage() {
  cat >&2 <<'EOF'
Usage:
  R2_PUBLIC_HOST=example.com IMAGE_PATH=dashboard.png sh scripts/install-spidercat.sh

Required Environment Variables:
  R2_PUBLIC_HOST   The public domain/host of your cloud storage.
  IMAGE_PATH       The path/filename of the dashboard image.

Optional Environment Variables:
  KINDLE_DIR       Override automatic Kindle mount detection (e.g., /media/user/Kindle).
EOF
  exit 2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# 1. Fail Fast: Check for Help Flags
case "${1:-}" in
  -h|--help) usage ;;
esac

# 2. Fail Fast: Validate and normalize cloud object address.
[ -n "${R2_PUBLIC_HOST:-}" ] || fail 'R2_PUBLIC_HOST environment variable is required.'
[ -n "${IMAGE_PATH:-}" ] || fail 'IMAGE_PATH environment variable is required.'

IMAGE_PATH=${IMAGE_PATH#/}
[ -n "$IMAGE_PATH" ] || fail 'IMAGE_PATH must contain an object path after its optional leading slash.'

case "$R2_PUBLIC_HOST" in
  *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.:-]*)
    fail 'R2_PUBLIC_HOST must contain only a hostname and optional port, without scheme or path.'
    ;;
esac
case "$IMAGE_PATH" in
  *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~/%:@!+,-]*)
    fail 'IMAGE_PATH contains unsupported characters; percent-encode spaces or reserved characters.'
    ;;
esac

IMAGE_URL="https://${R2_PUBLIC_HOST}/${IMAGE_PATH}"

# 4. Fail Fast: Source File Validations
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
LOOP_SOURCE="$ROOT_DIR/kindle/dash-loop.sh"
AUTOSTART_SOURCE="$ROOT_DIR/kindle/dash-autostart.sh"

[ -r "$LOOP_SOURCE" ] || fail "Missing source file: $LOOP_SOURCE"
[ -r "$AUTOSTART_SOURCE" ] || fail "Missing source file: $AUTOSTART_SOURCE"

# 4. Locate writable Kindle USB storage.
if [ -n "${KINDLE_DIR:-}" ]; then
  [ -d "$KINDLE_DIR" ] || fail "KINDLE_DIR does not exist: $KINDLE_DIR"
  KINDLE_ROOT=$KINDLE_DIR
else
  command -v findmnt >/dev/null 2>&1 || fail 'findmnt is required for automatic Kindle mount detection; set KINDLE_DIR explicitly.'
  USER_NAME=${USER:-}
  [ -n "$USER_NAME" ] || USER_NAME=$(id -un)
  KINDLE_ROOT=
  for candidate in "/media/$USER_NAME/Kindle" "/run/media/$USER_NAME/Kindle"; do
    if [ -d "$candidate" ] && [ "$(findmnt -rn -T "$candidate" -o TARGET 2>/dev/null || true)" = "$candidate" ]; then
      KINDLE_ROOT=$candidate
      break
    fi
  done
fi

[ -n "${KINDLE_ROOT:-}" ] || fail 'Kindle mount not found. Connect Kindle over USB or set KINDLE_DIR=/path/to/Kindle.'
[ -d "$KINDLE_ROOT" ] || fail "Target Kindle directory does not exist: $KINDLE_ROOT"
[ -w "$KINDLE_ROOT" ] || fail "Target Kindle directory is not writable: $KINDLE_ROOT"

DOCUMENTS="$KINDLE_ROOT/documents"
mkdir -p "$DOCUMENTS" || fail "Cannot create Kindle documents directory: $DOCUMENTS"
[ -w "$DOCUMENTS" ] || fail "Kindle documents directory is not writable: $DOCUMENTS"

# 6. Atomic Write Implementation with Error Traps
TEMP_FILE=""
cleanup() {
  if [ -n "${TEMP_FILE:-}" ] && [ -f "$TEMP_FILE" ]; then
    rm -f "$TEMP_FILE"
  fi
}
trap cleanup EXIT HUP INT TERM

copy_atomic() {
  source=$1
  destination=$2
  TEMP_FILE="$destination.tmp.$$"
  cp "$source" "$TEMP_FILE" || fail "Failed copying $source to temp file"
  mv -f "$TEMP_FILE" "$destination" || fail "Atomic move failed for $destination"
  TEMP_FILE=""
}

write_atomic() {
  destination=$1
  TEMP_FILE="$destination.tmp.$$"
  cat > "$TEMP_FILE" || fail "Failed writing stream data to temp file"
  mv -f "$TEMP_FILE" "$destination" || fail "Atomic write failed for $destination"
  TEMP_FILE=""
}

# 7. Deployment Execution
copy_atomic "$LOOP_SOURCE" "$KINDLE_ROOT/dash-loop.sh"
copy_atomic "$AUTOSTART_SOURCE" "$KINDLE_ROOT/dash-autostart.sh"

write_atomic "$KINDLE_ROOT/dash-autostart.env" <<EOF
IMAGE_URL='$IMAGE_URL'
INTERVAL='7200'
FULL_EVERY='1'
WIFI_RETRY_EVERY='3'
EOF

write_atomic "$DOCUMENTS/kindle-dashboard-start.sh" <<'EOF'
#!/bin/sh
# Name: Kindle Dashboard Start
# Author: Kindle Dashboard
# DontUseFBInk

LOG=/mnt/us/kindle-dashboard-scriptlets.log
AUTOSTART=/mnt/us/dash-autostart.sh

exec >> "$LOG" 2>&1

log() {
  printf '%s [kindle-dashboard:start] %s\n' "$(date "+%Y-%m-%dT%H:%M:%S%z")" "$*"
}

log "scriptlet opened; pid=$$"
if [ ! -r "$AUTOSTART" ]; then
  log "ERROR: missing or unreadable launcher: $AUTOSTART"
  exit 1
fi

log "clearing disabled and stop markers"
if ! rm -f /mnt/us/dash-autostart.disabled /mnt/us/dash-loop.stop; then
  log "ERROR: unable to clear dashboard markers"
  exit 1
fi

log "running $AUTOSTART"
/bin/sh "$AUTOSTART"
status=$?
if [ "$status" -eq 0 ]; then
  log "launcher exited successfully"
  exit 0
fi
log "ERROR: launcher exited with status $status"
exit "$status"
EOF

write_atomic "$DOCUMENTS/kindle-dashboard-stop.sh" <<'EOF'
#!/bin/sh
# Name: Kindle Dashboard Stop
# Author: Kindle Dashboard
# DontUseFBInk

LOG=/mnt/us/kindle-dashboard-scriptlets.log
DISABLED=/mnt/us/dash-autostart.disabled
STOP=/mnt/us/dash-loop.stop
PIDFILE=/mnt/us/dash-loop.pid

exec >> "$LOG" 2>&1

log() {
  printf '%s [kindle-dashboard:stop] %s\n' "$(date "+%Y-%m-%dT%H:%M:%S%z")" "$*"
}

status=0
log "scriptlet opened; pid=$$"
if touch "$DISABLED"; then
  log "created persistent disabled marker: $DISABLED"
else
  log "ERROR: unable to create disabled marker: $DISABLED"
  status=1
fi
if touch "$STOP"; then
  log "created stop marker: $STOP"
else
  log "ERROR: unable to create stop marker: $STOP"
  status=1
fi

PID=$(cat "$PIDFILE" 2>/dev/null || true)
case "$PID" in
  '') log "no loop PID file found" ;;
  *[!0-9]*) log "ignoring invalid loop PID: $PID"; status=1 ;;
  *)
    if kill -0 "$PID" 2>/dev/null; then
      log "terminating loop pid=$PID"
      if kill "$PID" 2>/dev/null; then
        log "termination signal sent to pid=$PID"
      else
        log "ERROR: unable to terminate pid=$PID"
        status=1
      fi
    else
      log "stale loop PID file: pid=$PID is not running"
    fi
    ;;
esac

log "stop scriptlet completed with status $status"
exit "$status"
EOF

# Flush all generated files before USB disconnect.
if sync -f "$KINDLE_ROOT" 2>/dev/null; then
  :
elif sync; then
  :
else
  fail "Unable to sync Kindle storage: $KINDLE_ROOT"
fi

printf 'Installed Kindle Dashboard to %s\n' "$KINDLE_ROOT"
printf 'Scriptlet activity log: /mnt/us/kindle-dashboard-scriptlets.log\n'
printf 'Eject Kindle, connect Wi-Fi, then open "Kindle Dashboard Start" from library.\n'
