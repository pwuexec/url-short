import { Hono } from 'hono'
import { describeRoute, openAPIRouteHandler, resolver, validator } from 'hono-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import * as v from 'valibot'
import type { HonoEnv } from '../types'
import { getClientIp } from '../lib/request'
import { normalizeTargetUrl, resolveFavicon } from '../lib/url'
import { parseUserAgent } from '../lib/user-agent'
import { getLink, getLinkStats, createShortUrl } from '../store/links'

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

const router = new Hono<HonoEnv>()

// Swagger UI
router.get('/api/docs', describeRoute({ hide: true }), swaggerUI({ url: '/api/openapi.json' }))

// OpenAPI spec (excludeStaticFile:true by default removes this route itself from the spec)
router.get('/api/openapi.json', openAPIRouteHandler(router, {
  documentation: {
    info: { title: 'URL Shortener API', version: '1.0.0', description: 'Create and manage short URLs.' },
  },
  exclude: /^\/(?!api\/)/,  // hide non-/api paths (HTML pages, auth, dashboard…)
}))

// POST /api/shorten
router.post('/api/shorten',
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
router.get('/api/links/:slug',
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
router.get('/api/links/:slug/stats',
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

export default router
