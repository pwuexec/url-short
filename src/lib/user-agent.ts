import Bowser from 'bowser'

export type ParsedUserAgent = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
  engine?: string
  engineVersion?: string
  platformVendor?: string
  platformModel?: string
  platformType?: string
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  if (!userAgent) return {}
  const parsed = Bowser.parse(userAgent)
  const platformType = parsed.platform.type
    ? `${parsed.platform.type.charAt(0).toUpperCase()}${parsed.platform.type.slice(1)}`
    : undefined

  return {
    browser: parsed.browser.name,
    browserVersion: parsed.browser.version,
    os: parsed.os.name,
    osVersion: parsed.os.versionName ?? parsed.os.version,
    device: platformType,
    engine: parsed.engine?.name,
    engineVersion: parsed.engine?.version,
    platformVendor: parsed.platform.vendor,
    platformModel: parsed.platform.model,
    platformType,
  }
}
