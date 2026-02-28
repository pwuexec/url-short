import type { HonoRequest } from 'hono'

export function getClientIp(req: HonoRequest): string {
  return req.header('cf-connecting-ip') ?? req.header('x-forwarded-for') ?? 'unknown'
}

export function parseVisitIndex(raw: string | undefined, max: number): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value >= max) return undefined
  return value
}
