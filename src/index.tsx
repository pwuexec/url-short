import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { HonoRequest } from 'hono'
import { googleAuth } from '@hono/oauth-providers/google'
import { HomePage, StatsPage, NotFound, SearchPage, DashboardPage } from './components'
import type { Visit } from './components'
import { parseUserAgent } from './user-agent'

type User = { id: string; email: string; name: string; picture?: string; createdAt: string }
type Session = { userId: string; expiresAt: string }
type StoredUrl = { target: string; createdAt: string; favicon: string; createdByUserId?: string }

const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: User | null } }>()

const urlKey = (slug: string) => `url:${slug}`
const statsKey = (slug: string) => `stats:${slug}`
const sessionKey = (token: string) => `session:${token}`
const userKey = (id: string) => `user:${id}`
const userUrlKey = (userId: string, slug: string) => `userurl:${userId}:${slug}`

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds

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

// Session middleware — runs on every request
app.use('*', async (c, next) => {
  const token = getCookie(c, 'session')
  if (token) {
    const sessionData = await c.env.URLS.get(sessionKey(token), 'json') as Session | null
    if (sessionData && new Date(sessionData.expiresAt) > new Date()) {
      const userData = await c.env.URLS.get(userKey(sessionData.userId), 'json') as User | null
      c.set('user', userData)
    } else {
      c.set('user', null)
    }
  } else {
    c.set('user', null)
  }
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
  const token = getCookie(c, 'session')
  if (token) {
    await c.env.URLS.delete(sessionKey(token))
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.redirect('/')
})

// Dashboard
app.get('/dashboard', async (c) => {
  const user = c.get('user')
  if (!user) return c.redirect('/auth/google')

  const { keys } = await c.env.URLS.list({ prefix: `userurl:${user.id}:` })
  const entries = await Promise.all(
    keys.map(async (k) => {
      const slug = k.name.replace(`userurl:${user.id}:`, '')
      const data = await c.env.URLS.get(urlKey(slug), 'json') as StoredUrl | null
      return data ? { slug, ...data } : null
    })
  )

  const links = entries
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

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
    const data = await c.env.URLS.get(urlKey(created), 'json') as StoredUrl | null
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

  const user = c.get('user')
  await c.env.URLS.put(urlKey(slug), JSON.stringify({
    target,
    favicon: buildFaviconUrl(target),
    createdAt: new Date().toISOString(),
    ...(user ? { createdByUserId: user.id } : {}),
  }))
  await c.env.URLS.put(statsKey(slug), JSON.stringify({ visits: [] }))

  if (user) {
    await c.env.URLS.put(userUrlKey(user.id, slug), '1')
  }

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

  const exists = await c.env.URLS.get(urlKey(slug))
  if (!exists) return c.html(<SearchPage error="notfound" query={q} user={user} />, 404)

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
  const user = c.get('user')

  if (c.req.query('view') === 'json') {
    return c.json({
      slug,
      shortUrl: `${origin}/${slug}`,
      target: urlData.target,
      favicon,
      createdAt: urlData.createdAt,
      totalVisits: visits.length,
      visits: visits.map((visit) => ({
        ...visit,
        parsedUserAgent: parseUserAgent(visit.userAgent),
      })),
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
  const { success: allowed } = await c.env.RL_REDIRECT.limit({ key: getClientIp(c.req) })
  if (!allowed) return c.html(<NotFound code={429} message="too many requests" />, 429)

  const slug = c.req.param('slug')
  const urlData = await c.env.URLS.get(urlKey(slug), 'json') as StoredUrl | null

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
