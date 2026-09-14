# Kindle Dashboard

GitHub Actions publishes an OpenRouter usage PNG to a fixed Cloudflare R2 object.
A jailbroken Kindle fetches that public HTTPS image directly over Wi-Fi. Electron
is only the SSH controller used to configure, diagnose, and manage Kindle-side
automation.

This project does not jailbreak Kindle, install FBInk, create an R2 public URL,
or make private R2 objects readable. It assumes a prepared Kindle and a stable
public or custom-domain R2 object URL.

## How It Works

1. `.github/workflows/publish-openrouter-dashboard.yml` runs every six hours or
   manually.
2. `scripts/generate-openrouter-dashboard.js` queries OpenRouter usage, creates
   `1072x1448` SVG, converts it to PNG, and overwrites
   `openrouter-dashboard.png` in Cloudflare R2.
3. Electron stores Kindle SSH settings and the stable image URL, then installs a
   reversible Upstart job.
4. Kindle waits for Wi-Fi and fetches the image every six hours by default.
5. Kindle downloads to `/mnt/us/dash.png.tmp`, atomically moves it to
   `/mnt/us/dash.png` only after a non-empty download, and displays it with
   FBInk GC16.

Electron need not stay open after installation. Kindle needs Internet/Wi-Fi
access at fetch time; it does not need PC-local server, same LAN, or port 8787.

## Requirements

### Cloud producer

- GitHub repository Actions enabled.
- Repository secrets: `OPENROUTER_API_KEY`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, and `R2_BUCKET`.
- Stable public bucket URL or custom domain for:

  ```text
  https://<R2_PUBLIC_HOST>/openrouter-dashboard.png
  ```

Do not use presigned URLs. They expire, so boot-time and periodic Kindle fetches
would eventually fail. Do not put credentials in the image URL.

### Kindle

- Jailbreak completed.
- SSH enabled and reachable from Electron during setup.
- FBInk installed.
- `/mnt/us`, `initctl`, `mntroot`, and Hotfix/Upstart at
  `/etc/upstart/kmc.conf`.
- Internet/Wi-Fi access to the R2 image URL.

### Electron controller

- Node.js `>=24` for development, or a release installer.
- Network access to Kindle SSH during setup and maintenance.

## First Run

Open **Kindle** and enter:

| Field          | Value                                               |
| -------------- | --------------------------------------------------- |
| Kindle IP      | `<KINDLE_IP>`                                       |
| SSH Port       | usually `22`                                        |
| SSH User       | `<SSH_USER>`                                        |
| SSH Password   | `<SSH_PASSWORD>`                                    |
| R2 image URL   | `https://<R2_PUBLIC_HOST>/openrouter-dashboard.png` |
| Fetch interval | `21600` seconds by default                          |
| Full refresh   | `1` by default                                      |
| Wi-Fi retry    | `3` consecutive failures                            |

Then:

1. Click **Save configuration**.
2. Open **Diagnostics and install**.
3. Click **Check Kindle** and confirm SSH, jailbreak, FBInk, and Hotfix checks.
4. Click **Install scripts**.
5. Confirm loop, autostart, and R2 image availability status.

The managed loop starts after Kindle reboot. Use Start or Stop in diagnostics to
control it without reinstalling. Uninstall removes the Upstart job and all
Kindle Dashboard files it installed.

![Kindle configuration](screenshot/kindle-config.jpg)

![Diagnostics and installation](screenshot/kindle-install.jpg)

## GitHub Actions and R2

The workflow writes the same object key on every run:

```text
openrouter-dashboard.png
```

Keep the Kindle URL fixed at that object. To publish an immediate update, run
**Publish OpenRouter dashboard** from GitHub Actions or overwrite the same R2
object. Kindle displays it after the next fetch interval.

The object is uploaded with `Cache-Control: no-cache`; configure any custom CDN
not to serve stale image content beyond its revalidation policy.

## Development

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Useful support commands:

```sh
npm run kindle
npm run kindle:autostart
```

The Electron UI is normal setup path. Commands are for support and local
Kindle diagnostics.

## Structure

```text
.github/workflows/  scheduled OpenRouter PNG publishing
kindle/             managed Kindle fetch and Upstart scripts
locales/            Electron controller translations
scripts/            SSH installer and OpenRouter image generator
src/main/           Electron controller process
src/preload/        secure Electron bridge
src/renderer/       React Kindle controller
src/shared/         shared types
test/               Node tests
```

## Privacy

Never commit real Kindle IPs, SSH usernames/passwords, R2 credentials, OpenRouter
keys, tokens, cookies, session files, or logs. Use placeholders such as
`<KINDLE_IP>`, `<SSH_USER>`, `<SSH_PASSWORD>`, and `<R2_PUBLIC_HOST>`.

Electron stores a saved SSH password in Electron `userData`, using `safeStorage`
when available. Renderer receives only `kindlePasswordSaved`, never password.

## Links

- [Kindle installation](KINDLE-INSTALLATION.md)
- [Translations](locales/README.md)
- [GitHub Releases](https://github.com/alexishida/kindle-dashboard/releases)
