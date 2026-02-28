import type { User, Session } from '../types'

// --- KV key helpers (private) ---

export const sessionKey = (token: string) => `session:${token}`
export const userKey    = (id: string)    => `user:${id}`

// --- Service functions ---

export async function loadSessionUser(kv: KVNamespace, token: string): Promise<User | null> {
  const sessionData = await kv.get(sessionKey(token), 'json') as Session | null
  if (!sessionData || new Date(sessionData.expiresAt) <= new Date()) return null
  return kv.get(userKey(sessionData.userId), 'json') as Promise<User | null>
}

export async function getSession(kv: KVNamespace, token: string): Promise<Session | null> {
  return kv.get(sessionKey(token), 'json') as Promise<Session | null>
}

export async function createSession(
  kv: KVNamespace,
  userId: string,
  ttl: number,
): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
  await kv.put(sessionKey(token), JSON.stringify({ userId, expiresAt }), { expirationTtl: ttl })
  return { token, expiresAt }
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(sessionKey(token))
}

export async function getUser(kv: KVNamespace, id: string): Promise<User | null> {
  return kv.get(userKey(id), 'json') as Promise<User | null>
}

export async function saveUser(kv: KVNamespace, user: User): Promise<void> {
  await kv.put(userKey(user.id), JSON.stringify(user))
}
