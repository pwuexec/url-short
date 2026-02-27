# url-short

A lightweight URL shortener with built-in click analytics, built on Cloudflare's edge infrastructure.

## What it does

- Creates short links from full URLs
- Redirects `/:slug` to the original URL
- Tracks visits (IP, country, city, region, coordinates, user agent)
- Shows per-link stats in a simple dashboard
- Exposes stats as JSON at `/:slug/stats?view=json`

## Stack

- **Hono** — minimal web framework for Cloudflare Workers
- **Cloudflare Workers** — runs the app at the edge, globally distributed, no servers to manage
- **Cloudflare KV** — serverless key-value store used to persist URLs and visit data
- **Wrangler** — Cloudflare's CLI for local development and deployment

## Why Cloudflare

Cloudflare Workers run at the edge (close to the user), making redirects near-instant regardless of location. KV is globally replicated, so stored URLs are available everywhere with low latency. There's no server to provision, scale, or maintain — and the free tier is generous enough for personal use.

## CI/CD

Two GitHub Actions pipelines:

| Workflow | Triggers | Purpose |
|---|---|---|
| `ci.yml` | Push to any branch, PRs to `main` | Type checks the codebase with `tsc --noEmit` to catch errors before they reach production |
| `deploy.yml` | Push to `main` | Deploys to Cloudflare Workers via Wrangler and creates a GitHub Release |

## Run locally

```bash
bun install
bun run dev
```

## Configuration

This project uses three places for configuration:

- `wrangler.jsonc -> vars`: non-sensitive values committed to git
- `wrangler secret put ...`: sensitive values in Cloudflare (production)
- `.dev.vars`: sensitive local values for `wrangler dev` (not committed)

Secret binding TypeScript definitions are declared in `src/env.d.ts`.

### Variables

| Name | Type in code | Where to set it | Purpose |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | `string` | `wrangler.jsonc` `vars` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | `string` | Cloudflare secret + `.dev.vars` | Google OAuth client secret |
| `CF_ANALYTICS_API_TOKEN` | `string` | Cloudflare secret + `.dev.vars` | Token used to query Cloudflare Analytics Engine |
| `ANALYTICS_ADMIN_EMAILS` | `string` (JSON) | Cloudflare secret + `.dev.vars` | Admin allowlist for `/analytics` |

`ANALYTICS_ADMIN_EMAILS` is stored as a JSON string and parsed at runtime.
Example value:

```json
["admin@example.com","owner@example.com"]
```

### Set production secrets

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put CF_ANALYTICS_API_TOKEN
wrangler secret put ANALYTICS_ADMIN_EMAILS
```

### Local `.dev.vars` example

```env
GOOGLE_CLIENT_SECRET=your_google_secret
CF_ANALYTICS_API_TOKEN=your_cf_api_token
ANALYTICS_ADMIN_EMAILS=["admin@example.com"]
```

## Deploy

```bash
bun run deploy
```

## Notes

- Visit data is stored in KV as an append-only array per slug.
