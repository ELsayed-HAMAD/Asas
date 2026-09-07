import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, http } from './http.js'

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('http', () => {
  it('unwraps the {data} envelope on success', async () => {
    mockFetchOnce(200, { data: { id: 'emp_1', name: 'Ada Lovelace' } })
    const result = await http.get<{ id: string; name: string }>('/hr/employees/emp_1')
    expect(result).toEqual({ id: 'emp_1', name: 'Ada Lovelace' })
  })

  it('sends credentials and query parameters', async () => {
    const fetchMock = mockFetchOnce(200, { data: { items: [] } })
    await http.get('/hr/employees', { query: { search: 'ada', page: 1, departmentId: undefined } })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/hr/employees?')
    expect(url).toContain('search=ada')
    expect(url).toContain('page=1')
    expect(url).not.toContain('departmentId')
    expect(init?.credentials).toBe('include')
  })

  it('serializes a JSON body with the right content-type', async () => {
    const fetchMock = mockFetchOnce(201, { data: { id: 'emp_2' } })
    await http.post('/hr/employees', { body: { name: 'New Hire', title: 'Engineer' } })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.body).toBe(JSON.stringify({ name: 'New Hire', title: 'Engineer' }))
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('throws an ApiError with the server message on a non-2xx response', async () => {
    mockFetchOnce(403, { error: { message: "Requires the 'ADMIN' role or higher" } })
    await expect(http.get('/hr/employees')).rejects.toMatchObject({
      statusCode: 403,
      message: "Requires the 'ADMIN' role or higher",
    })
    await expect(http.get('/hr/employees')).rejects.toBeInstanceOf(ApiError)
  })

  it('returns undefined for a 204 without attempting to parse a body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await http.delete('/hr/employees/emp_1')
    expect(result).toBeUndefined()
  })
})
