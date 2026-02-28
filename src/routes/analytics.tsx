import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { NotFound } from '../components'
import { AnalyticsPage } from '../components'
import { queryAnalyticsEngine, getResetAt, setResetAt } from '../store/analytics'
import { visitWhere, createWhere } from '../lib/sql'
import type { AnalyticsFilters } from '../lib/sql'

const CF_ACCOUNT_ID = '2716bf6ee8be2880904e70f19050d2ef'

const router = new Hono<HonoEnv>()

// Analytics overview
router.get('/analytics', async (c) => {
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
  const resetAt = await getResetAt(c.env.URLS)
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
router.post('/admin/reset', async (c) => {
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
    setResetAt(c.env.URLS, resetAt),
  ])

  console.log(`[admin:reset] user=${user.id} at=${resetAt}`)
  return c.redirect('/analytics')
})

export default router
