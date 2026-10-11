import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { getIntegrationWebhookLogs } from '../src/modules/settings/settings.service.js'

describe('getIntegrationWebhookLogs', () => {
  it('returns recent logs only after tenant-scoped integration lookup', async () => {
    const createdAt = new Date('2026-10-04T12:00:00.000Z')
    const prisma = {
      integration: { findFirst: vi.fn().mockResolvedValue({ id: 'integration_1' }) },
      webhookLog: { findMany: vi.fn().mockResolvedValue([{ id: 'log_1', statusCode: 204, event: 'push', createdAt }]) },
    } as unknown as PrismaClient
    const result = await getIntegrationWebhookLogs(prisma, 'tenant_1', 'integration_1')
    expect(prisma.integration.findFirst).toHaveBeenCalledWith({ where: { id: 'integration_1', tenantId: 'tenant_1' }, select: { id: true } })
    expect(prisma.webhookLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { integrationId: 'integration_1', integration: { tenantId: 'tenant_1' } }, take: 50 }))
    expect(result.items[0]).toEqual({ id: 'log_1', statusCode: 204, event: 'push', createdAt: createdAt.toISOString() })
  })

  it('does not query logs for an integration owned by another tenant', async () => {
    const prisma = {
      integration: { findFirst: vi.fn().mockResolvedValue(null) },
      webhookLog: { findMany: vi.fn() },
    } as unknown as PrismaClient
    await expect(getIntegrationWebhookLogs(prisma, 'tenant_1', 'integration_other')).rejects.toThrow('Integration not found')
    expect(prisma.webhookLog.findMany).not.toHaveBeenCalled()
  })
})

describe('updateTenantSettings', () => {
  it('updates workspace logoUrl and general profile within tenant boundary', async () => {
    const now = new Date('2026-10-11T12:00:00.000Z')
    const existing = {
      name: 'Old Name',
      slug: 'old-slug',
      supportEmail: null,
      logoUrl: null,
      timezone: 'UTC',
      currency: 'USD',
      currencyLockedAt: null,
      dateFormat: 'MMM d, yyyy',
      overtimeThresholdHours: 8,
      createdAt: now,
      updatedAt: now,
    }
    const updated = {
      ...existing,
      name: 'New Name',
      logoUrl: 'https://example.com/logo.png',
      updatedAt: now,
    }
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'tenant_1' }]),
      tenant: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    } as unknown as PrismaClient

    const { updateTenantSettings } = await import('../src/modules/settings/settings.service.js')
    const result = await updateTenantSettings(prisma, 'tenant_1', {
      name: 'New Name',
      logoUrl: 'https://example.com/logo.png',
    })

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant_1' },
      data: expect.objectContaining({
        name: 'New Name',
        logoUrl: 'https://example.com/logo.png',
      }),
      select: expect.any(Object),
    })
    expect(result.logoUrl).toBe('https://example.com/logo.png')
    expect(result.name).toBe('New Name')
  })
})

