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

export type User = { id: string; email: string; name: string; picture?: string; createdAt: string; isAdmin?: boolean }

export type Session = { userId: string; expiresAt: string }

export type HonoEnv = { Bindings: CloudflareBindings; Variables: { user: User | null } }
