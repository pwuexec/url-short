import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { googleAuth } from '@hono/oauth-providers/google'
import { HomePage, StatsPage, NotFound, SearchPage, DashboardPage, AnalyticsPage } from './components'
import { parseUserAgent } from './user-agent'
import { describeRoute, openAPIRouteHandler, resolver, validator } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import * as v from 'valibot'
import {
  getClientIp, normalizeTargetUrl, resolveFavicon, parseVisitIndex,
  sessionKey, userKey,
  getLink, getLinkStats, createShortUrl, logVisit, getUserLinks, queryAnalyticsEngine,
} from './links'
import type { Visit } from './links'

type User = { id: string; email: string; name: string; picture?: string; createdAt: string; isAdmin?: boolean }
type Session = { userId: string; expiresAt: string }

const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: User | null } }>()

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds

// --- API schemas ---
const ShortenBody = v.object({ url: v.string() })
const SlugParam = v.object({ slug: v.string() })
const ErrorResponse = v.object({ error: v.string() })
const ShortenResponse = v.object({
  slug: v.string(),
  shortUrl: v.string(),
  target: v.string(),
  createdAt: v.string(),
})
const LinkResponse = v.object({
  slug: v.string(),
  shortUrl: v.string(),
  target: v.string(),
  favicon: v.string(),
  createdAt: v.string(),
})
const StatsResponse = v.object({
  slug: v.string(),
  shortUrl: v.string(),
  target: v.string(),
  favicon: v.string(),
  createdAt: v.string(),
  totalVisits: v.number(),
  visits: v.array(v.looseObject({
    ip: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    timestamp: v.string(),
  })),
})

// Session middleware — runs on every request
app.use('*', async (c, next) => {
  const token = getCookie(c, 'session')
  let userData: User | null = null
  if (token) {
    const sessionData = await c.env.URLS.get(sessionKey(token), 'json') as Session | null
    if (sessionData && new Date(sessionData.expiresAt) > new Date()) {
      userData = await c.env.URLS.get(userKey(sessionData.userId), 'json') as User | null
    }
  }
  const adminEmailsRaw = c.env.ANALYTICS_ADMIN_EMAILS
  let adminEmails: string[] = []
  if (typeof adminEmailsRaw === 'string' && adminEmailsRaw.trim() !== '') {
    try {
      const parsed = JSON.parse(adminEmailsRaw)
      if (Array.isArray(parsed)) {
        adminEmails = parsed.filter((value): value is string => typeof value === 'string')
      }
    } catch {
      console.warn('[config] ANALYTICS_ADMIN_EMAILS is not valid JSON array')
    }
  }
  c.set('user', userData ? { ...userData, isAdmin: adminEmails.includes(userData.email) } : null)
  await next()
})

// Google OAuth middleware — mounted at request time to access c.env
app.use('/auth/google', (c, next) =>
  googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ['openid', 'email', 'profile'],
  })(c, next)
)

// Google OAuth callback handler
app.get('/auth/google', async (c) => {
  const googleUser = c.get('user-google') as { id: string; email: string; name: string; picture?: string } | undefined
  if (!googleUser) return c.redirect('/?error=auth')

  const user: User = {
    id: googleUser.id,
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
    createdAt: (await c.env.URLS.get(userKey(googleUser.id), 'json') as User | null)?.createdAt ?? new Date().toISOString(),
  }
  await c.env.URLS.put(userKey(user.id), JSON.stringify(user))
  console.log(`[auth:login] user=${user.id}`)

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString()
  await c.env.URLS.put(sessionKey(token), JSON.stringify({ userId: user.id, expiresAt }), { expirationTtl: SESSION_TTL })

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  })

  return c.redirect('/dashboard')
})

// Logout
app.post('/auth/logout', async (c) => {
  const user = c.get('user')
  const token = getCookie(c, 'session')
  if (token) await c.env.URLS.delete(sessionKey(token))
  deleteCookie(c, 'session', { path: '/' })
  if (user) console.log(`[auth:logout] user=${user.id}`)
  return c.redirect('/')
})

// Dashboard
app.get('/dashboard', async (c) => {
  const user = c.get('user')
  if (!user) return c.redirect('/auth/google')
  const links = await getUserLinks(c.env.URLS, user.id)
  const origin = new URL(c.req.url).origin
  return c.html(<DashboardPage user={user} links={links} origin={origin} />)
})

