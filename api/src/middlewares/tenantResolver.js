import { AppError } from '../utils/errors.js'

export function tenantResolver(request) {
  if (!request.user?.tenantId) throw new AppError(403, 'A tenant context is required')
  return request.user.tenantId
}
