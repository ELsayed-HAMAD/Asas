import api from '../lib/axios'

export const dashboardService = {
  overview: () => api.get('/dashboard/overview').then(response => response.data.data),
  createDemoData: () => api.post('/dashboard/demo-data').then(response => response.data.data),
  getMockData: (component) => api.get(`/dashboard/mock/${component}`).then(response => response.data.data),
}
