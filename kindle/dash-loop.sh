#!/bin/sh
# Kindle cloud image fetch loop.
# Downloads a stable HTTPS image and displays it through FBInk.
# Runs on device; survives SSH disconnects.
#
# Parar:  touch /mnt/us/dash-loop.stop   (ou matar o processo)
# Log:    /mnt/us/dash-loop.log

IMAGE_URL="${IMAGE_URL:-}"
IMG=/mnt/us/dash.png
INTERVAL="${INTERVAL:-21600}"  # seconds between published-image checks
FULL_EVERY="${FULL_EVERY:-1}"  # full refresh after every successful update
WIFI_RETRY_EVERY="${WIFI_RETRY_EVERY:-3}" # recover Wi-Fi after N consecutive failures
MAX_FAILURES="${MAX_FAILURES:-6}" # para o script após N falhas consecutivas (0 = sem limite)
STOP=/mnt/us/dash-loop.stop
PIDFILE=/mnt/us/dash-loop.pid
FBINK=/usr/bin/fbink

case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=21600;; esac
case "$FULL_EVERY" in ''|*[!0-9]*|0) FULL_EVERY=1;; esac
case "$WIFI_RETRY_EVERY" in ''|*[!0-9]*|0) WIFI_RETRY_EVERY=3;; esac
case "$MAX_FAILURES" in ''|*[!0-9]*) MAX_FAILURES=6;; esac
if [ -z "$IMAGE_URL" ]; then
  echo "[dash-loop] IMAGE_URL is required. Set it to a stable HTTPS cloud image URL"
  exit 2
fi

# instância única: mata a anterior, se houver
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then kill "$OLD" 2>/dev/null; sleep 1; fi
fi
echo $$ > "$PIDFILE"

cleanup() {
  lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null
  rm -f "$PIDFILE" "$IMG.tmp"
}
trap cleanup EXIT INT TERM

reconnect_wifi() {
  STATE=$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)
  echo "[dash-loop] $(date) recuperando WiFi (estado=${STATE:-desconhecido})"
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  wpa_cli -i wlan0 reassociate >/dev/null 2>&1
  sleep 8
}

rm -f "$STOP"
i=0
failures=0
echo "[dash-loop] start $(date) pid=$$ image=$IMAGE_URL interval=${INTERVAL}s"

while [ ! -f "$STOP" ]; do
  # mantém a tela acesa (powerd reseta às vezes, então reforça todo ciclo)
  lipc-set-prop com.lab126.powerd preventScreenSaver 1 2>/dev/null

  if curl -fsS --connect-timeout 10 --max-time 30 "$IMAGE_URL" -o "$IMG.tmp" 2>/dev/null && [ -s "$IMG.tmp" ]; then
    mv "$IMG.tmp" "$IMG"
    failures=0
    if [ $((i % FULL_EVERY)) -eq 0 ]; then
      "$FBINK" -f -c >/dev/null 2>&1            # refresh completo com flash (limpa ghosting)
    fi
    "$FBINK" -g file="$IMG" -W GC16 >/dev/null 2>&1
  else
    rm -f "$IMG.tmp"
    failures=$((failures + 1))
    echo "[dash-loop] $(date) falha no curl (${failures} seguida(s))"
    if [ "$MAX_FAILURES" -gt 0 ] && [ "$failures" -ge "$MAX_FAILURES" ]; then
      echo "[dash-loop] $(date) ${failures} falhas consecutivas — encerrando, devolvendo controle ao Kindle"
      lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null
      exit 0
    fi
    if [ $((failures % WIFI_RETRY_EVERY)) -eq 0 ]; then
      reconnect_wifi
    fi
  fi

  i=$((i + 1))
  sleep "$INTERVAL"
done

echo "[dash-loop] parado $(date) (encontrou $STOP)"
