import { http } from './http'

export const authApi = {
  getProviders: () => http.get('/auth/providers'),
  devSocialLogin: (body) => http.post('/auth/dev-social-login', { body }),
}