// Home page
app.get('/', async (c) => {
  const created = c.req.query('created')
  const error = c.req.query('error')
  const inputValue = c.req.query('url')
  const origin = new URL(c.req.url).origin
  const user = c.get('user')
  let createdUrlData: { target: string; favicon: string; createdAt: string } | undefined

  if (created) {
    const data = await getLink(c.env.URLS, created)
    if (data) createdUrlData = { target: data.target, favicon: resolveFavicon(data), createdAt: data.createdAt }
  }

  return c.html(
    <HomePage
      created={created}
      origin={origin}
      createdUrlData={createdUrlData}
      error={error}
      inputValue={inputValue}
      user={user}
    />
  )
})

// Analytics overview
const CF_ACCOUNT_ID = '2716bf6ee8be2880904e70f19050d2ef'

type AnalyticsFilters = { days: number; ip?: string; slug?: string; country?: string }

function sanitizeSqlStr(val: string): string {
  return val.replace(/'/g, "''").slice(0, 200)
}

// AE uses 'YYYY-MM-DD HH:MM:SS' datetime literals
function toAeTs(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '')
}

function visitWhere({ days, ip, slug, country }: AnalyticsFilters, resetAt?: string): string {
  const parts = [`blob1 = 'visit'`, `timestamp > NOW() - INTERVAL '${days}' DAY`]
  if (resetAt) parts.push(`timestamp > toDateTime('${toAeTs(resetAt)}')`)
  if (ip) parts.push(`blob4 = '${sanitizeSqlStr(ip)}'`)
  if (slug) parts.push(`blob2 = '${sanitizeSqlStr(slug)}'`)
  if (country) parts.push(`blob3 = '${sanitizeSqlStr(country)}'`)
  return parts.join(' AND ')
}

function createWhere({ days, slug }: AnalyticsFilters, resetAt?: string): string {
  const parts = [`blob1 = 'create'`, `timestamp > NOW() - INTERVAL '${days}' DAY`]
  if (resetAt) parts.push(`timestamp > toDateTime('${toAeTs(resetAt)}')`)
  if (slug) parts.push(`blob2 = '${sanitizeSqlStr(slug)}'`)
  return parts.join(' AND ')
}

