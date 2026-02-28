import type { StoredUrl } from '../types'

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

export function isPrivateIpv4(hostname: string): boolean {
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

export function isValidHostname(hostname: string): boolean {
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
