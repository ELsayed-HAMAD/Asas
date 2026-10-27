import { createAuthClient } from 'better-auth/react'
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins'

/**
 * Better Auth client, matching the `organization` plugin mounted at `/api/auth/*` in
 * apps/api (see apps/api/src/auth.ts). `baseURL` points at the API's auth prefix rather than
 * the app root, since better-auth serves everything under that one catch-all route.
 *
 * `credentials: 'include'` is required for the httpOnly session cookie to be sent cross-origin
 * (API on :4000, this app on :5173 in dev).
 */
export const authClient = createAuthClient({
  // Production builds use the same nginx origin and proxy `/api` to the API service. The
  // development default keeps the API on :4000.
  baseURL: import.meta.env.VITE_API_URL?.trim()
    || (import.meta.env.DEV ? 'http://127.0.0.1:4000' : window.location.origin),
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    organizationClient(),
    twoFactorClient({ twoFactorPage: '/two-factor' }),
  ],
})

export const {
  useSession,
  useActiveOrganization,
  useActiveMemberRole,
  useListOrganizations,
  signIn,
  signOut,
  signUp,
  twoFactor,
} = authClient
