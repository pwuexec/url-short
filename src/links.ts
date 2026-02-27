import type { HonoRequest } from 'hono'

// --- Types ---

export type StoredUrl = { target: string; createdAt: string; favicon: string; createdByUserId?: string }

export interface Visit {
  ip: string
  country?: string
  city?: string
  region?: string
  latitude?: number
  longitude?: number
  userAgent?: string
  timestamp: string
}

// --- KV key helpers ---

export const urlKey     = (slug: string)                    => `url:${slug}`
export const statsKey   = (slug: string)                    => `stats:${slug}`
export const sessionKey = (token: string)                   => `session:${token}`
export const userKey    = (id: string)                      => `user:${id}`
export const userUrlKey = (userId: string, slug: string)    => `userurl:${userId}:${slug}`

// --- Pure utilities ---

export function getClientIp(req: HonoRequest): string {
  return req.header('cf-connecting-ip') ?? req.header('x-forwarded-for') ?? 'unknown'
}

export function parseVisitIndex(raw: string | undefined, max: number): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value >= max) return undefined
  return value
}

export function normalizeTargetUrl(raw: string): string | null {
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

export function buildFaviconUrl(target: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(target).origin)}`
}

export function resolveFavicon(urlData: StoredUrl): string {
  return urlData.favicon ?? buildFaviconUrl(urlData.target)
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isValidHostname(hostname: string): boolean {
  if (!hostname) return false
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

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let slug = ''
  for (let i = 0; i < 6; i++) slug += chars[Math.floor(Math.random() * chars.length)]
  return slug
}

// --- Service functions ---

export async function createShortUrl(
  kv: KVNamespace,
  { target, userId }: { target: string; userId?: string },
): Promise<{ slug: string; createdAt: string }> {
  let slug = generateSlug()
  while (await kv.get(urlKey(slug))) slug = generateSlug()

  const createdAt = new Date().toISOString()
  await kv.put(urlKey(slug), JSON.stringify({
    target,
    favicon: buildFaviconUrl(target),
    createdAt,
    ...(userId ? { createdByUserId: userId } : {}),
  }), { metadata: { createdAt } })
  await kv.put(statsKey(slug), JSON.stringify({ visits: [] }))
  if (userId) await kv.put(userUrlKey(userId, slug), '1')

  return { slug, createdAt }
}

export async function getLink(kv: KVNamespace, slug: string): Promise<StoredUrl | null> {
  return kv.get(urlKey(slug), 'json') as Promise<StoredUrl | null>
}

export async function getLinkStats(kv: KVNamespace, slug: string): Promise<Visit[]> {
  const data = await kv.get(statsKey(slug), 'json') as { visits: Visit[] } | null
  return data?.visits ?? []
}

export async function logVisit(kv: KVNamespace, slug: string, visit: Visit): Promise<void> {
  const data = await kv.get(statsKey(slug), 'json') as { visits: Visit[] } | null
  const visits = data?.visits ?? []
  visits.push(visit)
  await kv.put(statsKey(slug), JSON.stringify({ visits }))
}

export async function queryAnalyticsEngine(
  apiToken: string,
  accountId: string,
  sql: string,
): Promise<Array<Record<string, string>>> {
  if (!apiToken) return []
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'text/plain' }, body: sql },
    )
    if (!res.ok) return []
    const json = await res.json() as { data: Array<Record<string, string>> }
    return json.data ?? []
  } catch {
    return []
  }
}

export async function getRecentLinks(
  kv: KVNamespace,
  limit = 10,
): Promise<Array<{ slug: string; createdAt: string }>> {
  const { keys } = await kv.list<{ createdAt: string }>({ prefix: 'url:', limit: 1000 })
  return keys
    .filter((k): k is typeof k & { metadata: { createdAt: string } } => !!k.metadata?.createdAt)
    .sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt))
    .slice(0, limit)
    .map(k => ({ slug: k.name.slice('url:'.length), createdAt: k.metadata.createdAt }))
}

export async function getUserLinks(
  kv: KVNamespace,
  userId: string,
): Promise<Array<{ slug: string } & StoredUrl>> {
  const { keys } = await kv.list({ prefix: `userurl:${userId}:` })
  const entries = await Promise.all(
    keys.map(async (k) => {
      const slug = k.name.replace(`userurl:${userId}:`, '')
      const data = await kv.get(urlKey(slug), 'json') as StoredUrl | null
      return data ? { slug, ...data } : null
    }),
  )
  return entries
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
