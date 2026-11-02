import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { connectWithRetry } from '../src/plugins/prisma.js'

function fakeClient(errors: unknown[]): { client: PrismaClient; connect: ReturnType<typeof vi.fn> } {
  const connect = vi.fn(async () => {
    const next = errors.shift()
    if (next) throw next
  })
  return { client: { $connect: connect } as unknown as PrismaClient, connect }
}

const withCode = (errorCode: string) => Object.assign(new Error(errorCode), { errorCode })

describe('connectWithRetry', () => {
  it('retries a waking database and connects', async () => {
    const { client, connect } = fakeClient([withCode('P1001'), withCode('P1001')])

    await connectWithRetry(client)

    expect(connect).toHaveBeenCalledTimes(3)
  })

  it('gives up after the attempt limit', async () => {
    const { client, connect } = fakeClient([withCode('P1001'), withCode('P1001'), withCode('P1001')])

    await expect(connectWithRetry(client)).rejects.toMatchObject({ errorCode: 'P1001' })
    expect(connect).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-connection error', async () => {
    const { client, connect } = fakeClient([withCode('P2025')])

    await expect(connectWithRetry(client)).rejects.toMatchObject({ errorCode: 'P2025' })
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
