import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { googleAuth } from '@hono/oauth-providers/google'
import type { HonoEnv, User } from '../types'
import { loadSessionUser, createSession, deleteSession, getUser, saveUser, sessionKey } from '../store/sessions'

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds

const router = new Hono<HonoEnv>()

// Google OAuth middleware — mounted at request time to access c.env
router.use('/auth/google', (c, next) =>
  googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ['openid', 'email', 'profile'],
  })(c, next)
)

// Google OAuth callback handler
router.get('/auth/google', async (c) => {
  const googleUser = c.get('user-google') as { id: string; email: string; name: string; picture?: string } | undefined
  if (!googleUser) return c.redirect('/?error=auth')

  const existingUser = await getUser(c.env.URLS, googleUser.id)
  const user: User = {
    id: googleUser.id,
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
    createdAt: existingUser?.createdAt ?? new Date().toISOString(),
  }
  await saveUser(c.env.URLS, user)
  console.log(`[auth:login] user=${user.id}`)

  const { token } = await createSession(c.env.URLS, user.id, SESSION_TTL)

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
router.post('/auth/logout', async (c) => {
  const user = c.get('user')
  const token = getCookie(c, 'session')
  if (token) await deleteSession(c.env.URLS, token)
  deleteCookie(c, 'session', { path: '/' })
  if (user) console.log(`[auth:logout] user=${user.id}`)
  return c.redirect('/')
})

export default router
