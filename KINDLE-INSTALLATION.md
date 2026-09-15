# Kindle Installation

Kindle Dashboard retrieves one stable cloud image URL through Kindle-side loop.
Two deployment modes exist:

- **SpiderCat USB/scriptlet:** no SSH or rootfs modification; start manually
  from Kindle home screen after every reboot.
- **Electron SSH/Upstart:** install managed boot job only on device verified to
  retain Hotfix/Upstart compatibility.

Project does not jailbreak Kindle, install FBInk, configure R2 access, or alter
jailbreak components.

## Common Prerequisites

On Kindle:

- jailbreak completed;
- FBInk installed;
- `/mnt/us` available;
- Internet/Wi-Fi access to image host.

For image source:

- stable HTTPS public R2 bucket URL or custom domain;
- one fixed object key, for example:

  ```text
  https://<R2_PUBLIC_HOST>/openrouter-dashboard.png
  ```

Presigned URLs are unsupported: expiry breaks future scheduled fetches. Never
include R2 credentials in URL.

## SpiderCat USB Installation and Manual Start

SpiderCat installs KPM and SH_Integration as modern hdnext jailbreak stack. They
have distinct jobs:

- **KPM** indexes, installs, and launches KPM packages. Documented hooks are
  `install.sh`, `launch.sh`, and `uninstall.sh`, all executed by `sh`.
- **SH_Integration** makes every `.sh` in `/mnt/us/documents` appear in
  Kindle library as scriptlet. Opening scriptlet runs it.

Repository ships loose scripts, not `.kpkg` artifact or KPM repository. Do not
run `;kpm launch kindle-dashboard`: KPM has no such installed package. Use
SpiderCat scriptlet to run `/mnt/us/dash-autostart.sh`.

### Copy Files Over USB

Mount Kindle USB storage, set its mount path, then copy scripts and write cloud
configuration. Replace placeholder URL with fixed public R2 URL. Do not use
presigned URL or put R2 credentials on Kindle.

```sh
KINDLE=/media/$USER/Kindle  # replace if mounted elsewhere

cp kindle/dash-loop.sh "$KINDLE/dash-loop.sh"
cp kindle/dash-autostart.sh "$KINDLE/dash-autostart.sh"
cat > "$KINDLE/dash-autostart.env" <<'EOF'
IMAGE_URL='https://<R2_PUBLIC_HOST>/openrouter-dashboard.png'
INTERVAL='7200'
FULL_EVERY='1'
WIFI_RETRY_EVERY='3'
EOF
```

USB storage is FAT, so it does not preserve Unix executable bits. Safe here:
launcher calls scripts through `/bin/sh`.

### Add Home-Screen Scriptlets

Create start scriptlet in Kindle `documents` folder. SH_Integration indexes
it as **Kindle Dashboard Start** after safely ejecting and disconnecting USB.

```sh
mkdir -p "$KINDLE/documents"
cat > "$KINDLE/documents/kindle-dashboard-start.sh" <<'EOF'
#!/bin/sh
# Name: Kindle Dashboard Start
# Author: Kindle Dashboard
# DontUseFBInk

rm -f /mnt/us/dash-autostart.disabled /mnt/us/dash-loop.stop
exec /bin/sh /mnt/us/dash-autostart.sh
EOF
```

Optional stop scriptlet stops active loop promptly and prevents restart until
Start is opened again:

```sh
cat > "$KINDLE/documents/kindle-dashboard-stop.sh" <<'EOF'
#!/bin/sh
# Name: Kindle Dashboard Stop
# Author: Kindle Dashboard
# DontUseFBInk

touch /mnt/us/dash-autostart.disabled /mnt/us/dash-loop.stop
PID=$(cat /mnt/us/dash-loop.pid 2>/dev/null)
[ -n "$PID" ] && kill "$PID" 2>/dev/null || true
EOF
sync -f "$KINDLE"
```

Safely eject Kindle, unplug USB, connect Wi-Fi, and open **Kindle Dashboard
Start** in library. `dash-autostart.sh` waits up to 90 seconds for Wi-Fi, then
starts loop; first image request occurs immediately. Confirm image and logs at
`/mnt/us/dash-autostart.log` and `/mnt/us/dash-loop.log` through USB or
terminal.

### SpiderCat Limits

KPM documented package lifecycle and scriptlets do **not** provide boot hook.
Start scriptlet must be opened after every reboot. Do not add undocumented
`startup.sh` expecting automatic boot, or remount rootfs from KPM package:
official KPM package guidance forbids rootfs writes.

KPM becomes useful if project later publishes package and repository: package
`install.sh` could copy start scriptlet into `documents`, and scriptlet would
invoke `/var/local/kmc/bin/kpm launch <package-id>`. That package does not
exist today.

