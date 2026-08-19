import * as controller from './auth.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
export async function authRoutes(app) {
  app.post('/register', controller.register)
  app.post('/login', controller.login)
  app.get('/me', { preHandler: authenticate }, controller.me)
}
