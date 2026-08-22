import api from '../lib/axios'

const unwrap = response => response.data.data

export const onboardingService = {
  status: () => api.get('/onboarding/status').then(unwrap),
  markEmpty: () => api.post('/onboarding/empty').then(unwrap),
  applySample: () => api.post('/onboarding/sample').then(unwrap),
  importEmployees: payload => api.post('/onboarding/import', payload).then(unwrap),
}
