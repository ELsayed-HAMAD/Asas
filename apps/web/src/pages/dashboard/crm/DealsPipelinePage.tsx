import type { Deal, DealListResponse, DealStage, DealUpdateInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { crmApi } from '@/lib/api/crm.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

const STAGES: DealStage[] = ['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']

const STAGE_LABELS: Record<DealStage, string> = {
  LEADS: 'Leads',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed won',
  CLOSED_LOST: 'Closed lost',
}

const PIPELINE_QUERY = { openOnly: true, limit: 100 } as const

const PIPELINE_KEY = queryKeys.crm.deals.list(PIPELINE_QUERY)

/**
 * The deals board — `GET /crm/deals` (open pipeline) rendered as five dnd-kit columns, one per
 * `DealStage`. Dragging a card into another column is a real mutation
 * (`PATCH /crm/deals/:id` with the new `stage`), applied optimistically to the cached list and
 * reverted on failure; the server's SSE publish re-invalidates every other open tab.
 *
 * The column count badges come from the server `summary` (a SQL group-by), and the per-column
 * lists are filtered from the fetched page — no KPI here is computed by reducing client data.
 */
export function DealsPipelinePage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: PIPELINE_KEY,
    queryFn: () => crmApi.listDeals(PIPELINE_QUERY),
  })

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
      crmApi.updateDeal(id, { stage } satisfies DealUpdateInput),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.crm.deals.all() })
      const previous = queryClient.getQueryData<DealListResponse>(PIPELINE_KEY)
      if (previous) {
        queryClient.setQueryData<DealListResponse>(PIPELINE_KEY, {
          ...previous,
          items: previous.items.map(deal => (deal.id === id ? { ...deal, stage } : deal)),
        })
      }
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(PIPELINE_KEY, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const stage = over.id as DealStage
    if (!STAGES.includes(stage)) return
    const deal = data?.items.find(item => item.id === active.id)
    if (!deal || deal.stage === stage) return
    updateStage.mutate({ id: deal.id, stage })
  }

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Deals pipeline</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Drag a deal into another stage — each move is a real, audited mutation.
          </p>
        </div>
        {data?.summary && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              Open: {data.summary.openDealCount} · {formatMoney(data.summary.openPipelineValue, { compact: true })}
            </Badge>
            <Badge variant="success">Won: {formatMoney(data.summary.wonValue, { compact: true })}</Badge>
            <Badge variant="danger">Lost: {formatMoney(data.summary.lostValue, { compact: true })}</Badge>
            <Badge variant="outline">Win rate: {formatPercent(data.summary.winRate)}</Badge>
          </div>
        )}
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the deals pipeline.</p>
      ) : isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-2">
            {STAGES.map(stage => (
              <DealColumn
                key={stage}
                stage={stage}
                deals={data!.items.filter(deal => deal.stage === stage)}
                busy={updateStage.isPending}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
}

function DealColumn({
  stage,
  deals,
  busy,
}: {
  stage: DealStage
  deals: Deal[]
  busy: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--color-surface-muted)] p-3 transition-colors',
        isOver && 'bg-[var(--color-surface-active)]',
      )}
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-[var(--color-heading)]">{STAGE_LABELS[stage]}</h2>
        <Badge variant="outline" className="tabular-nums">{deals.length}</Badge>
      </div>

      <div className="flex min-h-24 flex-col gap-2">
        {deals.map(deal => (
          <DealCard key={deal.id} deal={deal} busy={busy} />
        ))}
        {deals.length === 0 && (
          <p className="rounded-[var(--radius-card-sm)] border border-dashed border-[var(--color-border-strong)] p-3 text-center text-xs text-[var(--color-muted)]">
            No deals
          </p>
        )}
      </div>
    </div>
  )
}

function DealCard({ deal, busy }: { deal: Deal; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id })

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('cursor-grab p-3 active:cursor-grabbing', isDragging && 'z-10 opacity-60 shadow-[var(--shadow-elevated)]', busy && 'opacity-70')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-heading)]">{deal.name}</p>
          {deal.company && <p className="truncate text-xs text-[var(--color-muted)]">{deal.company}</p>}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-heading)]">
          {formatMoney(deal.value, { compact: true })}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={deal.owner?.name ? 'text-xs text-[var(--color-muted)]' : 'text-xs text-[var(--color-faint)]'}>
          {deal.owner?.name ?? 'Unassigned'}
        </span>
        {deal.winProbability != null && (
          <Badge variant="outline" className="ml-auto tabular-nums">
            {formatPercent(deal.winProbability)}
          </Badge>
        )}
      </div>
    </Card>
  )
}
