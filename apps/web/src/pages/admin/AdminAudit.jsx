import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { Input } from '../../components/ui/input'
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPagination,
} from '../../components/admin/ui'

export default function AdminAudit() {
  const [actionInput, setActionInput] = useState('')
  const action = useDebouncedValue(actionInput)
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['platform', 'audit', { action, page }],
    queryFn: () => platformApi.audit({ action: action || undefined, page, limit: 25 }),
    placeholderData: keepPreviousData,
  })

  const data = query.data

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Platform audit"
        description="An immutable record of every write performed through the platform console."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={actionInput}
          onChange={event => { setActionInput(event.target.value); setPage(1) }}
          placeholder="Filter by action, for example workspace.suspend"
          className="h-9 max-w-sm bg-white/60 text-xs"
        />
        {data && <span className="text-[11px] text-muted">{data.pagination.total.toLocaleString()} entries</span>}
      </div>

      {query.isLoading && <AdminLoading label="Loading platform audit..." />}
      {query.isError && <AdminError message={query.error?.message} onRetry={() => query.refetch()} />}
      {data && (
        <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          {data.items.length === 0 ? (
            <div className="p-4">
              <AdminEmptyState icon={ScrollText} title="No platform actions recorded" description="Actions appear here after you suspend a workspace, change a plan, revoke sessions, or update a control." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Metadata</th>
                      <th className="px-4 py-3">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.items.map(item => (
                      <tr key={item.id} className="align-top hover:bg-white/70">
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-heading">{item.actorName || 'System'}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{item.actorEmail || item.actorId || 'No actor'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] font-semibold text-heading">{item.action}</td>
                        <td className="px-4 py-3">
                          <p className="text-body">{item.targetType || 'Not set'}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted">{item.targetId || 'No target ID'}</p>
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          <p className="truncate font-mono text-[10px] text-muted" title={item.metadata || ''}>{item.metadata || 'No metadata'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-muted">{item.ipAddress || 'Not recorded'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPagination pagination={data.pagination} onPage={setPage} busy={query.isFetching} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
