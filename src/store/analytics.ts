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

export async function getResetAt(kv: KVNamespace): Promise<string | undefined> {
  return (await kv.get('analytics:reset_at')) ?? undefined
}

export async function setResetAt(kv: KVNamespace, value: string): Promise<void> {
  await kv.put('analytics:reset_at', value)
}
