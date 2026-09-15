#!/bin/sh
# Install Kindle Dashboard runtime and SpiderCat scriptlets over USB.
# Usage: IMAGE_URL=https://<host>/openrouter-dashboard.png sh scripts/install-spidercat.sh
# Optional: KINDLE_DIR=/path/to/Kindle

set -eu

usage() {
  cat >&2 <<'EOF'
Usage:
  IMAGE_URL=https://<R2_PUBLIC_HOST>/openrouter-dashboard.png sh scripts/install-spidercat.sh

Optional:
  KINDLE_DIR=/media/$USER/Kindle  Override automatic Kindle mount detection.
EOF
  exit 2
}

fail() {
  printf '%s\n' "install-spidercat: $*" >&2
  exit 1
}

case "${1:-}" in
  -h|--help) usage ;;
  '') ;;
  *) IMAGE_URL=$1 ;;
esac

IMAGE_URL=${IMAGE_URL:-}
case "$IMAGE_URL" in
  https://?*) ;;
  *) fail 'IMAGE_URL must be a stable public HTTPS image URL' ;;
esac

TAB=$(printf '\t')
NEWLINE='
'
CARRIAGE_RETURN=$(printf '\r')
case "$IMAGE_URL" in
  *"'"*|*' '*|*"$TAB"*|*"$NEWLINE"*|*"$CARRIAGE_RETURN"*)
    fail 'IMAGE_URL contains characters unsafe for shell configuration'
    ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
LOOP_SOURCE=$ROOT_DIR/kindle/dash-loop.sh
AUTOSTART_SOURCE=$ROOT_DIR/kindle/dash-autostart.sh

[ -r "$LOOP_SOURCE" ] || fail "missing $LOOP_SOURCE"
[ -r "$AUTOSTART_SOURCE" ] || fail "missing $AUTOSTART_SOURCE"

if [ -n "${KINDLE_DIR:-}" ]; then
  KINDLE_ROOT=$KINDLE_DIR
else
  USER_NAME=${USER:-}
  if [ -z "$USER_NAME" ]; then
    USER_NAME=$(id -un)
  fi

  for candidate in "/media/$USER_NAME/Kindle" "/run/media/$USER_NAME/Kindle"; do
    if [ -d "$candidate" ] && [ "$(findmnt -rn -T "$candidate" -o TARGET 2>/dev/null || true)" = "$candidate" ]; then
      KINDLE_ROOT=$candidate
      break
    fi
  done
fi

[ -n "${KINDLE_ROOT:-}" ] || fail 'Kindle mount not found. Connect it over USB or set KINDLE_DIR=/path/to/Kindle'
[ -d "$KINDLE_ROOT" ] || fail "Kindle directory does not exist: $KINDLE_ROOT"

DOCUMENTS=$KINDLE_ROOT/documents
mkdir -p "$DOCUMENTS"

TEMP_FILE=
cleanup() {
  [ -z "${TEMP_FILE:-}" ] || rm -f "$TEMP_FILE"
}
trap cleanup EXIT HUP INT TERM

copy_atomic() {
  source=$1
  destination=$2
  TEMP_FILE=$destination.tmp.$$
  cp "$source" "$TEMP_FILE"
  mv -f "$TEMP_FILE" "$destination"
  TEMP_FILE=
}

write_atomic() {
  destination=$1
  TEMP_FILE=$destination.tmp.$$
  cat > "$TEMP_FILE"
  mv -f "$TEMP_FILE" "$destination"
  TEMP_FILE=
}

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

rm -f /mnt/us/dash-autostart.disabled /mnt/us/dash-loop.stop
exec /bin/sh /mnt/us/dash-autostart.sh
EOF

write_atomic "$DOCUMENTS/kindle-dashboard-stop.sh" <<'EOF'
#!/bin/sh
# Name: Kindle Dashboard Stop
# Author: Kindle Dashboard
# DontUseFBInk

touch /mnt/us/dash-autostart.disabled /mnt/us/dash-loop.stop
PID=$(cat /mnt/us/dash-loop.pid 2>/dev/null)
[ -n "$PID" ] && kill "$PID" 2>/dev/null || true
EOF

sync -f "$KINDLE_ROOT"
printf '%s\n' "Installed Kindle Dashboard to $KINDLE_ROOT"
printf '%s\n' 'Eject Kindle, connect Wi-Fi, then open "Kindle Dashboard Start" from library.'
