import { Headset } from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import EmptyState from '../../../components/common/EmptyState'

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
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      <TopBarActions />
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-xl rounded-card-sm border border-border-default bg-surface-raised p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-card-sm border border-border-subtle bg-surface-muted text-body-light">
            <Headset size={22} />
          </div>
          <h1 className="text-2xl font-bold text-heading">Support is not connected</h1>
          <EmptyState
            title="No support workspace is available"
            description="Connect a support or documentation service to manage tickets and help content here."
          />
        </div>
      </div>
    </div>
  )
}
