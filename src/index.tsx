import { Hono } from 'hono'
import type { HonoRequest } from 'hono'
import { HomePage, StatsPage, NotFound, SearchPage } from './components'
import type { Visit } from './components'
import { parseUserAgent, pruneUnknownData } from './user-agent'

const app = new Hono<{ Bindings: CloudflareBindings }>()

type StoredUrl = { target: string; createdAt: string; favicon: string; createdByIp?: string; createdByUa?: string }

const urlKey = (slug: string) => `url:${slug}`
const statsKey = (slug: string) => `stats:${slug}`

function getClientIp(req: HonoRequest): string {
  return req.header('cf-connecting-ip') ?? req.header('x-forwarded-for') ?? 'unknown'
}

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let slug = ''
  for (let i = 0; i < 6; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)]
  }
  return slug
}

function normalizeTargetUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!isValidHostname(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  const [a, b] = parts
  return (
    a === 0 ||                              // 0.0.0.0/8
    a === 10 ||                             // 10.0.0.0/8
    a === 127 ||                            // 127.0.0.0/8  loopback
    (a === 169 && b === 254) ||             // 169.254.0.0/16  link-local
    (a === 172 && b >= 16 && b <= 31) ||    // 172.16.0.0/12
    (a === 192 && b === 168)                // 192.168.0.0/16
  )
}

function isValidHostname(hostname: string): boolean {
  if (!hostname) return false
  // Reject localhost and IPv6 (includes loopback ::1 and link-local addresses)
  if (hostname === 'localhost' || hostname.includes(':')) return false

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    const valid = hostname.split('.').every((segment) => {
      const n = Number(segment)
      return Number.isInteger(n) && n >= 0 && n <= 255
    })
    return valid && !isPrivateIpv4(hostname)
  }

  const normalized = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname
  const labels = normalized.split('.')
  if (labels.length < 2) return false

  return labels.every((label) => (
    /^[a-zA-Z0-9-]{1,63}$/.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  ))
}

function buildFaviconUrl(target: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(target).origin)}`
}

function resolveFavicon(urlData: StoredUrl): string {
  return urlData.favicon ?? buildFaviconUrl(urlData.target)
}

function parseVisitIndex(raw: string | undefined, max: number): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value >= max) return undefined
  return value
}

// Home page
app.get('/', async (c) => {
  const created = c.req.query('created')
  const error = c.req.query('error')
  const inputValue = c.req.query('url')
  const origin = new URL(c.req.url).origin
  let createdFavicon: string | undefined

  if (created) {
    const createdData = await c.env.URLS.get(urlKey(created), 'json') as StoredUrl | null
    if (createdData) createdFavicon = resolveFavicon(createdData)
  }

  return c.html(
    <HomePage
      created={created}
      origin={origin}
      createdFavicon={createdFavicon}
      error={error}
      inputValue={inputValue}
    />
  )
})

// Create short URL
app.post('/', async (c) => {
  const { success: allowed } = await c.env.RL_CREATE.limit({ key: getClientIp(c.req) })
  if (!allowed) return c.redirect('/?error=ratelimit')

  const body = await c.req.parseBody()
  const rawTarget = (body['url'] as string ?? '').trim()

  if (!rawTarget) return c.redirect('/?error=empty')

  const target = normalizeTargetUrl(rawTarget)
  if (!target) return c.redirect(`/?error=invalid&url=${encodeURIComponent(rawTarget)}`)

  let slug = generateSlug()
  while (await c.env.URLS.get(urlKey(slug))) {
    slug = generateSlug()
  }

  await c.env.URLS.put(urlKey(slug), JSON.stringify({
    target,
    favicon: buildFaviconUrl(target),
    createdAt: new Date().toISOString(),
    createdByIp: getClientIp(c.req),
    createdByUa: c.req.header('user-agent') ?? 'unknown',
  }))
  await c.env.URLS.put(statsKey(slug), JSON.stringify({ visits: [] }))

  return c.redirect(`/?created=${slug}`)
})

// Search page
app.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()

  if (!q) return c.html(<SearchPage />)

  let slug = q
  try {
    const url = new URL(q.includes('://') ? q : `https://${q}`)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length > 0) slug = parts[0]
  } catch {
    slug = q.replace(/^\/+|\/+$/g, '')
  }

  if (!slug) return c.html(<SearchPage error="empty" query={q} />)

  const exists = await c.env.URLS.get(urlKey(slug))
  if (!exists) return c.html(<SearchPage error="notfound" query={q} />, 404)

  return c.redirect(`/${slug}/stats`)
})

// Stats page
app.get('/:slug/stats', async (c) => {
  const slug = c.req.param('slug')
  const urlData = await c.env.URLS.get(urlKey(slug), 'json') as StoredUrl | null

  if (!urlData) return c.html(<NotFound />, 404)

  const statsData = await c.env.URLS.get(statsKey(slug), 'json') as { visits: Visit[] } | null
  const visits = statsData?.visits ?? []
  const favicon = resolveFavicon(urlData)
  const origin = new URL(c.req.url).origin

  if (c.req.query('view') === 'json') {
    return c.json(pruneUnknownData({
      slug,
      shortUrl: `${origin}/${slug}`,
      target: urlData.target,
      favicon,
      createdAt: urlData.createdAt ?? null,
      totalVisits: visits.length,
      visits: visits.map((visit) => ({
        ...visit,
        parsedUserAgent: parseUserAgent(visit.userAgent),
      })),
    }) as Record<string, unknown>)
  }

  const mapIndex = parseVisitIndex(c.req.query('map'), visits.length)
  const uaIndex = parseVisitIndex(c.req.query('ua'), visits.length)

  return c.html(
    <StatsPage
      slug={slug}
      target={urlData.target}
      favicon={favicon}
      visits={visits}
      selectedMapIndex={mapIndex}
      selectedUaIndex={uaIndex}
      origin={origin}
    />
  )
})

// Redirect + log visit
app.get('/:slug', async (c) => {
  const { success: allowed } = await c.env.RL_REDIRECT.limit({ key: getClientIp(c.req) })
  if (!allowed) return c.html(<NotFound code={429} message="too many requests" />, 429)

  const slug = c.req.param('slug')
  const urlData = await c.env.URLS.get(urlKey(slug), 'json') as StoredUrl | null

  if (!urlData) return c.html(<NotFound />, 404)

  const cf = (c.req.raw as any).cf ?? {}
  const visit: Visit = {
    ip: getClientIp(c.req),
    country: cf.country ?? 'unknown',
    city: cf.city ?? undefined,
    region: cf.region ?? undefined,
    latitude: cf.latitude ? Number(cf.latitude) : undefined,
    longitude: cf.longitude ? Number(cf.longitude) : undefined,
    userAgent: c.req.header('user-agent') ?? 'unknown',
    timestamp: new Date().toISOString(),
  }

  c.executionCtx.waitUntil(
    (async () => {
      const statsData = await c.env.URLS.get(statsKey(slug), 'json') as { visits: Visit[] } | null
      const visits = statsData?.visits ?? []
      visits.push(visit)
      await c.env.URLS.put(statsKey(slug), JSON.stringify({ visits }))
    })()
  )

  return c.redirect(urlData.target, 302)
})

export default app
