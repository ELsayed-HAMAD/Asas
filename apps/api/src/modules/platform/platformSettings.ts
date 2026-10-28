import type { PrismaClient } from '@prisma/client'

/**
 * Global platform switches. These are intentionally small and enforced at a few central
 * points (request hook, signup hook, export creation) rather than sprinkled through modules.
 */
export const PLATFORM_FLAG_KEYS = {
  maintenance: 'maintenance_mode',
  signups: 'signups_enabled',
  exports: 'exports_enabled',
} as const

export type PlatformFlagKey = (typeof PLATFORM_FLAG_KEYS)[keyof typeof PLATFORM_FLAG_KEYS]

export interface PlatformFlags {
  maintenanceMode: boolean
  signupsEnabled: boolean
  exportsEnabled: boolean
  updatedAt: string | null
}

const DEFAULT_FLAGS: PlatformFlags = {
  maintenanceMode: false,
  signupsEnabled: true,
  exportsEnabled: true,
  updatedAt: null,
}

const CACHE_TTL_MS = 10_000
let cache: { value: PlatformFlags; expiresAt: number } | null = null

function flagValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Read the global switches, failing open to defaults if the platform tables are unavailable. */
export async function getPlatformFlags(prisma: PrismaClient): Promise<PlatformFlags> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  try {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: Object.values(PLATFORM_FLAG_KEYS) } },
      select: { key: true, value: true, updatedAt: true },
    })
    const byKey = new Map(rows.map(row => [row.key, row]))
    const latest = rows.reduce<Date | null>((current, row) => {
      if (!current || row.updatedAt > current) return row.updatedAt
      return current
    }, null)
    const value: PlatformFlags = {
      maintenanceMode: flagValue(byKey.get(PLATFORM_FLAG_KEYS.maintenance)?.value, DEFAULT_FLAGS.maintenanceMode),
      signupsEnabled: flagValue(byKey.get(PLATFORM_FLAG_KEYS.signups)?.value, DEFAULT_FLAGS.signupsEnabled),
      exportsEnabled: flagValue(byKey.get(PLATFORM_FLAG_KEYS.exports)?.value, DEFAULT_FLAGS.exportsEnabled),
      updatedAt: latest?.toISOString() ?? null,
    }
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
    return value
  } catch {
    // Fail open: a settings outage must not lock every workspace out of the product.
    return DEFAULT_FLAGS
  }
}

/** Drop the process-local cache after an admin update. */
export function invalidatePlatformFlagsCache(): void {
  cache = null
}

export async function setPlatformFlag(
  prisma: PrismaClient,
  key: PlatformFlagKey,
  enabled: boolean,
  updatedById: string,
): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: enabled, updatedById },
    update: { value: enabled, updatedById },
  })
  invalidatePlatformFlagsCache()
}

export function platformFlagLabel(key: PlatformFlagKey): string {
  if (key === PLATFORM_FLAG_KEYS.maintenance) return 'maintenance mode'
  if (key === PLATFORM_FLAG_KEYS.signups) return 'new signups'
  return 'exports'
}
