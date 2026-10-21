import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { registerExportHandlers } from '../src/modules/exports/exports.routes.js'
import { renderProjectsXlsx } from '../src/services/export.js'

describe('exports', () => {
  it('registers employees, ledger, projects, and workspace handlers', () => {
    const handlers: Record<string, Function> = {}
    const queue = {
      register: vi.fn((kind, handler) => {
        handlers[kind] = handler
      }),
    }
    const prisma = {} as PrismaClient

    registerExportHandlers(queue, prisma)

    expect(queue.register).toHaveBeenCalledWith('employees', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('ledger', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('projects', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('workspace', expect.any(Function))
  })

  it('renders projects xlsx buffer deterministically', async () => {
    const buffer = await renderProjectsXlsx([
      {
        name: 'Project Alpha',
        status: 'ACTIVE',
        department: 'Engineering',
        budget: '10000.00',
        spent: '2500.00',
        currency: 'USD',
        sprintsCount: 3,
      },
    ])

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