app.get('/analytics', async (c) => {
  const user = c.get('user')
  if (!user) return c.redirect('/auth/google')
  if (!user.isAdmin) return c.html(<NotFound code={403} message="forbidden" />, 403)

  const rawDays = Number(c.req.query('days'))
  const filters: AnalyticsFilters = {
    days: [7, 14, 30, 90].includes(rawDays) ? rawDays : 30,
    ip: c.req.query('ip')?.trim() || undefined,
    slug: c.req.query('slug')?.trim() || undefined,
    country: c.req.query('country')?.trim() || undefined,
  }

  const token = c.env.CF_ANALYTICS_API_TOKEN
  const resetAt = await c.env.URLS.get('analytics:reset_at') ?? undefined
  const baseVisitWhere = visitWhere({ days: filters.days, slug: filters.slug }, resetAt) // for country list: no ip/country filter
  const [createdSummary, visitsSummary, topSlugs, topCountries, dailyVisits, allCountries] = await Promise.all([
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT SUM(_sample_interval) AS n FROM url_shortener WHERE ${createWhere(filters, resetAt)}`),
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT SUM(_sample_interval) AS n FROM url_shortener WHERE ${visitWhere(filters, resetAt)}`),
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT blob2 AS slug, SUM(_sample_interval) AS visits FROM url_shortener WHERE ${visitWhere(filters, resetAt)} GROUP BY slug ORDER BY visits DESC LIMIT 10`),
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT blob3 AS country, SUM(_sample_interval) AS visits FROM url_shortener WHERE ${visitWhere(filters, resetAt)} AND blob3 != '' GROUP BY country ORDER BY visits DESC LIMIT 10`),
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT toDate(timestamp) AS day, SUM(_sample_interval) AS visits FROM url_shortener WHERE ${visitWhere(filters, resetAt)} GROUP BY day ORDER BY day`),
    queryAnalyticsEngine(token, CF_ACCOUNT_ID,
      `SELECT blob3 AS country FROM url_shortener WHERE ${baseVisitWhere} AND blob3 != '' GROUP BY country ORDER BY country`),
  ])

  return c.html(
    <AnalyticsPage
      user={user}
      created={Number(createdSummary[0]?.n ?? 0)}
      visits={Number(visitsSummary[0]?.n ?? 0)}
      topSlugs={topSlugs}
      topCountries={topCountries}
      dailyVisits={dailyVisits}
      allCountries={allCountries}
      filters={filters}
      origin={new URL(c.req.url).origin}
    />
  )
})

// Admin: reset all URL + stats data
app.post('/admin/reset', async (c) => {
  const user = c.get('user')
  if (!user?.isAdmin) return c.redirect('/analytics')

  const resetAt = new Date().toISOString()

  await Promise.all([
    // KV: wipe URLs, stats, user-URL associations
    ...['url:', 'stats:', 'userurl:'].map(async (prefix) => {
      let cursor: string | undefined
      do {
        const result = await c.env.URLS.list({ prefix, cursor, limit: 1000 })
        await Promise.all(result.keys.map(k => c.env.URLS.delete(k.name)))
        cursor = result.list_complete ? undefined : result.cursor
      } while (cursor)
    }),
    // Analytics Engine is immutable — store a watermark so queries ignore pre-reset data
    c.env.URLS.put('analytics:reset_at', resetAt),
  ])

  console.log(`[admin:reset] user=${user.id} at=${resetAt}`)
  return c.redirect('/analytics')
})

// Create short URL
app.post('/', async (c) => {
  const ip = getClientIp(c.req)
  const { success: allowed } = await c.env.RL_CREATE.limit({ key: ip })
  if (!allowed) {
    console.warn(`[ratelimit] POST / ip=${ip}`)
    return c.redirect('/?error=ratelimit')
  }

  const body = await c.req.parseBody()
  const rawTarget = (body['url'] as string ?? '').trim()
  if (!rawTarget) return c.redirect('/?error=empty')

  const target = normalizeTargetUrl(rawTarget)
  if (!target) return c.redirect(`/?error=invalid&url=${encodeURIComponent(rawTarget)}`)

  const user = c.get('user')
  const { slug } = await createShortUrl(c.env.URLS, { target, userId: user?.id })
  console.log(`[create] slug=${slug} ip=${ip}${user?.id ? ` user=${user.id}` : ''}`)
  c.env.ANALYTICS.writeDataPoint({ blobs: ['create', slug], indexes: [slug] })
  return c.redirect(`/?created=${slug}`)
})

// Search page
app.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const user = c.get('user')

  if (!q) return c.html(<SearchPage user={user} />)

  let slug = q
  try {
    const url = new URL(q.includes('://') ? q : `https://${q}`)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length > 0) slug = parts[0]
  } catch {
    slug = q.replace(/^\/+|\/+$/g, '')
  }

  if (!slug) return c.html(<SearchPage error="empty" query={q} user={user} />)

  const exists = await getLink(c.env.URLS, slug)
  if (!exists) return c.html(<SearchPage error="notfound" query={q} user={user} />, 404)

  return c.redirect(`/${slug}/stats`)
})

// --- REST API ---

// Swagger UI
app.get('/api/docs', describeRoute({ hide: true }), swaggerUI({ url: '/api/openapi.json' }))

// OpenAPI spec (excludeStaticFile:true by default removes this route itself from the spec)
app.get('/api/openapi.json', openAPIRouteHandler(app, {
  documentation: {
    info: { title: 'URL Shortener API', version: '1.0.0', description: 'Create and manage short URLs.' },
  },
  exclude: /^\/(?!api\/)/,  // hide non-/api paths (HTML pages, auth, dashboard…)
}))

