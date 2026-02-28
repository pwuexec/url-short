export type AnalyticsFilters = { days: number; ip?: string; slug?: string; country?: string }

export function sanitizeSqlStr(val: string): string {
  return val.replace(/'/g, "''").slice(0, 200)
}

// AE uses 'YYYY-MM-DD HH:MM:SS' datetime literals
export function toAeTs(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '')
}

export function visitWhere({ days, ip, slug, country }: AnalyticsFilters, resetAt?: string): string {
  const parts = [`blob1 = 'visit'`, `timestamp > NOW() - INTERVAL '${days}' DAY`]
  if (resetAt) parts.push(`timestamp > toDateTime('${toAeTs(resetAt)}')`)
  if (ip) parts.push(`blob4 = '${sanitizeSqlStr(ip)}'`)
  if (slug) parts.push(`blob2 = '${sanitizeSqlStr(slug)}'`)
  if (country) parts.push(`blob3 = '${sanitizeSqlStr(country)}'`)
  return parts.join(' AND ')
}

export function createWhere({ days, slug }: AnalyticsFilters, resetAt?: string): string {
  const parts = [`blob1 = 'create'`, `timestamp > NOW() - INTERVAL '${days}' DAY`]
  if (resetAt) parts.push(`timestamp > toDateTime('${toAeTs(resetAt)}')`)
  if (slug) parts.push(`blob2 = '${sanitizeSqlStr(slug)}'`)
  return parts.join(' AND ')
}
