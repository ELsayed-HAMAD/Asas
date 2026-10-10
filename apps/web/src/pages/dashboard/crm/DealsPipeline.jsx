import React, { useDeferredValue, useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Mail,
  Phone,
  Pencil,
  Circle,
  Loader2
} from 'lucide-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatDate, moneyToMajor } from '../../../lib/format';
import { useActiveMemberRole } from '../../../lib/authClient';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';

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

// Avatar initials derived from the deal's (company or name) — the old rows showed a
// 2-letter monogram in the avatar box.
const initials = (deal) => {
  const source = deal.company || deal.name || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

function DraggableDealRow({ deal, selected, onSelect, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={() => onSelect(deal.id)}
      className={`grid grid-cols-12 items-center px-6 py-4 cursor-grab transition-colors ${
        selected ? 'bg-surface-raised border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
      } ${isDragging || disabled ? 'opacity-60' : ''}`}
    >
      <div className="col-span-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold bg-surface-strong text-body">
          {initials(deal)}
        </div>
        <div>
          <p className="text-sm font-bold text-heading leading-tight">{deal.name}</p>
          <p className="text-[11px] font-medium text-muted mt-0.5">{deal.company || (deal.owner?.name || 'No company')}</p>
        </div>
      </div>
      <div className="col-span-3 flex justify-center">
        <span className={`inline-flex px-3 py-1 text-[11px] font-semibold rounded-full border ${getStageBadgeColors(deal.stage)}`}>
          {STAGE_LABELS[deal.stage] || deal.stage}
        </span>
      </div>
      <div className="col-span-3 text-right">
        <span className="text-sm font-bold text-heading tabular-nums">{formatMoney(deal.value)}</span>
      </div>
    </div>
  );
}

function DealStageGroup({ group, selectedId, onSelect, disabled, onPageChange }) {
  const { setNodeRef, isOver } = useDroppable({ id: group.stage });
  const summaryKey = group.stage === 'CLOSED_WON' ? 'wonValue' : group.stage === 'CLOSED_LOST' ? 'lostValue' : 'openPipelineValue';
  const totalValue = group.summary?.[summaryKey];
  const page = group.pagination?.page ?? 1;
  const limit = group.pagination?.limit ?? 25;
  const pages = Math.max(1, group.pagination?.pages ?? 1);
  const total = group.pagination?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <div ref={setNodeRef} className={isOver ? 'bg-accent-light/40' : ''}>
      <div className="flex items-center justify-between px-6 py-2 bg-surface-muted/80 border-b border-border-default">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
          {STAGE_LABELS[group.stage]} · {total} {total === 1 ? 'Deal' : 'Deals'}
        </span>
        <span className="text-[11px] font-bold text-body-light tabular-nums">{formatMoney(totalValue)}</span>
      </div>
      <div className="divide-y divide-border-subtle">
        {group.deals.map(deal => (
          <DraggableDealRow key={deal.id} deal={deal} selected={selectedId === deal.id} onSelect={onSelect} disabled={disabled} />
        ))}
        {group.deals.length === 0 && <p className="px-6 py-4 text-center text-xs text-muted">No deals</p>}
      </div>
      {total > 0 && <div className="flex items-center justify-between border-t border-border-subtle px-6 py-2 text-xs text-muted">
        <span>Showing {first}–{last} of {total}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(group.stage, page - 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPageChange(group.stage, page + 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>}
    </div>
  );
}

export default function DealsPipeline() {
  const [selectedId, setSelectedId] = useState(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [editDealOpen, setEditDealOpen] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_DEAL_FORM)
  const [dealForm, setDealForm] = useState(EMPTY_DEAL_FORM);
  const [formError, setFormError] = useState(null);
  // { id, message } so a failed stage move is shown only under the deal it failed for.
  const [stageError, setStageError] = useState(null);
  const [activityDialogType, setActivityDialogType] = useState(null);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityBody, setActivityBody] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [search, setSearch] = useState('');
  const [pageByStage, setPageByStage] = useState(() => Object.fromEntries(STAGE_ORDER.map(stage => [stage, 1])));
  const deferredSearch = useDeferredValue(search.trim());
  const pageLimit = 25;

  // Deal writes are ADMIN-only server-side (`deal.write` permission); the controls below are
  // rendered disabled for non-OWNER/ADMIN members with a hint explaining why.
  const { data: activeMemberRole } = useActiveMemberRole();
  const canWrite = activeMemberRole === 'OWNER' || activeMemberRole === 'ADMIN';

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
  const activityDealId = selectedId ?? deals[0]?.id ?? null;
  const { data: activityData, isLoading: activitiesLoading, isError: activitiesError } = useQuery({
    queryKey: queryKeys.crm.deals.activities(activityDealId, { page: activityPage, limit: 10 }),
    queryFn: () => crmApi.listDealActivities(activityDealId, { page: activityPage, limit: 10 }),
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
    onSuccess: () => { invalidateCrmDeals(); setEditDealOpen(false) },
  })
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
    moveDealToStage(deal, event.over.id);
  };

  const openActivityDialog = type => {
    setActivityDialogType(type)
    setActivityTitle('')
    setActivityBody('')
    activityMutation.reset()
  }
  const selectDeal = id => { setSelectedId(id); setActivityPage(1) }

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

  // Keep every stage visible so an empty column is still a valid drop target.
  const groups = STAGE_ORDER.map((stage, index) => ({
    stage,
    deals: stageQueries[index]?.data?.items ?? [],
    pagination: stageQueries[index]?.data?.pagination,
    summary: stageQueries[index]?.data?.summary,
  }));

  const firstDeal = groups.find(group => group.deals.length > 0)?.deals[0] || null;
  const effectiveSelectedId = selectedId || (firstDeal ? firstDeal.id : null);
  const selectedDeal = deals.find((d) => d.id === effectiveSelectedId) || (selectedDetail?.id === effectiveSelectedId ? selectedDetail : null);
  const changeStagePage = (stage, page) => setPageByStage(current => ({ ...current, [stage]: page }));
  const openEditDeal = () => {
    if (!selectedDeal) return
    const storedBucket = selectedDeal.forecastBucket || ''
    const normalizedBucket = storedBucket.toUpperCase()
    const forecastBucket = ['PIPELINE', 'COMMIT', 'BEST_CASE'].includes(normalizedBucket) ? normalizedBucket : (storedBucket || 'PIPELINE')
    setEditForm({ name: selectedDeal.name, value: String(moneyToMajor(selectedDeal.value)), stage: selectedDeal.stage, closeDate: selectedDeal.closeDate?.slice(0, 10) || '', winProbability: selectedDeal.winProbability == null ? '' : String(selectedDeal.winProbability), forecastBucket })
    setEditDealOpen(true)
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => { setSearch(event.target.value); setPageByStage(Object.fromEntries(STAGE_ORDER.map(stage => [stage, 1]))) }}
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div className="flex items-center border border-border-default rounded-input overflow-hidden bg-surface-muted">
            <button className="p-1.5 text-caption hover:text-body hover:bg-surface-raised transition-colors border-r border-border-default">
              <LayoutGrid size={16} />
            </button>
            <button className="p-1.5 text-heading bg-surface-raised shadow-card">
              <List size={16} />
            </button>
          </div>

          <button
            disabled={!canWrite}
            onClick={openNewDealDialog}
            title={!canWrite ? 'Requires the ADMIN role' : undefined}
            className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
          >
            New Deal
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Deal List Area */}
        <div className="w-[55%] flex flex-col bg-surface-raised border-r border-border-default overflow-y-auto">

          {/* Table Header */}
          <div className="grid grid-cols-12 px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0">
            <div className="col-span-6 text-[10px] font-bold text-muted uppercase tracking-wider">Deal Name</div>
            <div className="col-span-3 text-[10px] font-bold text-muted uppercase tracking-wider text-center">Stage</div>
            <div className="col-span-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Value</div>
          </div>

          <div className="flex-1 pb-10">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {groups.map(group => (
                <DealStageGroup
                  key={group.stage}
                  group={group}
                  selectedId={effectiveSelectedId}
                    onSelect={selectDeal}
                  onPageChange={changeStagePage}
                  disabled={stageMutation.isPending || !canWrite}
                />
              ))}
            </DndContext>
          </div>
        </div>

        {/* Right: Deal Detail Panel */}
        <div className="w-[45%] bg-surface-raised overflow-y-auto flex-shrink-0">

          {selectedDeal ? (
            <>
              {/* Top Section */}
              <div className="p-8 border-b border-border-default">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-button bg-primary flex items-center justify-center text-xl font-bold text-white shadow-card">
                      {initials(selectedDeal)}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-heading tracking-tight leading-tight">{selectedDeal.name}</h2>
                      <p className="text-sm text-muted mt-1">{selectedDeal.company || 'No company'} · {selectedDeal.owner?.title || 'Owner unassigned'}</p>
                    </div>
                  </div>
                  <button className="text-caption hover:text-body transition-colors">
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                <div className="mb-8">
                  <p className="text-4xl font-extrabold text-[#2563eb] tracking-tight tabular-nums">{formatMoney(selectedDeal.value)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => openActivityDialog('EMAIL')} disabled={!canWrite} title={!canWrite ? 'Requires the ADMIN role' : 'Record an email activity'} className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Mail size={16} className="text-muted" /> Log Email
                  </button>
                  <button onClick={() => openActivityDialog('CALL')} disabled={!canWrite} title={!canWrite ? 'Requires the ADMIN role' : 'Record a call activity'} className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Phone size={16} className="text-muted" /> Log Call
                  </button>
                  <button onClick={openEditDeal} disabled={!canWrite} title={!canWrite ? 'Requires the ADMIN role' : 'Edit deal'} className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Pencil size={16} className="text-muted" /> Edit
                  </button>
                </div>

                {/* Stage move — a select is the faithful equivalent of the old page's per-stage actions */}
                <div className="mt-6 flex items-center gap-3">
                  <label htmlFor="deal-stage" className="w-14 flex-shrink-0 text-[10px] font-bold text-muted uppercase tracking-wider">Stage</label>
                  <select
                    id="deal-stage"
                    value={selectedDeal.stage}
                    onChange={(event) => moveDealToStage(selectedDeal, event.target.value)}
                    disabled={!canWrite || stageMutation.isPending}
                    title={!canWrite ? 'Requires the ADMIN role' : undefined}
                    className="flex-1 px-3 py-2 text-sm font-medium text-body border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-60"
                  >
                    {STAGE_ORDER.map((stage) => (
                      <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                    ))}
                  </select>
                </div>
                {stageError && stageError.id === selectedDeal.id && (
                  <p className="mt-3 text-xs font-medium text-danger">
                    {stageError.message}
                  </p>
                )}
              </div>

              {/* Win Probability Section */}
              <div className="p-8 border-b border-border-default">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-5">Win Probability</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-heading">{selectedDeal.winProbability == null ? '—' : `${Math.round(selectedDeal.winProbability)}%`}</span>
                  <span className="text-[11px] font-medium text-muted">
                    {selectedDeal.closeDate ? `Closing ${formatDate(selectedDeal.closeDate, { month: 'short', day: 'numeric' })}` : 'No close date'}
                  </span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${selectedDeal.winProbability ?? 0}%` }}></div>
                </div>
              </div>

              {/* Recorded deal activity */}
              <div className="p-8">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-6">Recent Activity</h3>
                {activitiesLoading ? <p className="text-sm text-muted">Loading activity…</p> : activitiesError ? <p role="alert" className="text-sm text-danger">Could not load deal activity.</p> : null}
                {!activitiesLoading && !activitiesError && (activityData?.items?.length ?? 0) === 0 && <p className="text-sm text-muted">No recent activity logged for this deal.</p>}
                {!activitiesLoading && !activitiesError && (activityData?.items?.length ?? 0) > 0 && <div className="relative pl-3 space-y-6">
                  <div className="absolute left-[19px] top-2 bottom-4 w-px bg-surface-strong"></div>
                  {activityData.items.map(activity => <div key={activity.id} className="relative z-10 flex gap-4">
                    <div className="bg-surface-raised ring-4 ring-white mt-0.5">
                      {activity.type === 'EMAIL' ? <Mail size={18} className="text-faint" /> : activity.type === 'CALL' ? <Phone size={18} className="text-faint" /> : <Circle size={18} className="text-faint" strokeWidth={2.5} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-heading">{activity.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{activity.type === 'EMAIL' ? 'Email' : activity.type === 'CALL' ? 'Call' : 'Note'} · {activity.actorName || 'Unknown author'} · {formatDate(activity.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      {activity.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-body">{activity.body}</p>}
                    </div>
                  </div>)}
                  {(activityData.pagination?.pages ?? 0) > 1 && <div className="flex items-center justify-between pt-2 text-xs text-muted">
                    <button type="button" disabled={activityPage <= 1} onClick={() => setActivityPage(page => page - 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Newer</button>
                    <span>Page {activityPage} of {activityData.pagination.pages}</span>
                    <button type="button" disabled={activityPage >= activityData.pagination.pages} onClick={() => setActivityPage(page => page + 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Older</button>
                  </div>}
                </div>}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Select a deal to view details.
            </div>
          )}

        </div>
      </div>

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
            <input
              id="new-deal-name"
              type="text"
              value={dealForm.name}
              onChange={(event) => {
                setDealForm((f) => ({ ...f, name: event.target.value }));
                if (formError) setFormError(null);
              }}
              placeholder="e.g. Acme Corp renewal"
              className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-deal-value" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Value</label>
              <input
                id="new-deal-value"
                type="number"
                min="0"
                step="0.01"
                value={dealForm.value}
                onChange={(event) => setDealForm((f) => ({ ...f, value: event.target.value }))}
                placeholder="12500"
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="new-deal-stage" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Stage</label>
              <select
                id="new-deal-stage"
                value={dealForm.stage}
                onChange={(event) => setDealForm((f) => ({ ...f, stage: event.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
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
              <input
                id="new-deal-close-date"
                type="date"
                value={dealForm.closeDate}
                onChange={(event) => setDealForm((f) => ({ ...f, closeDate: event.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="new-deal-win-probability" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Win probability</label>
              <input
                id="new-deal-win-probability"
                type="number"
                min="0"
                max="100"
                step="1"
                value={dealForm.winProbability}
                onChange={(event) => setDealForm((f) => ({ ...f, winProbability: event.target.value }))}
                placeholder="0-100"
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-deal-forecast-bucket" className="block mb-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">Forecast category</label>
            <select
              id="new-deal-forecast-bucket"
              value={dealForm.forecastBucket}
              onChange={(event) => setDealForm((f) => ({ ...f, forecastBucket: event.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              <option value="PIPELINE">Pipeline</option>
              <option value="COMMIT">Commit</option>
              <option value="BEST_CASE">Best case</option>
            </select>
          </div>
        </div>

        {dialogError && <p className="mt-4 text-sm font-medium text-danger">{dialogError}</p>}
      </FormDialog>

      <FormDialog open={editDealOpen} onClose={() => setEditDealOpen(false)} title="Edit deal" subtitle={selectedDeal?.name} busy={editMutation.isPending} onConfirm={() => editMutation.mutate()} confirmLabel="Save deal">
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Deal name<input required value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Value<input type="number" min="0" step="0.01" value={editForm.value} onChange={event => setEditForm(current => ({ ...current, value: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Stage<select value={editForm.stage} onChange={event => setEditForm(current => ({ ...current, stage: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2">{STAGE_ORDER.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></label><label className="block text-sm font-medium text-body">Close date<input type="date" value={editForm.closeDate} onChange={event => setEditForm(current => ({ ...current, closeDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Win probability (%)<input type="number" min="0" max="100" value={editForm.winProbability} onChange={event => setEditForm(current => ({ ...current, winProbability: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Forecast category<select value={editForm.forecastBucket || ''} onChange={event => setEditForm(current => ({ ...current, forecastBucket: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2"><option value="PIPELINE">Pipeline</option><option value="COMMIT">Commit</option><option value="BEST_CASE">Best case</option>{editForm.forecastBucket && !['PIPELINE', 'COMMIT', 'BEST_CASE'].includes(editForm.forecastBucket.toUpperCase()) && <option value={editForm.forecastBucket}>Legacy: {editForm.forecastBucket}</option>}</select></label></div>
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
          <label className="block text-sm font-medium text-body">Summary
            <input value={activityTitle} onChange={event => setActivityTitle(event.target.value)} maxLength={160} required className="mt-1 w-full rounded-input border border-border-default px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-body">Details
            <textarea value={activityBody} onChange={event => setActivityBody(event.target.value)} maxLength={5000} rows={4} className="mt-1 w-full resize-y rounded-input border border-border-default px-3 py-2" />
          </label>
          {activityMutation.isError && <p role="alert" className="text-sm text-danger">{activityMutation.error?.message || 'Could not save activity.'}</p>}
        </div>
      </FormDialog>
    </div>
  );
}
