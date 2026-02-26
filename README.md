# url-short

Hacky URL shortener + basic click analytics, running on Cloudflare Workers.

Live site: https://733113.xyz/

## What it does

- Creates short links from full URLs
- Redirects `/:slug` to the original URL
- Tracks visits (IP, user agent, country/city/region, coordinates when available)
- Shows per-link stats in a simple dashboard
- Exposes stats as JSON at `/:slug/stats?view=json`

## Stack

- Hono
- Cloudflare Workers + KV
- Wrangler
- Bun (package manager in CI)

## Run locally

```bash
bun install
bun run dev
```

## Deploy

```bash
bun run deploy
```

## Notes

- This is intentionally hacky and optimized for quick iteration, not polished architecture.
- Visit data is stored in KV and currently kept as an append-only array per slug.
