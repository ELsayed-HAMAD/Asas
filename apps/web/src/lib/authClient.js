import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

/**
 * Better Auth client, matching the `organization` plugin mounted at `/api/auth/*` in
 * apps/api (see apps/api/src/auth.ts). `baseURL` points at the API's auth prefix rather than
 * the app root, since better-auth serves everything under that one catch-all route.
 *
 * `credentials: 'include'` is required for the httpOnly session cookie to be sent cross-origin
 * (API on :4000, this app on :5173 in dev) — the single official frontend's
 * `localStorage` JWT + `Authorization` header.
 */
export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/auth`,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [organizationClient()],
})

export const {
  useSession,
  useActiveOrganization,
  useActiveMemberRole,
  useListOrganizations,
  signIn,
  signOut,
  signUp,
} = authClient
