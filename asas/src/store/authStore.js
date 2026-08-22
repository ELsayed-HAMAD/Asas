import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (user, token) => set({ user, token }),
      updateUser: (user) => set({ user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    {
      name: 'asas-auth', // unique name
      // We only persist the token, or we can persist both. 
      // If we persist user, it acts as a cache until /me updates it.
      // But it's usually safer to persist both so the UI doesn't flash.
    }
  )
)
