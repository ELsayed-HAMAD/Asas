import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  Shield,
  ShieldAlert,
  User,
  Trash2,
  Mail,
  Clock,
  Copy,
  Check,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import FormDialog from '../../../components/common/FormDialog'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import QueryState from '../../../components/common/QueryState'
import SearchInput from '../../../components/common/SearchInput'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { authClient, useSession, useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { queryKeys } from '../../../lib/queryKeys'

export default function MembersRoles() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { data: memberRole } = useActiveMemberRole()
  const currentUserRole = getMemberRoleName(memberRole) || 'MEMBER'
  const isOwner = currentUserRole === 'OWNER'
  const isAdmin = currentUserRole === 'ADMIN' || isOwner

  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviteError, setInviteError] = useState('')
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const [clipboardError, setClipboardError] = useState('')
  const [clipboardErrorTarget, setClipboardErrorTarget] = useState(null)

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
    onSuccess: (data) => {
      invalidate()
      if (data?.id) {
        setCreatedInviteUrl(`${window.location.origin}/accept-invitation?invitationId=${data.id}`)
      } else {
        setInviteOpen(false)
        setInviteEmail('')
        setInviteRole('MEMBER')
      }
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
      const removedSelf = memberToRemove?.userId === session?.user?.id
      setMemberToRemove(null)
      if (removedSelf) {
        localStorage.removeItem('asas.lastActiveOrgId')
        queryClient.clear()
        navigate('/choose-workspace', { replace: true })
      }
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

  const copyInvitationLink = async (invitationId) => {
    const link = `${window.location.origin}/accept-invitation?invitationId=${invitationId}`
    try {
      await navigator.clipboard.writeText(link)
      setClipboardError('')
      setClipboardErrorTarget(null)
      setCopiedInviteId(invitationId)
      window.setTimeout(() => setCopiedInviteId(null), 2000)
    } catch {
      setClipboardErrorTarget(invitationId)
      setClipboardError('Clipboard access was blocked. Select and copy the invitation link below.')
    }
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-surface overflow-hidden relative">
      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            wrapperClassName="w-64"
          />
          {isAdmin && (
            <Button
              type="button"
              onClick={() => {
                setInviteError('')
                setInviteEmail('')
                setInviteRole('MEMBER')
                setInviteOpen(true)
              }}
              className="h-8 gap-2 whitespace-nowrap"
            >
              <UserPlus size={15} />
              Invite Member
            </Button>
          )}
        </div>
      </TopBarActions>

      <SettingsTabs />

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden relative">
        {/* Left: Members List & Pending Invites */}
        <div className="w-full min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 relative">
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
                <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </Badge>
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
                        <Badge
                          variant={
                            member.role === 'OWNER'
                              ? 'default'
                              : member.role === 'ADMIN'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="uppercase tracking-wider"
                        >
                          {member.role}
                        </Badge>

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
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => {
                                updateRoleMutation.reset()
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
                              className="h-7 text-xs"
                            >
                              Edit Role
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => {
                                removeMemberMutation.reset()
                                setMemberToRemove(member)
                                setRemoveDialogOpen(true)
                              }}
                              disabled={isOnlyOwner}
                              title={
                                isOnlyOwner
                                  ? 'Cannot remove the only owner'
                                  : 'Remove member from workspace'
                              }
                              className="h-7 w-7 text-muted hover:text-danger-hover"
                            >
                              <Trash2 size={15} />
                            </Button>
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
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
                    {invitations.length} pending
                  </Badge>
                </div>

                <div className="divide-y divide-border-subtle">
                  {cancelInviteMutation.isError && <p role="alert" className="px-4 py-2 text-xs text-danger">{cancelInviteMutation.error?.message || 'Unable to cancel this invitation.'}</p>}
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

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => copyInvitationLink(inv.id)}
                          className="text-xs font-medium text-accent hover:text-accent-hover h-7 px-2 gap-1"
                          title="Copy direct invitation link"
                        >
                          {copiedInviteId === inv.id ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedInviteId === inv.id ? 'Copied Link' : 'Copy Link'}</span>
                        </Button>
                        {clipboardError && clipboardErrorTarget === inv.id && (
                          <div className="flex items-center gap-2">
                            <Input readOnly value={`${window.location.origin}/accept-invitation?invitationId=${inv.id}`} className="w-56 text-[10px]" aria-label="Invitation link to copy manually" />
                            <span role="alert" className="text-[11px] text-danger">{clipboardError}</span>
                          </div>
                        )}
                        <span className="text-xs text-caption flex items-center gap-1">
                          <Clock size={12} />
                          Pending
                        </span>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => cancelInviteMutation.mutate(inv.id)}
                            disabled={cancelInviteMutation.isPending}
                            className="text-xs font-medium text-danger-hover hover:text-danger-hover h-7 px-2"
                          >
                            Cancel
                          </Button>
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
        <div className="w-full xl:w-[340px] xl:flex-shrink-0 xl:overflow-y-auto bg-surface-muted border-t xl:border-t-0 xl:border-l border-border-default p-8 flex flex-col space-y-6">
          <div>
            <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-4">
              Roles & Permissions
            </h3>
            <p className="text-xs text-body-light leading-relaxed mb-6">
              Workspace roles control who can manage people and settings, work with operational records,
              and access sensitive finance and HR data. Approval controls add separation of duties to key workflows.
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
                Can use member-accessible workspace features, participate in projects, and access personal
                self-service records without administrative privileges. Module-by-module access assignment
                is not currently available.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      <FormDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false)
          setCreatedInviteUrl('')
          setInviteEmail('')
          setInviteError('')
        }}
        title={createdInviteUrl ? 'Invitation Ready' : 'Invite New Member'}
        subtitle={
          createdInviteUrl
            ? 'The invitation has been generated. You can share this direct link.'
            : 'Create an invitation for your teammate. We will attempt email delivery when configured; share the direct link if they do not receive it.'
        }
        confirmLabel={createdInviteUrl ? 'Done' : inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
        isConfirmDisabled={!createdInviteUrl && (!inviteEmail.trim() || inviteMutation.isPending)}
        onConfirm={() => {
          if (createdInviteUrl) {
            setInviteOpen(false)
            setCreatedInviteUrl('')
            setInviteEmail('')
            setInviteError('')
          } else {
            inviteMutation.mutate()
          }
        }}
        error={inviteError}
      >
        {createdInviteUrl ? (
          <div className="space-y-4">
            <div className="p-3 bg-success-light border border-success-border rounded-lg text-success-text text-xs leading-relaxed">
                <p className="font-semibold mb-1">Invitation created for {inviteEmail || 'new member'}.</p>
              <p className="text-[11px]">
                Copy and share the invitation acceptance link directly with your team member:
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={createdInviteUrl} className="text-xs bg-surface-muted font-mono" />
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdInviteUrl)
                    setClipboardError('')
                    setClipboardErrorTarget(null)
                    setCopiedInviteId('dialog')
                    window.setTimeout(() => setCopiedInviteId(null), 2000)
                  } catch {
                    setClipboardErrorTarget('dialog')
                    setClipboardError('Clipboard access was blocked. Select and copy the invitation link above.')
                  }
                }}
                className="gap-1.5 text-xs shrink-0 h-9"
              >
                {copiedInviteId === 'dialog' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedInviteId === 'dialog' ? 'Copied' : 'Copy Link'}</span>
              </Button>
            </div>
            {clipboardError && clipboardErrorTarget === 'dialog' && <p role="alert" className="text-xs text-danger">{clipboardError}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Email Address
              </label>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full bg-surface-muted"
              />
            </div>

            <div>
              <label htmlFor="invite-role" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Role
              </label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role" className="w-full text-sm bg-surface-muted text-heading">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member (Standard Access)</SelectItem>
                  <SelectItem value="ADMIN">Admin (Full Operational Access)</SelectItem>
                  {isOwner && <SelectItem value="OWNER">Owner (Full Authority)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
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
            <label htmlFor="select-role" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Select Role
            </label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger id="select-role" className="w-full text-sm bg-surface-muted text-heading">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                {isOwner && <SelectItem value="OWNER">Owner</SelectItem>}
              </SelectContent>
            </Select>
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
        error={removeMemberMutation.error?.message}
        danger
      />
    </div>
  )
}
