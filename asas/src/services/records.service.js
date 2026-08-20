import api from '../lib/axios'
const unwrap = response => response.data.data
export const recordsService = {
  list: (module, params) => api.get(`/${module}`, { params }).then(unwrap),
  create: (module, payload) => api.post(`/${module}`, payload).then(unwrap),
  update: (module, id, payload) => api.patch(`/${module}/${id}`, payload).then(unwrap),
  remove: (module, id) => api.delete(`/${module}/${id}`),
}
