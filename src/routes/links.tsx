import { Hono } from 'hono'
import type { HonoEnv, Visit } from '../types'
import { HomePage, StatsPage, NotFound, SearchPage, DashboardPage } from '../components'
import { parseUserAgent } from '../lib/user-agent'
import { getClientIp, parseVisitIndex } from '../lib/request'
import { normalizeTargetUrl, resolveFavicon } from '../lib/url'
import { getLink, getLinkStats, createShortUrl, logVisit, getUserLinks } from '../store/links'

const router = new Hono<HonoEnv>()

// Home page
router.get('/', async (c) => {
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

// Create short URL
router.post('/', async (c) => {
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
router.get('/search', async (c) => {
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

// Dashboard
router.get('/dashboard', async (c) => {
  const user = c.get('user')
  if (!user) return c.redirect('/auth/google')
  const links = await getUserLinks(c.env.URLS, user.id)
  const origin = new URL(c.req.url).origin
  return c.html(<DashboardPage user={user} links={links} origin={origin} />)
})

// Stats page
router.get('/:slug/stats', async (c) => {
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
router.get('/:slug', async (c) => {
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

export default router
