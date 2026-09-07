import { useActiveMemberRole, useActiveOrganization } from '@/lib/authClient.js'

/**
 * The caller's role in the active organization, mirroring the server's own RBAC decision.
 *
 * The server gates every privileged route through `requirePermission` (`apps/api/src/middlewares/
 * permissions.ts`), reading `Member.role` from the same `activeOrganizationId` this hook keys
 * off. The client can therefore only *predict* the server: while the role is unknown, the caller
 * is treated as `MEMBER` (the minimum) so privileged actions stay hidden rather than visible-then-403,
 * and a `false` here is never an authorization decision — the API's preHandler remains the source
 * of truth.
 *
 * `activeOrganization` being `null` means the workspace is not resolved yet, in which case the
 * role cannot be known either and the minimum applies.
 */
export function useMyRole(): string {
  const { data: activeOrganization } = useActiveOrganization()
  const { data: memberRole } = useActiveMemberRole()

  if (!activeOrganization || !memberRole?.role) return 'MEMBER'
  return memberRole.role
}
