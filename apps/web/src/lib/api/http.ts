/**
 * Thin typed fetch wrapper around the `{ data }` / `{ error }` envelope every API route emits
 * (see `packages/contracts/src/envelope.ts`). `credentials: 'include'` sends the httpOnly
 * session cookie better-auth issues \u2014 the same reason `authClient.ts` sets it, and why this
 * app never touches `localStorage` for auth.
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
  }
}

const API_BASE_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/v1`

/** The API origin without the `/api/v1` suffix — for URLs the API hands back as absolute paths. */
export const API_ORIGIN_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    credentials: 'include',
    ...(options.body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options.body),
    }),
  })

  if (response.status === 204) return undefined as T

  const payload = (await response.json()) as { data?: T; error?: { message: string; details?: unknown } }

  if (!response.ok) {
    throw new ApiError(response.status, payload.error?.message ?? 'Request failed', payload.error?.details)
  }

  return payload.data as T
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),

  /**
   * Fetch a binary document (a payslip/invoice PDF, an export workbook) as a Blob. These
   * endpoints stream raw bytes with a `content-disposition`, so they are *not* the JSON
   * envelope — but they still need the same httpOnly session cookie, hence the identical
   * `credentials: 'include'` as every other call above. A non-2xx body carries the error
   * envelope as JSON, so it is parsed here too rather than surfacing as an opaque Blob.
   */
  async binary(path: string, query?: RequestOptions['query']): Promise<Blob> {
    const response = await fetch(buildUrl(path, query), { method: 'GET', credentials: 'include' })
    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as { error?: { message: string; details?: unknown } } | null
      throw new ApiError(response.status, payload?.error?.message ?? 'Download failed', payload?.error?.details)
    }
    return response.blob()
  },
}
