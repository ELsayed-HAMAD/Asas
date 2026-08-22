import api from '../lib/axios';

const unwrap = response => response.data;

export const dashboardService = {
  getOverview: async () => {
    const res = await api.get('/dashboard/overview');
    return unwrap(res);
  }
};
