import { AppError } from '../utils/errors.js'

export async function authenticate(request) {
  try {
    await request.jwtVerify()
  } catch {
    throw new AppError(401, 'Authentication is required')
  }
}
