import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2, ChevronRight } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { SearchInput } from '../../components/common/SearchInput'
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
} from '../../components/admin/ui'

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED']

export default function AdminWorkspaces() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['platform', 'workspaces', { search, status, page }],
    queryFn: () => platformApi.workspaces({ search: search || undefined, status, page, limit: 25 }),
    placeholderData: keepPreviousData,
  })

  const data = query.data

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Workspaces"
        description="Every tenant on the platform. Open a workspace to inspect its plan, members, usage, and recent activity."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1 sm:max-w-sm">
          <SearchInput
            value={searchInput}
            onChange={event => { setSearchInput(event.target.value); setPage(1) }}
            placeholder="Search by name or slug..."
            wrapperClassName="w-full"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border-default bg-white/60 p-1">
          {STATUS_FILTERS.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => { setStatus(value); setPage(1) }}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                status === value ? 'bg-primary-solid text-white' : 'text-muted hover:text-heading'
              }`}
            >
              {value === 'ALL' ? 'All' : value.toLowerCase()}
            </button>
          ))}
        </div>
        {data && (
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted">
            <span><strong className="text-heading">{data.summary.total}</strong> total</span>
            <span><strong className="text-emerald-700">{data.summary.active}</strong> active</span>
            <span><strong className="text-rose-700">{data.summary.suspended}</strong> suspended</span>
          </div>
        )}
      </div>

      {query.isLoading && <AdminLoading label="Loading workspaces..." />}
      {query.isError && <AdminError message={query.error?.message} onRetry={() => query.refetch()} />}
      {data && (
        <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          {data.items.length === 0 ? (
            <div className="p-4">
              <AdminEmptyState
                icon={Building2}
                title="No workspaces match these filters"
                description="Clear the search or choose All to see every workspace."
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3 text-right">Seats</th>
                      <th className="px-4 py-3 text-right">Storage</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.items.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => navigate(`/admin/workspaces/${item.id}`)}
                        className="cursor-pointer transition-colors hover:bg-white/70"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/workspaces/${item.id}`}
                            onClick={event => event.stopPropagation()}
                            className="font-semibold text-heading hover:text-accent"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-0.5 font-mono text-[10px] text-muted">{item.slug}</p>
                        </td>
                        <td className="px-4 py-3"><AdminStatusBadge status={item.status} /></td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-body">{item.planName}</span>
                          <p className="mt-0.5 text-[10px] text-muted">{item.onboardingStatus.replaceAll('_', ' ').toLowerCase()}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-heading">{item.seatsUsed} / {item.seatLimit}</td>
                        <td className="px-4 py-3 text-right text-muted">{item.storageUsedGb == null ? 'Not measured' : `${item.storageUsedGb.toFixed(1)} GB`}</td>
                        <td className="px-4 py-3 text-muted">{new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td className="px-4 py-3 text-right text-muted"><ChevronRight size={14} /></td>
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
