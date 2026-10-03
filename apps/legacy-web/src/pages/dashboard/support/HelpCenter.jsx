import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset } from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import EmptyState from '../../../components/common/EmptyState'
import { supportApi } from '../../../lib/api/support'
import { queryKeys } from '../../../lib/queryKeys'

/**
 * Port of the legacy `asas` Help Center (support module).
 *
 * The legacy page fetched "recent tickets" via `supportService.getTickets`, but no
 * `/api/v1/support` endpoint exists in the rebuilt backend, so that list is replaced
 * with an honest empty state instead of fake ticket rows. Everything else — search
 * hero, popular topics, system status, direct support panels — was static in the
 * legacy UI and is kept 1:1 (same structure, same Tailwind classes).
 */
export default function SupportDashboard() {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState('')
  const ticketsQuery = useQuery({ queryKey: queryKeys.support.tickets(), queryFn: supportApi.listTickets })
  const createTicket = useMutation({ mutationFn: () => supportApi.createTicket({ subject: subject.trim(), channel: 'dashboard' }), onSuccess: () => { setSubject(''); queryClient.invalidateQueries({ queryKey: queryKeys.support.tickets() }) } })
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      <TopBarActions />
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-xl rounded-card-sm border border-border-default bg-surface-raised p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-card-sm border border-border-subtle bg-surface-muted text-body-light">
            <Headset size={22} />
          </div>
          <h1 className="text-2xl font-bold text-heading">Support workspace</h1>
          <p className="mt-2 text-sm text-muted">Create and track support requests for this workspace.</p>
          <div className="mt-6 flex gap-2"><input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Describe your issue" className="min-w-0 flex-1 rounded-input border border-border-default px-3 py-2 text-sm" /><button type="button" disabled={!subject.trim() || createTicket.isPending} onClick={() => createTicket.mutate()} className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Submit</button></div>
          <div className="mt-8 text-left">{ticketsQuery.isLoading ? <p className="text-sm text-muted">Loading tickets...</p> : ticketsQuery.data?.items?.length ? ticketsQuery.data.items.map(ticket => <div key={ticket.id} className="flex items-center justify-between border-b border-border-subtle py-3"><span className="text-sm font-medium text-heading">{ticket.subject}</span><span className="text-xs text-muted">{ticket.status}</span></div>) : <EmptyState title="No tickets yet" description="Submit a support request when you need help." />}</div>
        </div>
      </div>
    </div>
  )
}
