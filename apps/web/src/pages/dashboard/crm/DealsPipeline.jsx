import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  MoreHorizontal,
  Mail,
  Phone,
  Pencil,
  Circle,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatDate, moneyToMajor } from '../../../lib/format';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { formatCompactMoney } from '../../../lib/crmMoney';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../../components/ui/dropdown-menu';

const STAGE_ORDER = ['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

const STAGE_LABELS = {
  LEADS: 'Leads',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

// Stages a brand-new deal can start in (open pipeline stages only).
const CREATE_STAGES = ['LEADS', 'PROPOSAL', 'NEGOTIATION'];

const EMPTY_DEAL_FORM = {
  name: '',
  value: '',
  stage: 'LEADS',
  closeDate: '',
  winProbability: '',
  forecastBucket: 'PIPELINE',
};

const getStageBadgeColors = (stage) => {
  switch (stage) {
    case 'LEADS': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'PROPOSAL': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'NEGOTIATION': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'CLOSED_WON': return 'bg-green-100 text-green-700 border-green-200';
    case 'CLOSED_LOST': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-surface-strong/70 text-body border-border-default/50';
  }
};

const getStageDotColor = (stage) => {
  switch (stage) {
    case 'LEADS': return 'bg-blue-500';
    case 'PROPOSAL': return 'bg-orange-500';
    case 'NEGOTIATION': return 'bg-purple-500';
    case 'CLOSED_WON': return 'bg-green-500';
    case 'CLOSED_LOST': return 'bg-red-500';
    default: return 'bg-muted';
  }
};

// Avatar initials derived from the deal's (company or name) — the old rows showed a
// 2-letter monogram in the avatar box.
const initials = (deal) => {
  const source = deal.company || deal.name || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export { formatCompactMoney };


function StageSwitcherCard({ stage, group, isActive, onSelect }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const summaryKey = stage === 'CLOSED_WON' ? 'wonValue' : stage === 'CLOSED_LOST' ? 'lostValue' : 'openPipelineValue';
  const totalValue = group?.summary?.[summaryKey];
  const total = group?.pagination?.total ?? 0;
  const exactMoney = formatMoney(totalValue || 0, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const countLabel = `${total} ${total === 1 ? 'deal' : 'deals'}`;
  const cardDescription = `${STAGE_LABELS[stage]}: ${countLabel}, ${exactMoney}`;

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={isActive}
      aria-label={cardDescription}
      title={cardDescription}
      onClick={() => onSelect(stage)}
      className={`rounded-[12px] p-[10px_12px] min-w-[150px] min-[1100px]:min-w-0 text-start cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        isActive
          ? 'bg-surface-raised border border-primary shadow-[0_0_0_1px_var(--color-primary)]'
          : 'bg-surface-raised border border-border-default hover:border-border-strong'
      } ${isOver ? 'ring-2 ring-accent bg-accent-light/30' : ''}`}
    >
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${getStageDotColor(stage)}`} aria-hidden="true" />
          <span className="text-xs font-semibold text-muted whitespace-nowrap">
            {STAGE_LABELS[stage]}
          </span>
        </div>
        <span className="text-xs text-muted font-medium shrink-0 whitespace-nowrap ms-auto">
          {countLabel}
        </span>
      </div>
      <div className="mt-1.5 text-[18px] font-extrabold text-heading tabular-nums leading-tight whitespace-nowrap">
        {formatCompactMoney(totalValue || 0)}
      </div>
    </button>
  );
}

function ListDealRow({ deal, selected, onSelect, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      data-deal-id={deal.id}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(deal.id);
        }
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        gridTemplateColumns: 'minmax(240px, 1fr) 120px 130px',
        paddingInline: '20px',
      }}
      {...listeners}
      {...attributes}
      onClick={() => onSelect(deal.id)}
      className={`relative grid items-center gap-x-3 h-14 min-h-[56px] cursor-pointer transition-colors border-b border-border-subtle focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent ${
        selected ? 'bg-surface-muted' : 'bg-surface-raised hover:bg-surface-muted/60'
      } ${isDragging || disabled ? 'opacity-60' : ''}`}
    >
      {selected && (
        <div className="absolute inset-y-0 inset-inline-start-0 w-[3px] bg-accent pointer-events-none" />
      )}
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold bg-surface-strong text-body">
          {initials(deal)}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-sm font-bold text-heading truncate leading-tight whitespace-nowrap" title={deal.name}>
            {deal.name}
          </p>
          <p className="text-xs text-muted truncate mt-0.5 leading-tight whitespace-nowrap" title={deal.company || (deal.owner?.name || 'No company')}>
            {deal.company || (deal.owner?.name || 'No company')}
          </p>
        </div>
      </div>
      <div className="flex items-center min-w-0">
        <Badge variant="outline" className={`h-[22px] min-h-[22px] px-2.5 text-xs font-bold rounded-full whitespace-nowrap ${getStageBadgeColors(deal.stage)}`}>
          {STAGE_LABELS[deal.stage] || deal.stage}
        </Badge>
      </div>
      <div className="text-end">
        <span className="text-sm font-extrabold text-heading tabular-nums whitespace-nowrap">
          {formatMoney(deal.value)}
        </span>
      </div>
    </div>
  );
}


function DetailPanel({
  deal,
  canWrite,
  onOpenActivity,
  onEdit,
  onDelete,
  onStageChange,
  stageError,
  activitiesLoading,
  activitiesError,
  activityData,
  activityPage,
  onActivityPageChange,
  showCloseButton = false,
  onClose,
}) {
  if (!deal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
        <p className="text-[13px]">Select a deal to view details.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: avatar 48px (radius 12), deal title 16px extrabold (wraps max 2 lines), sub line 13px muted, "..." menu aligned right */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-[12px] bg-primary flex items-center justify-center text-lg font-bold text-white shadow-card shrink-0">
              {initials(deal)}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="text-base font-extrabold text-heading leading-snug line-clamp-2"
                title={deal.name}
              >
                {deal.name}
              </h2>
              <p className="text-[13px] text-muted mt-1 leading-tight truncate">
                {deal.company || 'No company'} · {deal.owner?.title || deal.owner?.name || 'Owner unassigned'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-caption hover:text-body"
                  title="Deal options"
                >
                  <MoreHorizontal size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!canWrite}
                  onClick={onDelete}
                  className="text-danger focus:text-danger focus:bg-danger-light"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Deal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {showCloseButton && onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="h-8 w-8 text-caption hover:text-body"
              >
                <X size={18} />
              </Button>
            )}
          </div>
        </div>

        {/* Amount: 32px extrabold, existing blue, tabular-nums */}
        <div className="mt-2">
          <p className="text-[32px] font-extrabold text-[#2563eb] tracking-tight tabular-nums leading-none">
            {formatMoney(deal.value)}
          </p>
        </div>
      </div>

      {/* Actions: Log Email / Log Call / Edit in a 3-column grid, 8px gap, 36px high, equal width, nowrap, existing icons */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenActivity('EMAIL')}
          disabled={!canWrite}
          title={!canWrite ? 'Requires the ADMIN role' : 'Record an email activity'}
          className="h-9 px-2 text-sm font-semibold whitespace-nowrap"
        >
          <Mail size={16} className="text-muted mr-1.5 shrink-0" /> Log Email
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenActivity('CALL')}
          disabled={!canWrite}
          title={!canWrite ? 'Requires the ADMIN role' : 'Record a call activity'}
          className="h-9 px-2 text-sm font-semibold whitespace-nowrap"
        >
          <Phone size={16} className="text-muted mr-1.5 shrink-0" /> Log Call
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={!canWrite}
          title={!canWrite ? 'Requires the ADMIN role' : 'Edit deal'}
          className="h-9 px-2 text-sm font-semibold whitespace-nowrap"
        >
          <Pencil size={16} className="text-muted mr-1.5 shrink-0" /> Edit
        </Button>
      </div>

      {/* Stage row: label "STAGE" (11px uppercase muted) left, select (36px) right, 12px gap */}
      <div>
        <div className="flex items-center gap-3">
          <label htmlFor="deal-stage" className="text-[11px] font-semibold text-muted uppercase tracking-wider shrink-0">
            Stage
          </label>
          <select
            id="deal-stage"
            value={deal.stage}
            onChange={(event) => onStageChange(deal, event.target.value)}
            disabled={!canWrite}
            title={!canWrite ? 'Requires the ADMIN role' : undefined}
            className="flex-1 min-h-[36px] h-9 px-3 py-1.5 text-sm font-medium text-body border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-60 cursor-pointer"
          >
            {STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
            ))}
          </select>
        </div>
        {stageError && stageError.id === deal.id && (
          <p className="mt-2 text-xs font-medium text-danger">
            {stageError.message}
          </p>
        )}
      </div>

      {/* Win Probability section: only render it if the selected deal has win-probability data */}
      {deal.winProbability != null && (
        <div className="pt-4 border-t border-border-default">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Win Probability</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-heading tabular-nums">
              {Math.round(deal.winProbability)}%
            </span>
            <span className="text-[13px] text-muted">
              {deal.closeDate ? `Closing ${formatDate(deal.closeDate, { month: 'short', day: 'numeric' })}` : 'No close date'}
            </span>
          </div>
          <Progress
            value={Math.min(100, Math.max(0, deal.winProbability))}
            className="h-1.5 mt-2 bg-surface-strong"
            indicatorClassName="bg-accent"
          />
        </div>
      )}

      {/* Recent Activity section: 1px top divider, label, then existing empty text or activity list */}
      <div className="pt-4 border-t border-border-default">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Recent Activity</h3>
        {activitiesLoading ? (
          <p className="text-[13px] text-muted">Loading activity…</p>
        ) : activitiesError ? (
          <p role="alert" className="text-[13px] text-danger">Could not load deal activity.</p>
        ) : null}
        {!activitiesLoading && !activitiesError && (activityData?.items?.length ?? 0) === 0 && (
          <p className="text-[13px] text-muted">No recent activity logged for this deal.</p>
        )}
        {!activitiesLoading && !activitiesError && (activityData?.items?.length ?? 0) > 0 && (
          <div className="relative ps-3 space-y-4 mt-3">
            <div className="absolute inset-inline-start-[19px] top-2 bottom-4 w-px bg-surface-strong" />
            {activityData.items.slice(0, 3).map(activity => (
              <div key={activity.id} className="relative z-10 flex gap-3 text-[13px]">
                <div className="bg-surface-raised ring-4 ring-white dark:ring-surface-raised mt-0.5 rounded-full shrink-0">
                  {activity.type === 'EMAIL' ? (
                    <Mail size={16} className="text-faint" />
                  ) : activity.type === 'CALL' ? (
                    <Phone size={16} className="text-faint" />
                  ) : (
                    <Circle size={16} className="text-faint" strokeWidth={2.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-heading leading-tight">{activity.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {activity.type === 'EMAIL' ? 'Email' : activity.type === 'CALL' ? 'Call' : 'Note'} · {activity.actorName || 'Unknown author'} · {formatDate(activity.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {activity.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-body">{activity.body}</p>}
                </div>
              </div>
            ))}
            {(activityData.pagination?.pages ?? 0) > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activityPage <= 1}
                  onClick={() => onActivityPageChange(page => page - 1)}
                  className="h-6 px-2 text-xs"
                >
                  Newer
                </Button>
                <span>Page {activityPage} of {activityData.pagination.pages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activityPage >= activityData.pagination.pages}
                  onClick={() => onActivityPageChange(page => page + 1)}
                  className="h-6 px-2 text-xs"
                >
                  Older
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DealsPipeline() {
  const [selectedId, setSelectedId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const lastFocusedDealIdRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [newDealOpen, setNewDealOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewDealOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_DEAL_FORM);
  const [dealForm, setDealForm] = useState(EMPTY_DEAL_FORM);
  const [formError, setFormError] = useState(null);
  // { id, message } so a failed stage move is shown only under the deal it failed for.
  const [stageError, setStageError] = useState(null);
  const [activityDialogType, setActivityDialogType] = useState(null);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityBody, setActivityBody] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activeStage, setActiveStage] = useState(() => {
    try {
      const saved = localStorage.getItem('deals_pipeline_active_stage');
      return STAGE_ORDER.includes(saved) ? saved : 'LEADS';
    } catch {
      return 'LEADS';
    }
  });
  const listPaneRef = useRef(null);
  const [search, setSearch] = useState('');
  const [pageByStage, setPageByStage] = useState(() => Object.fromEntries(STAGE_ORDER.map(stage => [stage, 1])));
  const deferredSearch = useDeferredValue(search.trim());
  const pageLimit = 25;

  const handleStageSelect = (stage) => {
    setActiveStage(stage);
    try {
      localStorage.setItem('deals_pipeline_active_stage', stage);
    } catch {}
    const targetGroup = groups.find(g => g.stage === stage);
    if (targetGroup && targetGroup.deals.length > 0) {
      setSelectedId(targetGroup.deals[0].id);
      lastFocusedDealIdRef.current = targetGroup.deals[0].id;
    } else {
      setSelectedId(null);
    }
    if (listPaneRef.current) {
      listPaneRef.current.scrollTop = 0;
    }
  };

  // Deal writes are ADMIN-only server-side (`deal.write` permission); the controls below are
  // rendered disabled for non-OWNER/ADMIN members with a hint explaining why.
  const { data: activeMemberRole } = useActiveMemberRole();
  const canWrite = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole));

  const queryClient = useQueryClient();

  // Each stage is paginated independently. Counts and totals come from the full filtered server result.
  const stageQueries = useQueries({ queries: STAGE_ORDER.map(stage => {
    const filters = { stage, page: pageByStage[stage], limit: pageLimit, ...(deferredSearch && { search: deferredSearch }) };
    return { queryKey: queryKeys.crm.deals.list(filters), queryFn: () => crmApi.listDeals(filters) };
  }) });
  const deals = stageQueries.flatMap(query => query.data?.items ?? []);
  const { data: selectedDetail } = useQuery({
    queryKey: queryKeys.crm.deals.detail(selectedId),
    queryFn: () => crmApi.getDeal(selectedId),
    enabled: Boolean(selectedId && !deals.some(deal => deal.id === selectedId)),
  });
  const activityDealId = selectedId;
  const { data: activityData, isLoading: activitiesLoading, isError: activitiesError } = useQuery({
    queryKey: queryKeys.crm.deals.activities(activityDealId, { page: activityPage, limit: 3 }),
    queryFn: () => crmApi.listDealActivities(activityDealId, { page: activityPage, limit: 3 }),
    enabled: Boolean(activityDealId),
  });
  const isLoading = stageQueries.some(query => query.isLoading);
  const isError = stageQueries.some(query => query.isError);

  // Refresh the board (and anything else CRM-shaped) after a successful write; the server's
  // SSE publish covers other open tabs.
  const invalidateCrmDeals = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.deals.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => crmApi.createDeal(payload),
    onSuccess: (created) => {
      invalidateCrmDeals();
      if (created?.stage) setPageByStage(current => ({ ...current, [created.stage]: 1 }));
      setNewDealOpen(false);
      setDealForm(EMPTY_DEAL_FORM);
      setFormError(null);
    },
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }) => crmApi.updateDeal(id, { stage }),
    onSuccess: (_, variables) => {
      invalidateCrmDeals();
      setStageError(null);
      if (variables.sourcePageIsLastSingleRow) setPageByStage(current => ({ ...current, [variables.sourceStage]: Math.max(1, variables.sourcePage - 1) }));
    },
    onError: (error, variables) => {
      setStageError({
        id: variables.id,
        message: error?.message || 'Failed to update the deal stage.',
      });
    },
  });
  const editMutation = useMutation({
    mutationFn: () => crmApi.updateDeal(selectedDeal.id, { ...editForm, value: editForm.value || null, closeDate: editForm.closeDate || null, winProbability: editForm.winProbability === '' ? null : Number(editForm.winProbability) }),
    onSuccess: () => { invalidateCrmDeals(); setEditDealOpen(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => crmApi.deleteDeal(id),
    onSuccess: () => {
      invalidateCrmDeals();
      setDeleteConfirmOpen(false);
      setSelectedId(null);
      setPanelOpen(false);
    },
  });
  const activityMutation = useMutation({
    mutationFn: () => crmApi.createDealActivity(activityDealId, { type: activityDialogType, title: activityTitle.trim(), body: activityBody.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.deals.activities(activityDealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() });
      setActivityPage(1);
      setActivityDialogType(null);
      setActivityTitle('');
      setActivityBody('');
    },
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const moveDealToStage = (deal, nextStage) => {
    if (!canWrite || !deal || !STAGE_ORDER.includes(nextStage) || deal.stage === nextStage) return;
    const sourceGroup = groups.find(group => group.stage === deal.stage);
    const sourcePage = pageByStage[deal.stage];
    stageMutation.mutate({
      id: deal.id,
      stage: nextStage,
      sourceStage: deal.stage,
      sourcePage,
      sourcePageIsLastSingleRow: sourcePage > 1 && sourcePage === sourceGroup?.pagination?.pages && sourceGroup?.deals.length === 1,
    });
  };

  const handleDragEnd = (event) => {
    if (!event.over) return;
    const deal = deals.find(item => item.id === event.active.id);
    if (!deal) return;
    let targetStage = event.over.id;
    if (!STAGE_ORDER.includes(targetStage)) {
      const targetDeal = deals.find(d => d.id === targetStage);
      if (targetDeal) targetStage = targetDeal.stage;
    }
    moveDealToStage(deal, targetStage);
  };

  const openActivityDialog = type => {
    setActivityDialogType(type);
    setActivityTitle('');
    setActivityBody('');
    activityMutation.reset();
  };

  const selectDeal = (id) => {
    lastFocusedDealIdRef.current = id;
    setSelectedId(id);
    setPanelOpen(true);
    setActivityPage(1);
    const deal = deals.find(d => d.id === id);
    if (deal?.stage) {
      setActiveStage(deal.stage);
      try {
        localStorage.setItem('deals_pipeline_active_stage', deal.stage);
      } catch {}
    }
  };

  const closePanel = () => {
    setPanelOpen(false);
    const targetId = lastFocusedDealIdRef.current || selectedId;
    if (targetId) {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-deal-id="${targetId}"]`);
        if (el) el.focus();
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.key === 'Escape' &&
        panelOpen &&
        !newDealOpen &&
        !editDealOpen &&
        !deleteConfirmOpen &&
        !activityDialogType
      ) {
        closePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panelOpen, newDealOpen, editDealOpen, deleteConfirmOpen, activityDialogType]);

  const openNewDealDialog = () => {
    setFormError(null);
    setDealForm(EMPTY_DEAL_FORM);
    setNewDealOpen(true);
  };

  const submitNewDeal = () => {
    const name = dealForm.name.trim();
    if (!name) {
      setFormError('Deal name is required.');
      return;
    }
    const payload = { name, stage: dealForm.stage };
    const value = dealForm.value.trim();
    payload.value = value === '' ? null : value;
    if (dealForm.closeDate) payload.closeDate = dealForm.closeDate;
    const winProbability = dealForm.winProbability.trim();
    payload.winProbability = winProbability === '' ? null : Math.min(100, Math.max(0, Number(winProbability)));
    payload.forecastBucket = dealForm.forecastBucket;
    createMutation.mutate(payload);
  };

  const dialogError = createMutation.error
    ? (createMutation.error.message || 'Failed to create the deal.')
    : formError;

  // Keep every stage visible so an empty column is still a valid drop target.
  const groups = STAGE_ORDER.map((stage, index) => ({
    stage,
    deals: stageQueries[index]?.data?.items ?? [],
    pagination: stageQueries[index]?.data?.pagination,
    summary: stageQueries[index]?.data?.summary,
  }));

  const activeGroup = groups.find(g => g.stage === activeStage) || groups[0];
  const activeSummaryKey = activeGroup?.stage === 'CLOSED_WON' ? 'wonValue' : activeGroup?.stage === 'CLOSED_LOST' ? 'lostValue' : 'openPipelineValue';
  const activeTotalValue = activeGroup?.summary?.[activeSummaryKey];
  const activePage = activeGroup?.pagination?.page ?? 1;
  const activeLimit = activeGroup?.pagination?.limit ?? 25;
  const activePages = Math.max(1, activeGroup?.pagination?.pages ?? 1);
  const activeTotal = activeGroup?.pagination?.total ?? 0;
  const activeFirst = activeTotal === 0 ? 0 : (activePage - 1) * activeLimit + 1;
  const activeLast = Math.min(activePage * activeLimit, activeTotal);

  useEffect(() => {
    const currentActiveGroup = groups.find(g => g.stage === activeStage);
    if (currentActiveGroup && currentActiveGroup.deals.length > 0) {
      if (!selectedId || !currentActiveGroup.deals.some(d => d.id === selectedId)) {
        setSelectedId(currentActiveGroup.deals[0].id);
      }
    } else if (currentActiveGroup && currentActiveGroup.deals.length === 0) {
      if (selectedId) setSelectedId(null);
    }
  }, [activeStage, groups, selectedId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load deals pipeline.
      </div>
    );
  }

  const selectedDeal = deals.find((d) => d.id === selectedId) || (selectedDetail?.id === selectedId ? selectedDetail : null);
  const changeStagePage = (stage, page) => setPageByStage(current => ({ ...current, [stage]: page }));
  const openEditDeal = () => {
    if (!selectedDeal) return;
    const storedBucket = selectedDeal.forecastBucket || '';
    const normalizedBucket = storedBucket.toUpperCase();
    const forecastBucket = ['PIPELINE', 'COMMIT', 'BEST_CASE'].includes(normalizedBucket) ? normalizedBucket : (storedBucket || 'PIPELINE');
    setEditForm({ name: selectedDeal.name, value: String(moneyToMajor(selectedDeal.value)), stage: selectedDeal.stage, closeDate: selectedDeal.closeDate?.slice(0, 10) || '', winProbability: selectedDeal.winProbability == null ? '' : String(selectedDeal.winProbability), forecastBucket });
    setEditDealOpen(true);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-surface-raised">

      <TopBarActions>
        <div className="flex items-center gap-2">
          {/* Table Search (~240px, 36px high, matching search style) */}
          <div className="relative">
            <Search size={14} className="absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={event => { setSearch(event.target.value); setPageByStage(Object.fromEntries(STAGE_ORDER.map(stage => [stage, 1]))); }}
              placeholder="Search..."
              className="w-[240px] h-9 ps-9 pe-3 text-sm bg-surface-muted"
            />
          </div>

          {/* New Deal button (36px high) */}
          <Button
            type="button"
            disabled={!canWrite}
            onClick={openNewDealDialog}
            title={!canWrite ? 'Requires the ADMIN role' : undefined}
            className="h-9 px-4 text-sm font-semibold"
          >
            New Deal
          </Button>
        </div>
      </TopBarActions>

      {/* ── Main Workspace ── */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-w-0 flex flex-col p-6 pt-4 gap-4">
          {/* 4) STAGE CARDS ROW (Switcher) - All 5 in one row */}
          <div className="grid grid-cols-[repeat(5,minmax(150px,1fr))] min-[1100px]:grid-cols-[repeat(5,minmax(0,1fr))] gap-2 shrink-0 overflow-x-auto min-[1100px]:overflow-visible [scrollbar-width:thin]">
            {groups.map(group => (
              <StageSwitcherCard
                key={group.stage}
                stage={group.stage}
                group={group}
                isActive={activeStage === group.stage}
                onSelect={handleStageSelect}
              />
            ))}
          </div>

          {/* 2) TWO-COLUMN AREA (grid: 1fr 380px, align-items: start, gap 16) */}
          <div className="grid grid-cols-1 min-[1100px]:grid-cols-[1fr_380px] items-start gap-4 min-w-0">
            {/* 5) LIST PANE CARD */}
            <div
              data-testid="deals-list-card"
              className="rounded-[12px] border border-border-default bg-surface-raised flex flex-col min-w-0 overflow-hidden"
            >
              {/* Column Header (outside scroll area, fixed height) */}
              <div
                className="grid items-center border-b border-border-default bg-surface-muted/90 backdrop-blur-xs text-[11px] font-semibold uppercase text-muted tracking-[0.06em] shrink-0 h-10 min-h-[40px] px-5 gap-x-3"
                style={{
                  gridTemplateColumns: 'minmax(240px, 1fr) 120px 130px',
                }}
              >
                <div className="text-start">DEAL NAME</div>
                <div className="text-start">STAGE</div>
                <div className="text-end">VALUE</div>
              </div>

              {/* Group header bar */}
              <div
                className="grid items-center bg-surface-muted/90 backdrop-blur-xs border-b border-border-default h-9 min-h-[36px] px-5 gap-x-3 text-[11px] font-semibold text-muted uppercase tracking-[0.06em] shrink-0"
                style={{
                  gridTemplateColumns: 'minmax(240px, 1fr) 120px 130px',
                }}
              >
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getStageDotColor(activeGroup.stage)}`} aria-hidden="true" />
                  <span className="truncate">
                    {STAGE_LABELS[activeGroup.stage].toUpperCase()} - {activeTotal} {activeTotal === 1 ? 'DEAL' : 'DEALS'}
                  </span>
                </div>
                <div className="text-end">
                  <span className="text-[13px] font-semibold text-body tabular-nums whitespace-nowrap">
                    {formatMoney(activeTotalValue || 0)}
                  </span>
                </div>
              </div>

              {/* Active Stage Deals */}
              <div
                ref={listPaneRef}
                className="min-w-0"
              >
                {activeGroup.deals.map(deal => (
                  <ListDealRow
                    key={deal.id}
                    deal={deal}
                    selected={selectedId === deal.id}
                    onSelect={selectDeal}
                    disabled={stageMutation.isPending || !canWrite}
                  />
                ))}
                {activeGroup.deals.length === 0 && (
                  <div className="py-12 flex items-center justify-center text-[13px] text-muted">
                    No deals in this stage
                  </div>
                )}
              </div>

              {/* Pagination footer: pinned at bottom of card */}
              <div className="flex items-center justify-between border-t border-border-subtle bg-surface-raised min-h-[36px] h-9 px-5 text-xs text-muted shrink-0">
                <span>Showing {activeFirst}–{activeLast} of {activeTotal}</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activePage <= 1}
                    onClick={() => changeStagePage(activeGroup.stage, activePage - 1)}
                    className="h-6 px-2 text-xs"
                  >
                    Previous
                  </Button>
                  <span>Page {activePage} of {activePages}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activePage >= activePages}
                    onClick={() => changeStagePage(activeGroup.stage, activePage + 1)}
                    className="h-6 px-2 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            {/* 6) DETAIL PANEL: natural content height, sticky on >= 1100px */}
            <aside
              role="complementary"
              aria-label="Deal details"
              className="w-full min-[1100px]:w-[380px] min-[1100px]:shrink-0 min-[1100px]:sticky min-[1100px]:top-4 self-start rounded-[12px] border border-border-default bg-surface-raised p-5 flex flex-col space-y-4"
            >
              <DetailPanel
                deal={selectedDeal}
                canWrite={canWrite}
                onOpenActivity={openActivityDialog}
                onEdit={openEditDeal}
                onDelete={() => setDeleteConfirmOpen(true)}
                onStageChange={moveDealToStage}
                stageError={stageError}
                activitiesLoading={activitiesLoading}
                activitiesError={activitiesError}
                activityData={activityData}
                activityPage={activityPage}
                onActivityPageChange={setActivityPage}
                showCloseButton={false}
              />
            </aside>
          </div>
        </div>
      </DndContext>

      {/* New Deal Dialog */}
      <FormDialog
        open={newDealOpen}
        onClose={() => setNewDealOpen(false)}
        title="New Deal"
        subtitle="Add a deal to the pipeline."
        confirmLabel="Create deal"
        busy={createMutation.isPending}
        onConfirm={submitNewDeal}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="new-deal-name" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Deal name</label>
            <Input
              id="new-deal-name"
              type="text"
              value={dealForm.name}
              onChange={(event) => {
                setDealForm((f) => ({ ...f, name: event.target.value }));
                if (formError) setFormError(null);
              }}
              placeholder="e.g. Acme Corp renewal"
              className="bg-surface-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-deal-value" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Value</label>
              <Input
                id="new-deal-value"
                type="number"
                min="0"
                step="0.01"
                value={dealForm.value}
                onChange={(event) => setDealForm((f) => ({ ...f, value: event.target.value }))}
                placeholder="12500"
                className="bg-surface-muted"
              />
            </div>
            <div>
              <label htmlFor="new-deal-stage" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Stage</label>
              <select
                id="new-deal-stage"
                value={dealForm.stage}
                onChange={(event) => setDealForm((f) => ({ ...f, stage: event.target.value }))}
                className="w-full h-9 px-3 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                {CREATE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-deal-close-date" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Close date</label>
              <Input
                id="new-deal-close-date"
                type="date"
                value={dealForm.closeDate}
                onChange={(event) => setDealForm((f) => ({ ...f, closeDate: event.target.value }))}
                className="bg-surface-muted"
              />
            </div>
            <div>
              <label htmlFor="new-deal-win-probability" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Win probability</label>
              <Input
                id="new-deal-win-probability"
                type="number"
                min="0"
                max="100"
                step="1"
                value={dealForm.winProbability}
                onChange={(event) => setDealForm((f) => ({ ...f, winProbability: event.target.value }))}
                placeholder="0-100"
                className="bg-surface-muted"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-deal-forecast-bucket" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Forecast category</label>
            <select
              id="new-deal-forecast-bucket"
              value={dealForm.forecastBucket}
              onChange={(event) => setDealForm((f) => ({ ...f, forecastBucket: event.target.value }))}
              className="w-full h-9 px-3 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              <option value="PIPELINE">Pipeline</option>
              <option value="COMMIT">Commit</option>
              <option value="BEST_CASE">Best case</option>
            </select>
          </div>
        </div>

        {dialogError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{dialogError}</AlertDescription>
          </Alert>
        )}
      </FormDialog>

      <FormDialog
        open={editDealOpen}
        onClose={() => setEditDealOpen(false)}
        title="Edit deal"
        subtitle={selectedDeal?.name}
        busy={editMutation.isPending}
        onConfirm={() => editMutation.mutate()}
        confirmLabel="Save deal"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Deal name</label>
            <Input
              required
              value={editForm.name}
              onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Value</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editForm.value}
              onChange={event => setEditForm(current => ({ ...current, value: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Stage</label>
            <select
              value={editForm.stage}
              onChange={event => setEditForm(current => ({ ...current, stage: event.target.value }))}
              className="w-full h-9 px-3 py-1.5 rounded-input border border-border-default bg-surface-muted text-sm text-body"
            >
              {STAGE_ORDER.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Close date</label>
            <Input
              type="date"
              value={editForm.closeDate}
              onChange={event => setEditForm(current => ({ ...current, closeDate: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Win probability (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={editForm.winProbability}
              onChange={event => setEditForm(current => ({ ...current, winProbability: event.target.value }))}
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Forecast category</label>
            <select
              value={editForm.forecastBucket || ''}
              onChange={event => setEditForm(current => ({ ...current, forecastBucket: event.target.value }))}
              className="w-full h-9 px-3 py-1.5 rounded-input border border-border-default bg-surface-muted text-sm text-body"
            >
              <option value="PIPELINE">Pipeline</option>
              <option value="COMMIT">Commit</option>
              <option value="BEST_CASE">Best case</option>
              {editForm.forecastBucket && !['PIPELINE', 'COMMIT', 'BEST_CASE'].includes(editForm.forecastBucket.toUpperCase()) && (
                <option value={editForm.forecastBucket}>Legacy: {editForm.forecastBucket}</option>
              )}
            </select>
          </div>
        </div>
      </FormDialog>
      <FormDialog
        open={Boolean(activityDialogType)}
        onClose={() => setActivityDialogType(null)}
        title={activityDialogType === 'EMAIL' ? 'Log email' : 'Log call'}
        subtitle="Record this activity in the deal timeline. Email logging does not send an email."
        busy={activityMutation.isPending}
        onConfirm={() => { if (activityTitle.trim()) activityMutation.mutate() }}
        confirmLabel={activityDialogType === 'EMAIL' ? 'Save email activity' : 'Save call activity'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Summary</label>
            <Input
              value={activityTitle}
              onChange={event => setActivityTitle(event.target.value)}
              maxLength={160}
              required
              className="bg-surface-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Details</label>
            <Textarea
              value={activityBody}
              onChange={event => setActivityBody(event.target.value)}
              maxLength={5000}
              rows={4}
              className="resize-y bg-surface-muted"
            />
          </div>
          {activityMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {activityMutation.error?.message || 'Could not save activity.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => selectedDeal && deleteMutation.mutate(selectedDeal.id)}
        title="Delete deal?"
        description={`Are you sure you want to delete "${selectedDeal?.name}"? All associated activities and stage history will be permanently deleted.`}
        confirmLabel="Delete deal"
        busy={deleteMutation.isPending}
        danger
      />
    </div>
  );
}
