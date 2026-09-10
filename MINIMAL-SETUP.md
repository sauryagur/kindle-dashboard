# Minimal OpenRouter Kindle Dashboard

This path does not use Electron, the local backend, or a PC-hosted image.

## Pipeline

1. GitHub Actions runs every six hours.
2. `scripts/generate-openrouter-dashboard.js` calls OpenRouter `/api/v1/key`.
3. ImageMagick converts the generated SVG to a 1072×1448 PNG.
4. The workflow uploads `openrouter-dashboard.png` to S3-compatible storage.
5. Kindle downloads that URL and displays it with FBInk.

## GitHub secrets

Set these repository secrets:

- `OPENROUTER_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION`
- `DASHBOARD_BUCKET` (bucket name, without `s3://`)
- `S3_ENDPOINT_URL` (optional; use for Cloudflare R2 or another S3-compatible service)

Use a dedicated OpenRouter key. Never put it on the Kindle or in the image URL.

## Kindle setup

Copy `kindle/openrouter-dashboard.env.example` to:

```text
/mnt/us/openrouter-dashboard.env
```

Set `DASHBOARD_URL` to the public or pre-signed PNG URL. Use
`kindle/fetch-display-once.sh` for manual testing, then use
`kindle/fetch-display-loop.sh` with `INTERVAL=21600` for periodic updates.

The loop releases `preventScreenSaver` between updates. Whether a sleeping
Kindle resumes a shell process after six hours depends on its model, firmware,
and power-management setup; verify this on the physical device before relying
on unattended refreshes.

## Local render test

```sh
OPENROUTER_API_KEY='<key>' \
  DASHBOARD_SVG=/tmp/openrouter-dashboard.svg \
  node scripts/generate-openrouter-dashboard.js
convert -background white /tmp/openrouter-dashboard.svg /tmp/openrouter-dashboard.png
```

Do not commit generated images, credentials, or real device/network details.
