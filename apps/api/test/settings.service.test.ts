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

describe('getBillingSettings', () => {
  it('returns subscription usage with dynamic member count', async () => {
    const prisma = {
      subscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sub_1',
            planName: 'Pro Tier',
            priceMonthly: 499,
            status: 'ACTIVE',
            renewsOn: new Date('2026-11-01T00:00:00.000Z'),
            seatsUsed: 1,
            seatLimit: 50,
            storageUsedGb: 5,
            storageLimitGb: 100,
          },
        ]),
      },
      paymentMethod: { findMany: vi.fn().mockResolvedValue([]) },
      billingInvoice: { findMany: vi.fn().mockResolvedValue([]) },
      member: { count: vi.fn().mockResolvedValue(12) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ stripeCustomerId: null }) },
    } as unknown as PrismaClient

    const { getBillingSettings } = await import('../src/modules/settings/settings.service.js')
    const result = await getBillingSettings(prisma, 'tenant_1')

    expect(prisma.member.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(result.subscriptions[0].seatsUsed).toBe(12)
    expect(result.subscriptions[0].seatLimit).toBe(50)
    expect(result.stripePortalAvailable).toBe(false)
    expect(result.subscriptions[0].storageUsedGb).toBeNull()
    const measured = await getBillingSettings(prisma, 'tenant_1', 0.125)
    expect(measured.subscriptions[0].storageUsedGb).toBe(0.125)
  })
})

describe('deleteWorkspace', () => {
  it('cleans up restricted financial records and deletes tenant in transaction', async () => {
    const tx = {
      journalLine: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
      journalEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
      ledgerAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
      exchangeRate: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      member: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      session: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      tenant: { delete: vi.fn().mockResolvedValue({ id: 'tenant_1' }) },
    }
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as unknown as PrismaClient

    const { deleteWorkspace } = await import('../src/modules/settings/settings.service.js')
    const result = await deleteWorkspace(prisma, 'tenant_1', 'user_1')

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 'tenant_1' }, select: { id: true } })
    expect(tx.journalLine.deleteMany).toHaveBeenCalledWith({ where: { entry: { tenantId: 'tenant_1' } } })
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.ledgerAccount.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.exchangeRate.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.invitation.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.member.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { activeOrganizationId: 'tenant_1' },
      data: { activeOrganizationId: null },
    })
    expect(tx.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant_1' } })
    expect(result).toEqual({ success: true })
  })

  it('rejects deletion for non-existent workspace', async () => {
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaClient

    const { deleteWorkspace } = await import('../src/modules/settings/settings.service.js')
    await expect(deleteWorkspace(prisma, 'tenant_nonexistent', 'user_1')).rejects.toThrow('Workspace not found')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('testIntegration', () => {
  it('creates a ping webhook log for the tenant-scoped integration', async () => {
    const createdAt = new Date('2026-10-11T20:00:00.000Z')
    const prisma = {
      integration: { findFirst: vi.fn().mockResolvedValue({ id: 'integration_1' }) },
      webhookLog: {
        create: vi.fn().mockResolvedValue({
          id: 'log_new',
          statusCode: 200,
          event: 'ping',
          createdAt,
        }),
      },
    } as unknown as PrismaClient

    const { testIntegration } = await import('../src/modules/settings/settings.service.js')
    const result = await testIntegration(prisma, 'tenant_1', 'integration_1')

    expect(prisma.integration.findFirst).toHaveBeenCalledWith({ where: { id: 'integration_1', tenantId: 'tenant_1' } })
    expect(prisma.webhookLog.create).toHaveBeenCalledWith({
      data: {
        integrationId: 'integration_1',
        statusCode: 200,
        event: 'ping',
      },
    })
    expect(result.success).toBe(true)
    expect(result.log).toEqual({
      id: 'log_new',
      statusCode: 200,
      event: 'ping',
      createdAt: createdAt.toISOString(),
    })
  })

  it('rejects test ping for non-existent integration', async () => {
    const prisma = {
      integration: { findFirst: vi.fn().mockResolvedValue(null) },
      webhookLog: { create: vi.fn() },
    } as unknown as PrismaClient

    const { testIntegration } = await import('../src/modules/settings/settings.service.js')
    await expect(testIntegration(prisma, 'tenant_1', 'integration_missing')).rejects.toThrow('Integration not found')
    expect(prisma.webhookLog.create).not.toHaveBeenCalled()
  })
})

