import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset, CheckCircle2, Search, Loader2 } from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import EmptyState from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { supportApi } from '../../../lib/api/support'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { formatDate } from '../../../lib/format'

function getStatusBadge(status) {
  switch (status) {
    case 'OPEN':
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-info-light text-info border-info-border">
          <span className="w-1.5 h-1.5 rounded-full bg-info-dot" />
          Open
        </Badge>
      )
    case 'IN_PROGRESS':
      return (
        <Badge variant="secondary" className="gap-1.5 text-[11px] font-bold bg-warning-light text-warning-text">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          In Progress
        </Badge>
      )
    case 'RESOLVED':
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-success-light text-success-text border-success-border">
          <span className="w-1.5 h-1.5 rounded-full bg-success-dot" />
          Resolved
        </Badge>
      )
    case 'CLOSED':
    default:
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-surface-muted text-muted border-border-default">
          <span className="w-1.5 h-1.5 rounded-full bg-caption" />
          Closed
        </Badge>
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
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-surface overflow-hidden relative">
      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption z-10 pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tickets..."
              className="pl-9 pr-4 py-1.5 h-8 text-sm w-64 bg-surface-raised"
            />
          </div>
        </div>
      </TopBarActions>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 flex items-start justify-center relative">
        <div className="w-full max-w-2xl rounded-card-sm border border-border-default bg-surface-raised p-5 sm:p-8 text-center shadow-card space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card-sm border border-border-subtle bg-surface-muted text-body-light">
            <Headset size={22} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-heading">Support Workspace</h1>
            <p className="mt-1 text-sm text-muted">Submit and monitor customer support and platform help requests.</p>
          </div>

          {submitSuccess && (
            <Alert className="bg-success-light border-success-border text-success-text">
              <CheckCircle2 size={16} />
              <AlertDescription>
                Your support ticket was submitted and queued for review.
              </AlertDescription>
            </Alert>
          )}

          {createTicket.isError && (
            <Alert variant="destructive" className="text-left">
              <AlertDescription>
                {createTicket.error?.message || 'Could not submit support ticket. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="Describe your issue or question..."
              className="min-w-0 flex-1 bg-surface"
              onKeyDown={e => {
                if (e.key === 'Enter' && subject.trim() && !createTicket.isPending) {
                  createTicket.mutate()
                }
              }}
            />
            <Button
              type="button"
              disabled={!subject.trim() || createTicket.isPending}
              onClick={() => createTicket.mutate()}
              className="gap-2 shrink-0"
            >
              {createTicket.isPending && <Loader2 size={14} className="animate-spin" />}
              Submit
            </Button>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => updateTicket.mutate({ id: ticket.id, status: 'RESOLVED' })}
                          disabled={updateTicket.isPending}
                          className="h-6 text-[11px] font-semibold text-accent hover:text-accent-hover px-2"
                          title="Mark this ticket as resolved"
                        >
                          Resolve
                        </Button>
                      )}

                      {isAdmin && ticket.status === 'RESOLVED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => updateTicket.mutate({ id: ticket.id, status: 'CLOSED' })}
                          disabled={updateTicket.isPending}
                          className="h-6 text-[11px] font-medium text-caption hover:text-heading px-2"
                          title="Close ticket"
                        >
                          Close
                        </Button>
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
