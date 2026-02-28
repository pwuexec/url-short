import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { HonoEnv } from './types'
import { loadSessionUser } from './store/sessions'
import authRouter from './routes/auth'
import analyticsRouter from './routes/analytics'
import linksRouter from './routes/links'
import apiRouter from './routes/api'

const app = new Hono<HonoEnv>()

// Session middleware — runs on every request
app.use('*', async (c, next) => {
  const token = getCookie(c, 'session')
  let userData = null
  if (token) {
    userData = await loadSessionUser(c.env.URLS, token)
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

app.route('/', authRouter)
app.route('/', analyticsRouter)
app.route('/', linksRouter)
app.route('/', apiRouter)

export default app
