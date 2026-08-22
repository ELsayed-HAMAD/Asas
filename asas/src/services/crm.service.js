import api from '../lib/axios';

export const crmService = {
  getOverview: async () => {
    const { data } = await api.get('/crm/overview');
    return data.data;
  },

  listDeals: async () => {
    const { data } = await api.get('/crm/deals');
    return data.data;
  },

  getForecast: async () => {
    const { data } = await api.get('/crm/forecast');
    return data.data;
  },

  getSalesPerformance: async () => {
    const { data } = await api.get('/crm/sales-performance');
    return data.data;
  }
};
