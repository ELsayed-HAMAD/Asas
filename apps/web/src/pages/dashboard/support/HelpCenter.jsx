import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset, CheckCircle2, Search, Loader2 } from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import EmptyState from '../../../components/common/EmptyState'
import { supportApi } from '../../../lib/api/support'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { formatDate } from '../../../lib/format'

function getStatusBadge(status) {
  switch (status) {
    case 'OPEN':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-info-light text-info border border-info-border">
          <span className="w-1.5 h-1.5 rounded-full bg-info-dot" />
          Open
        </span>
      )
    case 'IN_PROGRESS':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-warning-light text-warning-text">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          In Progress
        </span>
      )
    case 'RESOLVED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success-light text-success-text border border-success-border">
          <span className="w-1.5 h-1.5 rounded-full bg-success-dot" />
          Resolved
        </span>
      )
    case 'CLOSED':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-muted text-muted border border-border-default">
          <span className="w-1.5 h-1.5 rounded-full bg-caption" />
          Closed
        </span>
      )
  }
}

export default function SupportDashboard() {
  const queryClient = useQueryClient()
  const { data: memberRole } = useActiveMemberRole()
  const isAdmin = ['ADMIN', 'OWNER'].includes(getMemberRoleName(memberRole))

  const [subject, setSubject] = useState('')
  const [search, setSearch] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const ticketsQuery = useQuery({
    queryKey: queryKeys.support.tickets(),
    queryFn: supportApi.listTickets,
  })

  const createTicket = useMutation({
    mutationFn: () => supportApi.createTicket({ subject: subject.trim(), channel: 'dashboard' }),
    onSuccess: () => {
      setSubject('')
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 4000)
      queryClient.invalidateQueries({ queryKey: queryKeys.support.tickets() })
    },
  })

  const updateTicket = useMutation({
    mutationFn: ({ id, status }) => supportApi.updateTicket(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.support.tickets() })
    },
  })

  const allTickets = ticketsQuery.data?.items || []
  const visibleTickets = search.trim()
    ? allTickets.filter(t => (t.subject || '').toLowerCase().includes(search.toLowerCase()) || (t.status || '').toLowerCase().includes(search.toLowerCase()))
    : allTickets

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">
      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tickets..."
              className="pl-9 pr-4 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        </div>
      </TopBarActions>

      <div className="flex flex-1 items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-2xl rounded-card-sm border border-border-default bg-surface-raised p-5 sm:p-8 text-center shadow-card space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card-sm border border-border-subtle bg-surface-muted text-body-light">
            <Headset size={22} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-heading">Support Workspace</h1>
            <p className="mt-1 text-sm text-muted">Submit and monitor customer support and platform help requests.</p>
          </div>

          {submitSuccess && (
            <div className="p-3 rounded-card-sm bg-success-light border border-success-border text-xs font-semibold text-success-text flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              Your support ticket was submitted and queued for review.
            </div>
          )}

          {createTicket.isError && (
            <div className="p-3 rounded-card-sm bg-danger-light border border-danger-border text-xs font-semibold text-danger text-left">
              {createTicket.error?.message || 'Could not submit support ticket. Please try again.'}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="Describe your issue or question..."
              className="min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm text-heading placeholder:text-caption focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              onKeyDown={e => {
                if (e.key === 'Enter' && subject.trim() && !createTicket.isPending) {
                  createTicket.mutate()
                }
              }}
            />
            <button
              type="button"
              disabled={!subject.trim() || createTicket.isPending}
              onClick={() => createTicket.mutate()}
              className="rounded-input bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer shadow-card flex items-center justify-center gap-2"
            >
              {createTicket.isPending && <Loader2 size={14} className="animate-spin" />}
              Submit
            </button>
          </div>

          <div className="pt-4 border-t border-border-subtle text-left space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                Support Requests ({allTickets.length})
              </h3>
              {search && (
                <span className="text-xs text-caption">
                  Showing {visibleTickets.length} of {allTickets.length}
                </span>
              )}
            </div>

            {ticketsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted gap-2">
                <Loader2 size={16} className="animate-spin" /> Loading tickets...
              </div>
            ) : visibleTickets.length > 0 ? (
              <div className="divide-y divide-border-subtle border border-border-subtle rounded-card-sm overflow-hidden bg-surface">
                {visibleTickets.map(ticket => (
                  <div key={ticket.id} className="p-4 flex items-center justify-between gap-4 hover:bg-surface-muted/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-heading truncate">{ticket.subject}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                        <span>Submitted {ticket.createdAt ? formatDate(ticket.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) : 'recently'}</span>
                        {ticket.resolvedAt && (
                          <span className="text-success-text">· Resolved {formatDate(ticket.resolvedAt, { dateStyle: 'short' })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {getStatusBadge(ticket.status)}

                      {isAdmin && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                        <button
                          type="button"
                          onClick={() => updateTicket.mutate({ id: ticket.id, status: 'RESOLVED' })}
                          disabled={updateTicket.isPending}
                          className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors cursor-pointer"
                          title="Mark this ticket as resolved"
                        >
                          Resolve
                        </button>
                      )}

                      {isAdmin && ticket.status === 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => updateTicket.mutate({ id: ticket.id, status: 'CLOSED' })}
                          disabled={updateTicket.isPending}
                          className="text-[11px] font-medium text-caption hover:text-heading transition-colors cursor-pointer"
                          title="Close ticket"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={search ? 'No matching tickets' : 'No tickets yet'}
                description={search ? 'Try adjusting your search filter.' : 'Submit a support request when you need assistance.'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
