export function parsePagination(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
  return { page, limit, skip: (page - 1) * limit }
}
