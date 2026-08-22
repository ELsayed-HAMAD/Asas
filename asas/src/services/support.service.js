import api from '../lib/axios';

const unwrap = response => response.data;

export const supportService = {
  getTickets: async () => {
    const res = await api.get('/support/tickets');
    return unwrap(res);
  }
};
