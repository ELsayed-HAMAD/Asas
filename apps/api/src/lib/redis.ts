import { Redis } from 'ioredis'

/**
 * Creates an ioredis client instance.
 *
 * Configured with reasonable reconnection attempts and error handling so that
 * an unreachable Redis instance does not bring down the entire API process.
 */
export function createRedisClient(redisUrl: string, name = 'redis'): Redis {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null // Stop retrying after 10 attempts
      return Math.min(times * 100, 3000)
    },
    connectionName: name,
  })

  client.on('error', err => {
    // Suppress unhandled exception crash; log for diagnostic tracing
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(`[Redis:${name}] connection issue:`, err.message)
    }
  })

  return client
}
