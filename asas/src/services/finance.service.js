import api from '../lib/axios'

export const financeService = {
  getOverview: async () => {
    const { data } = await api.get('/finance/overview')
    return data.data
  },
  
  listPayables: async () => {
    const { data } = await api.get('/finance/payables')
    return data.data
  },
  
  listReceivables: async () => {
    const { data } = await api.get('/finance/receivables')
    return data.data
  },
  
  listExpenses: async () => {
    const { data } = await api.get('/finance/expenses')
    return data.data
  }
}
