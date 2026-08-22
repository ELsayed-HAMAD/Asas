import api from '../lib/axios';

const unwrap = response => response.data;

export const projectsService = {
  getPortfolio: async () => {
    const res = await api.get('/projects/portfolio');
    return unwrap(res);
  },
  
  getSprints: async () => {
    const res = await api.get('/projects/sprints');
    return unwrap(res);
  },
  
  getRoadmap: async () => {
    const res = await api.get('/projects/roadmap');
    return unwrap(res);
  }
};