References: [SpiderCat](https://kindlemodding.org/jailbreaking/SpiderCat/),
[KPM](https://kindlemodding.org/kindle-dev/kpm/),
[KPM package hooks](https://kindlemodding.org/kindle-dev/kpm/creating-a-package.html),
and [Scriptlets](https://kindlemodding.org/kindle-dev/scriptlets.html).

## Electron SSH/Upstart Installation

This path provides boot-time automation. It requires SSH and compatibility with
old Hotfix/Upstart interfaces; SpiderCat alone does not prove either exists.

On controller computer:

- Kindle Dashboard running or installed;
- SSH network reachability to Kindle during setup;
- `initctl` and `mntroot` available on Kindle;
- Hotfix/Upstart at `/etc/upstart/kmc.conf` on Kindle;
- no persistent PC server, shared LAN, or port 8787 requirement after install.

## Electron UI Configuration

Open **Kindle** and set:

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| Kindle IP      | `<KINDLE_IP>`                                          |
| SSH Port       | usually `22`                                           |
| SSH User       | `<SSH_USER>`                                           |
| SSH Password   | `<SSH_PASSWORD>`                                       |
| R2 image URL   | `https://<R2_PUBLIC_HOST>/openrouter-dashboard.png`    |
| Fetch interval | seconds between fetches; default `7200` (2 hours)               |
| Full refresh   | successful fetches between full refreshes; default `1` |
| Wi-Fi retry    | consecutive failures before recovery; default `3`      |

Save configuration, then **Check Kindle**. Confirm SSH, jailbreak, FBInk, and
Hotfix checks. Use **Install scripts**. The SSH password is stored locally in
Electron `userData` using `safeStorage` when available; renderer receives only
saved-password state.

## Electron-Installed Files

| Kindle path                          | Purpose                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `/mnt/us/dash-loop.sh`               | Downloads `IMAGE_URL`, atomically updates `dash.png`, displays it with FBInk. |
| `/mnt/us/dash-autostart.sh`          | Loads configuration, waits for Wi-Fi, starts loop.                            |
| `/mnt/us/dash-autostart.env`         | Managed cloud image URL and timing.                                           |
| `/mnt/us/kindle-dashboard.conf`      | Removable Upstart job source.                                                 |
| `/etc/upstart/kindle-dashboard.conf` | Upstart job invoked after framework readiness.                                |

Installer only replaces `/etc/upstart/kindle-dashboard.conf` if existing file
belongs to Kindle Dashboard. Unknown job at same path fails installation instead
of being overwritten. It remounts root `rw`, copies job, then returns root to
`ro` even when copy fails.

## Environment

`/mnt/us/dash-autostart.env` is written by Electron or USB procedure:

```sh
IMAGE_URL='https://<R2_PUBLIC_HOST>/openrouter-dashboard.png'
INTERVAL='7200'
FULL_EVERY='1'
WIFI_RETRY_EVERY='3'
```

- `IMAGE_URL`: required stable HTTPS cloud image object.
- `INTERVAL`: seconds between fetches. Default `7200` (2 hours); choose based
  on desired freshness and Kindle power use.
- `FULL_EVERY`: full anti-ghosting refresh cadence. Default `1` refreshes each
  successful cloud update.
- `WIFI_RETRY_EVERY`: failures before Wi-Fi recovery. Default `3`.
- `MAX_FAILURES`: managed loop default `6`; after sixth consecutive failed fetch,
  it exits and releases `preventScreenSaver`.

## Electron-Installed Boot and Fetch Behavior

After Electron installs `/etc/upstart/kindle-dashboard.conf`, Upstart runs
`/mnt/us/dash-autostart.sh` after framework readiness. Launcher:

- refuses to start when `dash-autostart.disabled` exists;
- validates `IMAGE_URL`;
- waits up to 60 seconds for loop script and 90 seconds for Wi-Fi;
- starts detached loop and logs to `/mnt/us/dash-autostart.log`.

`dash-loop.sh`:

- uses PID guard to replace a prior loop;
- fetches image to `/mnt/us/dash.png.tmp`;
- moves temporary file to `/mnt/us/dash.png` only after successful non-empty
  download;
- draws through `fbink -g file=/mnt/us/dash.png -W GC16`;
- does full `fbink -f -c` refresh at configured cadence;
- attempts Wi-Fi recovery after every third consecutive failure;
- exits after six failures and trap releases `preventScreenSaver`;
- removes PID and partial image on exit.

Existing displayed `dash.png` survives a failed fetch because temporary file is
never moved into place.

## Manual Disable and Re-enable

On Kindle, disable persistently with:

```sh
touch /mnt/us/dash-autostart.disabled
```

The active loop checks this marker within 60 seconds, exits, and does not restart after reboot.
Re-enable and start a fetch immediately with:

```sh
rm /mnt/us/dash-autostart.disabled && /mnt/us/dash-autostart.sh
```

## Electron Status, Start, Stop

Diagnostics reports:

| Field     | Meaning                                           |
| --------- | ------------------------------------------------- |
| Autostart | Kindle Dashboard Upstart job installed or missing |
| Enabled   | disabled marker absent or present                 |
| Upstart   | `initctl` job state                               |
| Loop      | managed fetch process state                       |
| R2 image  | `IMAGE_URL` curl reachability                     |

R2 image status runs:

```sh
curl -fsS --connect-timeout 3 --max-time 5 "$IMAGE_URL" -o /dev/null
```

`Image : unavailable (missing IMAGE_URL)` means configuration was not installed.
For other image failures, verify Kindle Wi-Fi and public HTTPS object reachability.

**Stop** creates disabled and stop markers, terminates loop, but retains files.
**Start** removes disabled marker and runs launcher again.

## Electron Uninstall

Use **Uninstall** in diagnostics. It:

1. stops managed loop;
2. removes `/etc/upstart/kindle-dashboard.conf` only if it is project job;
3. reloads Upstart;
4. removes launcher, loop, generated environment, job source, logs, stop/PID
   markers, disabled marker, and `/mnt/us/dash.png`.

No manual runtime cleanup is required. Do not remove jailbreak, FBInk, KUAL,
USBNetwork, or Hotfix files through this project.

## Privacy

Do not document or commit real Kindle serial numbers, IP addresses, usernames,
SSH passwords, R2 credentials, OpenRouter keys, or private logs. Use
`<KINDLE_IP>`, `<SSH_USER>`, `<SSH_PASSWORD>`, and `<R2_PUBLIC_HOST>`.


Wall time: 0.04 seconds