import { http } from './http'

export const supportApi = {
  listTickets: () => http.get('/support/tickets'),
  createTicket: (body) => http.post('/support/tickets', { body }),
  updateTicket: (id, body) => http.patch(`/support/tickets/${id}`, { body }),
}