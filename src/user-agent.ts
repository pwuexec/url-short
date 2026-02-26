import Bowser from 'bowser'

export type ParsedUserAgent = {
  browser: string
  browserVersion: string
  os: string
  osVersion: string
  device: string
  engine: string
  engineVersion: string
  platformVendor: string
  platformModel: string
  platformType: string
}

export function isKnownValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 && normalized !== 'unknown'
  }

  return true
}

export function pruneUnknownData(input: unknown): unknown {
  if (Array.isArray(input)) {
    const cleaned = input
      .map((item) => pruneUnknownData(item))
      .filter((item) => item !== undefined)
    return cleaned
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input)
      .map(([key, value]) => [key, pruneUnknownData(value)] as const)
      .filter(([, value]) => value !== undefined)

    if (entries.length === 0) {
      return undefined
    }

    return Object.fromEntries(entries)
  }

  if (!isKnownValue(input)) {
    return undefined
  }

  return input
}

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  const parsed = Bowser.parse(userAgent || '')
  const platformType = parsed.platform.type
    ? `${parsed.platform.type.charAt(0).toUpperCase()}${parsed.platform.type.slice(1)}`
    : 'Desktop'

  return {
    browser: parsed.browser.name ?? 'Unknown',
    browserVersion: parsed.browser.version ?? 'Unknown',
    os: parsed.os.name ?? 'Unknown',
    osVersion: parsed.os.versionName ?? parsed.os.version ?? 'Unknown',
    device: platformType,
    engine: parsed.engine?.name ?? 'Unknown',
    engineVersion: parsed.engine?.version ?? 'Unknown',
    platformVendor: parsed.platform.vendor ?? 'Unknown',
    platformModel: parsed.platform.model ?? 'Unknown',
    platformType,
  }
}
