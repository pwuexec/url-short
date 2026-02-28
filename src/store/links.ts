import type { StoredUrl, Visit } from '../types'
import { buildFaviconUrl } from '../lib/url'

// --- KV key helpers (private) ---

const urlKey     = (slug: string)                 => `url:${slug}`
const statsKey   = (slug: string)                 => `stats:${slug}`
const userUrlKey = (userId: string, slug: string) => `userurl:${userId}:${slug}`

// --- Service functions ---

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let slug = ''
  for (let i = 0; i < 6; i++) slug += chars[Math.floor(Math.random() * chars.length)]
  return slug
}

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
