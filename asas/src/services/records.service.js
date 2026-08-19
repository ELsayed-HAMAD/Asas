import api from '../lib/axios'
const unwrap = response => response.data.data
export const recordsService = {
  list: module => api.get(`/${module}`).then(unwrap),
  create: (module, payload) => api.post(`/${module}`, payload).then(unwrap),
  remove: (module, id) => api.delete(`/${module}/${id}`),
}
