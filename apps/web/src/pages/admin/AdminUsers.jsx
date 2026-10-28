import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MailCheck, MailX, ShieldCheck, Users } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { SearchInput } from '../../components/common/SearchInput'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
} from '../../components/admin/ui'

function dateLabel(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function AccessIcons({ user }) {
  return (
    <div className="flex items-center gap-1.5">
      {user.emailVerified
        ? <MailCheck size={14} className="text-emerald-600" aria-label="Email verified" />
        : <MailX size={14} className="text-amber-600" aria-label="Email unverified" />}
      <ShieldCheck size={14} className={user.twoFactorEnabled ? 'text-emerald-600' : 'text-slate-300'} aria-label={user.twoFactorEnabled ? 'Two-factor enabled' : 'Two-factor disabled'} />
    </div>
  )
}

export default function AdminUsers() {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [verified, setVerified] = useState('ALL')
  const [twoFactor, setTwoFactor] = useState('ALL')
  const [page, setPage] = useState(1)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeError, setRevokeError] = useState('')

  const listQuery = useQuery({
    queryKey: ['platform', 'users', { search, verified, twoFactor, page }],
    queryFn: () => platformApi.users({ search: search || undefined, verified, twoFactor, page, limit: 25 }),
    placeholderData: keepPreviousData,
  })
  const detailQuery = useQuery({
    queryKey: ['platform', 'user', selectedUserId],
    queryFn: () => platformApi.user(selectedUserId),
    enabled: Boolean(selectedUserId),
  })
  const revokeMutation = useMutation({
    mutationFn: () => platformApi.revokeUserSessions(selectedUserId),
    onSuccess: async () => {
      setRevokeOpen(false)
      setRevokeError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform', 'user', selectedUserId] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] }),
      ])
    },
    onError: error => setRevokeError(error?.message || 'The sessions could not be revoked.'),
  })

  const data = listQuery.data
  const selectedUser = detailQuery.data?.user

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Users"
        description="Search every account on the platform, inspect workspace memberships, and revoke sessions when access needs to be reset."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1 sm:max-w-sm">
          <SearchInput
            value={searchInput}
            onChange={event => { setSearchInput(event.target.value); setPage(1) }}
            placeholder="Search by name or email..."
            wrapperClassName="w-full"
          />
        </div>
        <Select value={verified} onValueChange={value => { setVerified(value); setPage(1) }}>
          <SelectTrigger className="h-9 w-[150px] bg-white/60 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All emails</SelectItem>
            <SelectItem value="VERIFIED">Verified</SelectItem>
            <SelectItem value="UNVERIFIED">Unverified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={twoFactor} onValueChange={value => { setTwoFactor(value); setPage(1) }}>
          <SelectTrigger className="h-9 w-[170px] bg-white/60 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any 2FA status</SelectItem>
            <SelectItem value="ENABLED">2FA enabled</SelectItem>
            <SelectItem value="DISABLED">2FA disabled</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted">
            <span><strong className="text-heading">{data.summary.total}</strong> total</span>
            <span><strong className="text-amber-700">{data.summary.unverified}</strong> unverified</span>
            <span><strong className="text-emerald-700">{data.summary.withTwoFactor}</strong> with 2FA</span>
          </div>
        )}
      </div>

      {listQuery.isLoading && <AdminLoading label="Loading users..." />}
      {listQuery.isError && <AdminError message={listQuery.error?.message} onRetry={() => listQuery.refetch()} />}
      {data && (
        <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          {data.items.length === 0 ? (
            <div className="p-4">
              <AdminEmptyState icon={Users} title="No users match these filters" description="Clear the search or choose a broader filter." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Access</th>
                      <th className="px-4 py-3">Workspaces</th>
                      <th className="px-4 py-3">Platform role</th>
                      <th className="px-4 py-3">Last session</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.items.map(user => (
                      <tr
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className="cursor-pointer transition-colors hover:bg-white/70"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-heading">{user.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{user.email}</p>
                        </td>
                        <td className="px-4 py-3"><AccessIcons user={user} /></td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[260px] flex-wrap gap-1">
                            {user.memberships.slice(0, 3).map(member => (
                              <span key={member.tenantId} className="rounded-full border border-border-default bg-white/60 px-2 py-0.5 text-[10px] text-body">
                                {member.tenantName} · {member.role}
                              </span>
                            ))}
                            {user.memberships.length > 3 && <span className="text-[10px] text-muted">+{user.memberships.length - 3} more</span>}
                            {user.memberships.length === 0 && <span className="text-[10px] text-muted">No workspace</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><AdminStatusBadge status={user.platformRole} /></td>
                        <td className="px-4 py-3 text-muted">{dateLabel(user.lastSessionAt)}</td>
                        <td className="px-4 py-3 text-muted">{dateLabel(user.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPagination pagination={data.pagination} onPage={setPage} busy={listQuery.isFetching} />
            </>
          )}
        </div>
      )}

      <Dialog open={Boolean(selectedUserId)} onOpenChange={open => { if (!open) setSelectedUserId(null) }}>
        <DialogContent className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/80 bg-white p-0">
          <DialogHeader className="border-b border-border-subtle px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold text-heading">{selectedUser?.name || 'User detail'}</DialogTitle>
            <DialogDescription className="text-xs text-muted">{selectedUser?.email || 'Loading account...'}</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading && <div className="p-6"><AdminLoading label="Loading user..." /></div>}
          {detailQuery.isError && <div className="p-6"><AdminError message={detailQuery.error?.message} onRetry={() => detailQuery.refetch()} /></div>}
          {detailQuery.data && (
            <div className="space-y-5 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <AccessIcons user={detailQuery.data.user} />
                <AdminStatusBadge status={detailQuery.data.user.platformRole} />
                <span className="text-[11px] text-muted">Joined {dateLabel(detailQuery.data.user.createdAt)}</span>
              </div>

              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">Workspace memberships</h3>
                <div className="mt-2 space-y-1.5">
                  {detailQuery.data.user.memberships.map(member => (
                    <div key={member.tenantId} className="flex items-center justify-between rounded-xl border border-border-default bg-surface-muted/40 px-3 py-2 text-xs">
                      <span className="font-medium text-heading">{member.tenantName}</span>
                      <AdminStatusBadge status={member.role} />
                    </div>
                  ))}
                  {detailQuery.data.user.memberships.length === 0 && <p className="text-xs text-muted">This account is not a member of any workspace.</p>}
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">Active sessions</h3>
                <div className="mt-2 space-y-1.5">
                  {detailQuery.data.sessions.map(session => (
                    <div key={session.id} className="rounded-xl border border-border-default bg-surface-muted/40 px-3 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-heading">{session.ipAddress || 'IP not recorded'}</span>
                        <span className="text-muted">Expires {dateLabel(session.expiresAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-muted">{session.userAgent || 'User agent not recorded'}</p>
                    </div>
                  ))}
                  {detailQuery.data.sessions.length === 0 && <p className="text-xs text-muted">No active sessions found.</p>}
                </div>
              </section>

              <Button
                type="button"
                variant="destructive"
                className="w-full rounded-xl"
                onClick={() => { setRevokeError(''); setRevokeOpen(true) }}
                disabled={detailQuery.data.sessions.length === 0}
              >
                <KeyRound size={14} /> Revoke all sessions
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeOpen}
        onClose={() => { setRevokeOpen(false); setRevokeError('') }}
        title="Revoke all sessions"
        description={`Sign out ${selectedUser?.email || 'this user'} everywhere. They can sign in again with valid credentials.`}
        confirmLabel="Revoke sessions"
        danger
        busy={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
        error={revokeError || undefined}
      />
    </div>
  )
}