// POST /api/shorten
app.post('/api/shorten',
  describeRoute({
    summary: 'Create a short URL',
    description: 'Rate limited to **5 requests per minute** per IP. Returns 429 when exceeded.',
    tags: ['Links'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', example: 'https://example.com' } } },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: resolver(ShortenResponse) } } },
      400: { description: 'Invalid URL', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  validator('json', ShortenBody),
  async (c) => {
    const ip = getClientIp(c.req)
    const { success: allowed } = await c.env.RL_CREATE.limit({ key: ip })
    if (!allowed) {
      console.warn(`[ratelimit] api:shorten ip=${ip}`)
      return c.json({ error: 'rate limit exceeded' }, 429)
    }

    const { url: rawUrl } = c.req.valid('json')
    const target = normalizeTargetUrl(rawUrl)
    if (!target) return c.json({ error: 'invalid URL' }, 400)

    const user = c.get('user')
    const { slug, createdAt } = await createShortUrl(c.env.URLS, { target, userId: user?.id })
    console.log(`[api:create] slug=${slug} ip=${ip}${user?.id ? ` user=${user.id}` : ''}`)
    c.env.ANALYTICS.writeDataPoint({ blobs: ['create', slug], indexes: [slug] })
    const origin = new URL(c.req.url).origin
    return c.json({ slug, shortUrl: `${origin}/${slug}`, target, createdAt }, 201)
  }
)

// GET /api/links/:slug
app.get('/api/links/:slug',
  describeRoute({
    summary: 'Get link info',
    description: 'Rate limited to **60 requests per minute** per IP. Returns 429 when exceeded.',
    tags: ['Links'],
    responses: {
      200: { description: 'Link metadata', content: { 'application/json': { schema: resolver(LinkResponse) } } },
      404: { description: 'Not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  validator('param', SlugParam),
  async (c) => {
    const { success: allowed } = await c.env.RL_REDIRECT.limit({ key: getClientIp(c.req) })
    if (!allowed) return c.json({ error: 'rate limit exceeded' }, 429)

    const { slug } = c.req.valid('param')
    const urlData = await getLink(c.env.URLS, slug)
    if (!urlData) return c.json({ error: 'not found' }, 404)

    const origin = new URL(c.req.url).origin
    return c.json({ slug, shortUrl: `${origin}/${slug}`, target: urlData.target, favicon: resolveFavicon(urlData), createdAt: urlData.createdAt })
  }
)

// GET /api/links/:slug/stats
app.get('/api/links/:slug/stats',
  describeRoute({
    summary: 'Get visit stats for a link',
    description: 'Rate limited to **60 requests per minute** per IP. Returns 429 when exceeded.',
    tags: ['Links'],
    responses: {
      200: { description: 'Visit stats', content: { 'application/json': { schema: resolver(StatsResponse) } } },
      404: { description: 'Not found', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
      429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: resolver(ErrorResponse) } } },
    },
  }),
  validator('param', SlugParam),
  async (c) => {
    const { success: allowed } = await c.env.RL_REDIRECT.limit({ key: getClientIp(c.req) })
    if (!allowed) return c.json({ error: 'rate limit exceeded' }, 429)

    const { slug } = c.req.valid('param')
    const urlData = await getLink(c.env.URLS, slug)
    if (!urlData) return c.json({ error: 'not found' }, 404)

    const visits = await getLinkStats(c.env.URLS, slug)
    const origin = new URL(c.req.url).origin
    return c.json({
      slug,
      shortUrl: `${origin}/${slug}`,
      target: urlData.target,
      favicon: resolveFavicon(urlData),
      createdAt: urlData.createdAt,
      totalVisits: visits.length,
      visits: visits.map((visit) => ({ ...visit, parsedUserAgent: parseUserAgent(visit.userAgent) })),
    })
  }
)

// Stats page
app.get('/:slug/stats', async (c) => {
  const slug = c.req.param('slug')
  const urlData = await getLink(c.env.URLS, slug)
  if (!urlData) return c.html(<NotFound />, 404)

  const visits = await getLinkStats(c.env.URLS, slug)
  const favicon = resolveFavicon(urlData)
  const origin = new URL(c.req.url).origin
  const user = c.get('user')

  if (c.req.query('view') === 'json') {
    return c.json({
      slug,
      shortUrl: `${origin}/${slug}`,
      target: urlData.target,
      favicon,
      createdAt: urlData.createdAt,
      totalVisits: visits.length,
      visits: visits.map((visit) => ({ ...visit, parsedUserAgent: parseUserAgent(visit.userAgent) })),
    })
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
      user={user}
    />
  )
})

// Redirect + log visit
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const ip = getClientIp(c.req)
  const { success: allowed } = await c.env.RL_REDIRECT.limit({ key: ip })
  if (!allowed) {
    console.warn(`[ratelimit] redirect slug=${slug} ip=${ip}`)
    return c.html(<NotFound code={429} message="too many requests" />, 429)
  }
  const urlData = await getLink(c.env.URLS, slug)
  if (!urlData) return c.html(<NotFound />, 404)

  const cf = (c.req.raw as any).cf ?? {}
  const visit: Visit = {
    ip: getClientIp(c.req),
    country: cf.country,
    city: cf.city,
    region: cf.region,
    latitude: cf.latitude ? Number(cf.latitude) : undefined,
    longitude: cf.longitude ? Number(cf.longitude) : undefined,
    userAgent: c.req.header('user-agent'),
    timestamp: new Date().toISOString(),
  }

  c.executionCtx.waitUntil(logVisit(c.env.URLS, slug, visit))
  c.env.ANALYTICS.writeDataPoint({ blobs: ['visit', slug, visit.country ?? '', visit.ip], indexes: [slug] })

  return c.redirect(urlData.target, 302)
})

export default app
