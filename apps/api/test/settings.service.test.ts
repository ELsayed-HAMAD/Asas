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
  it('performs two-stage archival and compliant purge in transaction', async () => {
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      journalLine: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
      journalEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
      ledgerAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
      exchangeRate: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      member: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      tenant: { delete: vi.fn().mockResolvedValue({ id: 'tenant_1' }) },
    }
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }),
        update: vi.fn().mockResolvedValue({ id: 'tenant_1', status: 'ARCHIVED' }),
      },
      session: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      subscription: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as unknown as PrismaClient

    const { deleteWorkspace } = await import('../src/modules/settings/settings.service.js')
    const result = await deleteWorkspace(prisma, 'tenant_1', 'user_1')

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 'tenant_1' }, select: { id: true } })
    // Stage 1: Archival
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant_1' },
      data: expect.objectContaining({ status: 'ARCHIVED' }),
    })
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { activeOrganizationId: 'tenant_1' },
      data: { activeOrganizationId: null },
    })
    // Stage 2: Compliant Purge
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', status: 'ACTIVE' },
      data: { status: 'CANCELED' },
    })
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL asas.allow_tenant_purge = 'on'")
    expect(tx.journalLine.deleteMany).toHaveBeenCalledWith({ where: { entry: { tenantId: 'tenant_1' } } })
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.ledgerAccount.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.exchangeRate.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.invitation.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
    expect(tx.member.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } })
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
  it('creates a ping webhook log and decrypts credential for the tenant-scoped integration', async () => {
    const createdAt = new Date('2026-10-11T20:00:00.000Z')
    const { encryptCredential } = await import('../src/services/crypto.js')
    const encryptedKey = encryptCredential('webhook_secret_key_12345', 'tenant_1')

    const prisma = {
      integration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'integration_1',
          tenantId: 'tenant_1',
          credential: encryptedKey,
        }),
      },
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

  it('encrypts credential when creating an integration and returns masked read credential', async () => {
    const rawKey = 'test_secret_integration_token_123456789'
    let savedCredential = ''
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1' }) },
      integration: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => {
          savedCredential = data.credential
          return {
            id: 'integration_new',
            tenantId: 'tenant_1',
            name: 'GitHub CI',
            description: 'CI integration',
            status: 'CONNECTED',
            syncPullRequests: true,
            syncCiCdStatus: true,
            credential: data.credential,
            createdAt: new Date('2026-10-21T00:00:00.000Z'),
            updatedAt: new Date('2026-10-21T00:00:00.000Z'),
          }
        }),
      },
    } as unknown as PrismaClient

    const { createIntegration } = await import('../src/modules/settings/settings.service.js')
    const { isEncrypted, decryptCredential } = await import('../src/services/crypto.js')

    const res = await createIntegration(prisma, 'tenant_1', {
      name: 'GitHub CI',
      credential: rawKey,
    })

    // 1. In database, credential MUST be encrypted with v1 AES-GCM
    expect(isEncrypted(savedCredential)).toBe(true)
    expect(savedCredential).not.toBe(rawKey)
    expect(decryptCredential(savedCredential, 'tenant_1')).toBe(rawKey)

    // 2. In API response, raw credential is never returned, only masked preview
    expect(res.credential.configured).toBe(true)
    expect(res.credential.masked).toBe('test…6789')
    expect(res.credential.masked).not.toContain('secret_integration_token')
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

  it('generates a tenant-scoped structured backup bundle snapshot', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1', name: 'Acme Corp' }) },
      member: { findMany: vi.fn().mockResolvedValue([{ id: 'm_1', userId: 'u_1', role: 'OWNER', createdAt: new Date() }]) },
      department: { findMany: vi.fn().mockResolvedValue([{ id: 'd_1', name: 'Engineering' }]) },
      employee: { findMany: vi.fn().mockResolvedValue([{ id: 'e_1', name: 'Alice' }]) },
      project: { findMany: vi.fn().mockResolvedValue([]) },
      customer: { findMany: vi.fn().mockResolvedValue([]) },
      payableInvoice: { findMany: vi.fn().mockResolvedValue([]) },
      receivableInvoice: { findMany: vi.fn().mockResolvedValue([]) },
      journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
      supportTicket: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient

    const { createBackupSnapshot } = await import('../src/modules/settings/settings.service.js')
    const snapshot = await createBackupSnapshot(prisma, 'tenant_1')

    expect(snapshot.filename).toContain('backup-tenant_1-')
    expect(snapshot.sizeBytes).toBeGreaterThan(0)
    expect(snapshot.downloadUrl).toContain('/api/v1/settings/backups/snapshots/')
  })
})

