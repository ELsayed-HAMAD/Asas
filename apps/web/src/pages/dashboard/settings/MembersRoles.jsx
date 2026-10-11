import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  UserPlus,
  Shield,
  ShieldAlert,
  User,
  Trash2,
  Mail,
  Clock,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import FormDialog from '../../../components/common/FormDialog'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import QueryState from '../../../components/common/QueryState'
import { authClient, useSession, useActiveMemberRole } from '../../../lib/authClient'
import { queryKeys } from '../../../lib/queryKeys'

export default function MembersRoles() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { data: memberRole } = useActiveMemberRole()
  const currentUserRole = memberRole?.role || 'MEMBER'
  const isOwner = currentUserRole === 'OWNER'
  const isAdmin = currentUserRole === 'ADMIN' || isOwner

  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviteError, setInviteError] = useState('')

  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [newRole, setNewRole] = useState('MEMBER')

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState(null)

  const { data: fullOrg, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.settings.members(),
    queryFn: async () => {
      const res = await authClient.organization.getFullOrganization()
      if (res?.error) throw new Error(res.error.message || 'Failed to fetch members')
      return res?.data
    },
  })

  const members = fullOrg?.members || []
  const invitations = (fullOrg?.invitations || []).filter(
    (inv) => inv.status === 'pending' || !inv.status,
  )
  const ownerCount = members.filter((m) => m.role === 'OWNER').length

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.members() })
  }

  const inviteMutation = useMutation({
    mutationFn: async () => {
      setInviteError('')
      const res = await authClient.organization.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      if (res?.error) {
        throw new Error(res.error.message || 'Failed to send invitation')
      }
      return res?.data
    },
    onSuccess: () => {
      invalidate()
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('MEMBER')
    },
    onError: (err) => {
      setInviteError(err.message)
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember) return
      const res = await authClient.organization.updateMemberRole({
        memberId: selectedMember.id,
        role: newRole,
      })
      if (res?.error) {
        throw new Error(res.error.message || 'Failed to update member role')
      }
      return res?.data
    },
    onSuccess: () => {
      invalidate()
      setRoleDialogOpen(false)
      setSelectedMember(null)
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async () => {
      if (!memberToRemove) return
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: memberToRemove.id,
      })
      if (res?.error) {
        throw new Error(res.error.message || 'Failed to remove member')
      }
      return res?.data
    },
    onSuccess: () => {
      invalidate()
      setRemoveDialogOpen(false)
      setMemberToRemove(null)
    },
  })

  const cancelInviteMutation = useMutation({
    mutationFn: async (invitationId) => {
      const res = await authClient.organization.cancelInvitation({
        invitationId,
      })
      if (res?.error) {
        throw new Error(res.error.message || 'Failed to cancel invitation')
      }
      return res?.data
    },
    onSuccess: () => {
      invalidate()
    },
  })

  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const name = (m.user?.name || '').toLowerCase()
    const email = (m.user?.email || '').toLowerCase()
    const role = (m.role || '').toLowerCase()
    return name.includes(q) || email.includes(q) || role.includes(q)
  })

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="pl-9 pr-3 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-heading"
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setInviteError('')
                setInviteEmail('')
                setInviteRole('MEMBER')
                setInviteOpen(true)
              }}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap"
            >
              <UserPlus size={15} />
              Invite Member
            </button>
          )}
        </div>
      </TopBarActions>

      <SettingsTabs />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Members List & Pending Invites */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            isEmpty={members.length === 0}
            emptyTitle="No members found"
            emptyDescription="There are no members in this workspace yet."
          >
            {/* Members Section */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden">
              <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-heading">Workspace Members</h2>
                  <p className="text-xs text-body-light mt-0.5">
                    People with active access to this workspace.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-surface-muted text-muted rounded-full">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              <div className="divide-y divide-border-subtle">
                {filteredMembers.map((member) => {
                  const isSelf = member.userId === session?.user?.id
                  const isMemberOwner = member.role === 'OWNER'
                  const isOnlyOwner = isMemberOwner && ownerCount <= 1
                  const initials = (member.user?.name || member.user?.email || 'U')
                    .slice(0, 2)
                    .toUpperCase()

                  return (
                    <div
                      key={member.id}
                      className="p-5 flex items-center justify-between hover:bg-surface-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {member.user?.image ? (
                          <img
                            src={member.user.image}
                            alt={member.user.name || 'Avatar'}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-border-default"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-sm">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-heading truncate">
                              {member.user?.name || 'Unnamed User'}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-muted text-muted border border-border-default">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-body-light truncate">{member.user?.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 flex-shrink-0">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            member.role === 'OWNER'
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : member.role === 'ADMIN'
                              ? 'bg-accent/15 text-accent border border-accent/20'
                              : 'bg-surface-muted text-muted border border-border-default'
                          }`}
                        >
                          {member.role}
                        </span>

                        <span className="text-xs text-caption w-28 text-right hidden sm:inline-block">
                          {member.createdAt
                            ? new Date(member.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>

                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMember(member)
                                setNewRole(member.role)
                                setRoleDialogOpen(true)
                              }}
                              disabled={isOnlyOwner}
                              title={
                                isOnlyOwner
                                  ? 'Cannot change role of the only owner'
                                  : 'Change member role'
                              }
                              className="text-xs font-medium text-body-light hover:text-heading px-2.5 py-1 rounded border border-border-default bg-surface hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Edit Role
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setMemberToRemove(member)
                                setRemoveDialogOpen(true)
                              }}
                              disabled={isOnlyOwner}
                              title={
                                isOnlyOwner
                                  ? 'Cannot remove the only owner'
                                  : 'Remove member from workspace'
                              }
                              className="text-muted hover:text-danger-hover p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pending Invitations Section */}
            {invitations.length > 0 && (
              <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden">
                <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-muted" />
                    <div>
                      <h2 className="text-base font-bold text-heading">Pending Invitations</h2>
                      <p className="text-xs text-body-light mt-0.5">
                        Invitations waiting to be accepted.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-surface-muted text-muted rounded-full">
                    {invitations.length} pending
                  </span>
                </div>

                <div className="divide-y divide-border-subtle">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-4 flex items-center justify-between hover:bg-surface-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-muted text-muted flex items-center justify-center">
                          <Mail size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-heading">{inv.email}</p>
                          <p className="text-xs text-caption">
                            Role: <span className="font-medium text-body">{inv.role}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-xs text-caption flex items-center gap-1">
                          <Clock size={12} />
                          Pending
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => cancelInviteMutation.mutate(inv.id)}
                            disabled={cancelInviteMutation.isPending}
                            className="text-xs font-medium text-danger-hover hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </QueryState>
        </div>

        {/* Right: Roles Overview Reference */}
        <div className="w-[340px] bg-surface-muted border-l border-border-default p-8 flex flex-col flex-shrink-0 space-y-6">
          <div>
            <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-4">
              Roles & Permissions
            </h3>
            <p className="text-xs text-body-light leading-relaxed mb-6">
              Asas provides three distinct permission levels to maintain separation of duties across
              departments and financial records.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldAlert size={16} className="text-primary" />
                <h4 className="text-sm font-bold text-heading">Owner</h4>
              </div>
              <p className="text-xs text-body-light leading-relaxed">
                Full authority across the organization, including billing configuration, destructive actions,
                and ownership transfers.
              </p>
            </div>

            <div className="bg-surface-raised border border-border-default rounded-card-sm p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield size={16} className="text-accent" />
                <h4 className="text-sm font-bold text-heading">Admin</h4>
              </div>
              <p className="text-xs text-body-light leading-relaxed">
                Manages workspace members, general settings, and operational writes across HR,
                Finance, CRM, Projects, and Inventory.
              </p>
            </div>

            <div className="bg-surface-raised border border-border-default rounded-card-sm p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1.5">
                <User size={16} className="text-muted" />
                <h4 className="text-sm font-bold text-heading">Member</h4>
              </div>
              <p className="text-xs text-body-light leading-relaxed">
                Standard access to participate in projects, view assigned modules, submit timesheets,
                and log activity without administrative privileges.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      <FormDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite New Member"
        subtitle="Send an invitation link by email to join this workspace."
        confirmLabel={inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
        isConfirmDisabled={!inviteEmail.trim() || inviteMutation.isPending}
        onConfirm={() => inviteMutation.mutate()}
        error={inviteError}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full border border-border-default rounded-input px-3 py-2 text-sm bg-surface-muted text-heading focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full border border-border-default rounded-input px-3 py-2 text-sm bg-surface-muted text-heading focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="MEMBER">Member (Standard Access)</option>
              <option value="ADMIN">Admin (Full Operational Access)</option>
              {isOwner && <option value="OWNER">Owner (Full Authority)</option>}
            </select>
          </div>
        </div>
      </FormDialog>

      {/* Change Role Modal */}
      <FormDialog
        open={roleDialogOpen}
        onClose={() => {
          setRoleDialogOpen(false)
          setSelectedMember(null)
        }}
        title="Change Member Role"
        subtitle={`Update role for ${selectedMember?.user?.name || selectedMember?.user?.email || 'this member'}.`}
        confirmLabel={updateRoleMutation.isPending ? 'Updating...' : 'Update Role'}
        isConfirmDisabled={
          newRole === selectedMember?.role || updateRoleMutation.isPending
        }
        onConfirm={() => updateRoleMutation.mutate()}
        error={updateRoleMutation.error?.message}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Select Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full border border-border-default rounded-input px-3 py-2 text-sm bg-surface-muted text-heading focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              {isOwner && <option value="OWNER">Owner</option>}
            </select>
          </div>
          {selectedMember?.role === 'OWNER' && ownerCount <= 1 && (
            <p className="text-xs text-danger">
              This is currently the only Owner in the workspace. Promote another member to Owner
              before changing this role.
            </p>
          )}
        </div>
      </FormDialog>

      {/* Remove Member Confirmation Dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onClose={() => {
          setRemoveDialogOpen(false)
          setMemberToRemove(null)
        }}
        onConfirm={() => removeMemberMutation.mutate()}
        title="Remove Member?"
        description={`Are you sure you want to remove ${
          memberToRemove?.user?.name || memberToRemove?.user?.email || 'this member'
        } from the workspace? They will immediately lose access.`}
        confirmLabel="Remove Member"
        busy={removeMemberMutation.isPending}
        danger
      />
    </div>
  )
}
