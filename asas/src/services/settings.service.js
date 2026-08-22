import api from '../lib/axios';

const unwrap = response => response.data;

export const settingsService = {
  getGeneral: async () => {
    const res = await api.get('/settings/general');
    return unwrap(res);
  },
  
  updateGeneral: async (data) => {
    const res = await api.put('/settings/general', data);
    return unwrap(res);
  },

  getBilling: async () => {
    const res = await api.get('/settings/billing');
    return unwrap(res);
  },

  getIntegrations: async () => {
    const res = await api.get('/settings/integrations');
    return unwrap(res);
  },

  getNotifications: async () => {
    const res = await api.get('/settings/notifications');
    return unwrap(res);
  },

  getExport: async () => {
    const res = await api.get('/settings/export');
    return unwrap(res);
  }
};
