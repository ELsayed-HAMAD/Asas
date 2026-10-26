import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset, CheckCircle2, Loader2, Search } from 'lucide-react'
import { Button } from '../../../components/ui/button'
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
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-sky-50 text-sky-700 border-sky-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          Open
        </Badge>
      )
    case 'IN_PROGRESS':
      return (
        <Badge variant="secondary" className="gap-1.5 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          In Progress
        </Badge>
      )
    case 'RESOLVED':
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Resolved
        </Badge>
      )
    case 'CLOSED':
    default:
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] font-bold bg-slate-50 text-slate-600 border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
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
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-surface overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto w-full space-y-4 pt-2">
        {/* Section 1: Calm Horizontal Header & Recessed Ticket Composer Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
          {/* Horizontal Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-slate-100/90 border border-slate-200/70 text-slate-700 flex items-center justify-center shrink-0 shadow-2xs">
                <Headset size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                  Support Workspace
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-snug">
                  Submit and monitor customer support and platform help requests.
                </p>
              </div>
            </div>

            {/* Right: Status Pill */}
            <div className="px-3 py-1 rounded-full bg-slate-100/80 border border-slate-200/60 text-xs font-medium text-slate-600 inline-flex items-center gap-1.5 shrink-0 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Support Online</span>
            </div>
          </div>

          {submitSuccess && (
            <Alert className="bg-emerald-50/80 border-emerald-200 text-emerald-800 py-2.5 px-3.5 rounded-xl text-xs sm:text-sm">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <AlertDescription>
                Your support ticket was submitted and queued for review.
              </AlertDescription>
            </Alert>
          )}

          {createTicket.isError && (
            <Alert variant="destructive" className="py-2.5 px-3.5 rounded-xl text-xs sm:text-sm text-left">
              <AlertDescription>
                {createTicket.error?.message || 'Could not submit support ticket. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Recessed Ticket Composer Well */}
          <div className="p-2 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="Describe your issue or question..."
              className="flex-1 h-10 px-3.5 rounded-xl bg-white border border-slate-200/80 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
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
              className="h-10 px-5 rounded-xl bg-[#131722] hover:bg-slate-800 active:bg-slate-950 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createTicket.isPending && <Loader2 size={14} className="animate-spin text-white" />}
              <span>Submit</span>
            </button>
          </div>
        </div>

        {/* Section 2: SUPPORT REQUESTS (0) Card with Integrated Filter tickets... Toolbar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Integrated Card Header Bar */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                SUPPORT REQUESTS ({allTickets.length})
              </h2>
              {search && (
                <span className="text-[11px] text-slate-400 font-medium">
                  · Showing {visibleTickets.length} of {allTickets.length}
                </span>
              )}
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0 z-10"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tickets..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50/90 border border-slate-200/70 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 transition-all"
              />
            </div>
          </div>

          {/* Ticket Listing or Empty State */}
          {ticketsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
              <Loader2 size={16} className="animate-spin text-slate-400" />
              <span>Loading tickets...</span>
            </div>
          ) : visibleTickets.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {visibleTickets.map(ticket => (
                <div
                  key={ticket.id}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ticket.subject}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                      <span>Submitted {ticket.createdAt ? formatDate(ticket.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) : 'recently'}</span>
                      {ticket.resolvedAt && (
                        <span className="text-emerald-600 font-medium">· Resolved {formatDate(ticket.resolvedAt, { dateStyle: 'short' })}</span>
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
                        className="h-7 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2.5 rounded-lg cursor-pointer"
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
                        className="h-7 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2.5 rounded-lg cursor-pointer"
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
            <div className="p-5">
              <div className="min-h-[200px] rounded-xl bg-slate-50/60 border border-dashed border-slate-200/80 p-8 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center text-slate-400 mb-3">
                  <Headset size={18} />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {search ? 'No matching tickets' : 'No tickets yet'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {search ? 'Try adjusting your search filter.' : 'Submit a support request when you need assistance.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
