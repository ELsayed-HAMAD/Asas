import api from '../lib/axios'

const unwrap = response => response.data.data

export const authService = {
  register: payload => api.post('/auth/register', payload).then(unwrap),
  login: payload => api.post('/auth/login', payload).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
}
