import api from '../lib/axios';

const unwrap = response => response.data;

export const inventoryService = {
  listProducts: async () => {
    const res = await api.get('/inventory/products');
    return unwrap(res);
  },
  
  getProduct: async (id) => {
    const res = await api.get(`/inventory/products/${id}`);
    return unwrap(res);
  },
  
  createProduct: async (data) => {
    const res = await api.post('/inventory/products', data);
    return unwrap(res);
  },
  
  updateProduct: async (id, data) => {
    const res = await api.put(`/inventory/products/${id}`, data);
    return unwrap(res);
  },
  
  deleteProduct: async (id) => {
    const res = await api.delete(`/inventory/products/${id}`);
    return unwrap(res);
  }
};
