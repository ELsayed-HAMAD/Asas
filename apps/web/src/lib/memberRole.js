/** Normalize Better Auth's role string or { role } result for consistent permission checks. */
export function getMemberRoleName(activeMemberRole) {
  const role = typeof activeMemberRole === 'string' ? activeMemberRole : activeMemberRole?.role
  return typeof role === 'string' ? role.toUpperCase() : ''
}
