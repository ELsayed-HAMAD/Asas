import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CreditCard,
  ExternalLink,
  Layers,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { formatMoney } from '../../lib/format'
import { PLATFORM_PLANS } from '../../../../../packages/contracts/src/billing/catalog.ts'
import FormDialog from '../../components/common/FormDialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  AdminError,
  AdminKpiCard,
  AdminLoading,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/ui'

const STRIPE_DASHBOARD = 'https://dashboard.stripe.com'

function dateLabel(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminWorkspaceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [statusDialog, setStatusDialog] = useState(null)
  const [statusReason, setStatusReason] = useState('')
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('free')
  const [actionError, setActionError] = useState('')

  const query = useQuery({
    queryKey: ['platform', 'workspace', id],
    queryFn: () => platformApi.workspace(id),
    enabled: Boolean(id),
  })

  const statusMutation = useMutation({
    mutationFn: ({ status, reason }) => platformApi.updateWorkspaceStatus(id, { status, reason }),
    onSuccess: async () => {
      setStatusDialog(null)
      setStatusReason('')
      setActionError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform', 'workspace', id] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'audit'] }),
      ])
    },
    onError: error => setActionError(error?.message || 'The workspace status could not be changed.'),
  })

  const planMutation = useMutation({
    mutationFn: planId => platformApi.compPlan(id, planId),
    onSuccess: async () => {
      setPlanDialogOpen(false)
      setActionError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform', 'workspace', id] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'billing'] }),
        queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] }),
        // The console and workspace can share one browser query cache. Mark workspace data
        // stale so billing and entitlement surfaces refetch the new comp plan on navigation.
        queryClient.invalidateQueries({ queryKey: ['asas'] }),
      ])
    },
    onError: error => setActionError(error?.message || 'The plan could not be updated.'),
  })

  if (query.isLoading) return <AdminLoading label="Loading workspace..." />
  if (query.isError || !query.data) {
    return <AdminError message={query.error?.message} onRetry={() => query.refetch()} />
  }

  const { workspace, subscription, members, footprint, recentAudit } = query.data
  const currency = subscription?.currency || workspace.currency
  const isStripeManaged = Boolean(subscription?.stripeSubscriptionId)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/admin/workspaces" className="inline-flex items-center gap-1 hover:text-heading">
          <ArrowLeft size={13} /> Workspaces
        </Link>
        <span>/</span>
        <span className="font-medium text-heading">{workspace.name}</span>
      </div>

      <AdminPageHeader
        title={workspace.name}
        description={`${workspace.slug} · Created ${dateLabel(workspace.createdAt)} · ${workspace.onboardingStatus.replaceAll('_', ' ').toLowerCase()}`}
        actions={(
          <>
            <Button
              type="button"
              variant={workspace.status === 'SUSPENDED' ? 'default' : 'outline'}
              onClick={() => { setStatusReason(''); setStatusDialog(workspace.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED') }}
              className="rounded-full"
            >
              {workspace.status === 'SUSPENDED' ? 'Reactivate workspace' : 'Suspend workspace'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedPlan(PLATFORM_PLANS.find(plan => plan.name === workspace.planName)?.id || 'free')
                setPlanDialogOpen(true)
              }}
              className="rounded-full"
            >
              Change plan
            </Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusBadge status={workspace.status} />
        {subscription && <AdminStatusBadge status={subscription.status} />}
        {isStripeManaged && (
          <a
            href={`${STRIPE_DASHBOARD}/subscriptions/${subscription.stripeSubscriptionId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-white/70 px-3 py-1 text-[11px] font-semibold text-body hover:bg-white"
          >
            <ExternalLink size={12} /> Managed by Stripe
          </a>
        )}
        {workspace.suspendedReason && (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-800">
            {workspace.suspendedReason}
          </span>
        )}
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard label="Plan" value={workspace.planName} detail={subscription ? `${formatMoney(subscription.priceMonthly, { currency })} / month` : 'No subscription recorded'} icon={CreditCard} />
        <AdminKpiCard label="Seats" value={`${workspace.seatsUsed} / ${workspace.seatLimit}`} detail="Active members against the plan limit" icon={Users} tone="slate" />
        <AdminKpiCard label="Storage" value={workspace.storageUsedGb == null ? 'Not measured' : `${workspace.storageUsedGb.toFixed(1)} GB`} detail={`Limit ${subscription?.storageLimitGb ?? 5} GB`} icon={Layers} tone="slate" />
        <AdminKpiCard label="Members" value={members.length.toLocaleString()} detail={members.length >= 25 ? 'Showing the first 25 members' : 'All members shown'} icon={Building2} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-heading">Workspace profile</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div><dt className="text-muted">Workspace ID</dt><dd className="mt-0.5 font-mono text-[10px] text-body">{workspace.id}</dd></div>
            <div><dt className="text-muted">Timezone</dt><dd className="mt-0.5 font-medium text-heading">{workspace.timezone}</dd></div>
            <div><dt className="text-muted">Currency</dt><dd className="mt-0.5 font-medium text-heading">{workspace.currency}</dd></div>
            <div><dt className="text-muted">Support email</dt><dd className="mt-0.5 truncate font-medium text-heading">{workspace.supportEmail || 'Not provided'}</dd></div>
            <div><dt className="text-muted">Suspended</dt><dd className="mt-0.5 font-medium text-heading">{dateLabel(workspace.suspendedAt)}</dd></div>
            <div><dt className="text-muted">Onboarding</dt><dd className="mt-0.5 font-medium text-heading">{workspace.onboardingStatus.replaceAll('_', ' ').toLowerCase()}</dd></div>
          </dl>
        </section>

        <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-heading">Subscription</h2>
          {subscription ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><dt className="text-muted">Plan</dt><dd className="mt-0.5 font-medium text-heading">{subscription.planName}</dd></div>
              <div><dt className="text-muted">Price</dt><dd className="mt-0.5 font-medium text-heading">{formatMoney(subscription.priceMonthly, { currency })} / month</dd></div>
              <div><dt className="text-muted">Status</dt><dd className="mt-0.5"><AdminStatusBadge status={subscription.status} /></dd></div>
              <div><dt className="text-muted">Renews</dt><dd className="mt-0.5 font-medium text-heading">{dateLabel(subscription.renewsOn)}</dd></div>
              <div><dt className="text-muted">Seats</dt><dd className="mt-0.5 font-medium text-heading">{subscription.seatsUsed} used / {subscription.seatLimit} limit</dd></div>
              <div><dt className="text-muted">Storage limit</dt><dd className="mt-0.5 font-medium text-heading">{subscription.storageLimitGb} GB</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-xs text-muted">No subscription has been recorded for this workspace yet.</p>
          )}
          {isStripeManaged && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
              This subscription is billed by Stripe. Paid plan changes, refunds, and cancellations stay in Stripe.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-[24px] border border-white/80 bg-white/65 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-heading">Workspace footprint</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(footprint).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-border-default bg-white/65 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="mt-1.5 text-lg font-semibold tabular-nums text-heading">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-heading">Members</h2>
              <p className="mt-0.5 text-xs text-muted">Read-only workspace membership.</p>
            </div>
            <ShieldCheck size={16} className="text-muted" />
          </div>
          <div className="divide-y divide-border-subtle">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-heading">{member.name}</p>
                  <p className="truncate text-[11px] text-muted">{member.email}</p>
                </div>
                <div className="text-right">
                  <AdminStatusBadge status={member.role} />
                  <p className="mt-1 text-[10px] text-muted">Joined {dateLabel(member.createdAt)}</p>
                </div>
              </div>
            ))}
            {members.length === 0 && <p className="px-5 py-8 text-center text-xs text-muted">This workspace has no members.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-sm font-semibold text-heading">Recent workspace audit</h2>
            <p className="mt-0.5 text-xs text-muted">Latest tenant-scoped actions.</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {recentAudit.map(item => (
              <div key={item.id} className="px-5 py-3 text-xs">
                <p className="font-semibold text-heading">{item.action}</p>
                <p className="mt-0.5 text-[10px] text-muted">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {recentAudit.length === 0 && <p className="px-5 py-8 text-center text-xs text-muted">No audit entries recorded yet.</p>}
          </div>
        </section>
      </div>

      <FormDialog
        open={Boolean(statusDialog)}
        onClose={() => { setStatusDialog(null); setStatusReason(''); setActionError('') }}
        title={statusDialog === 'SUSPENDED' ? 'Suspend workspace' : 'Reactivate workspace'}
        subtitle={statusDialog === 'SUSPENDED'
          ? 'Every workspace API call will be blocked immediately, including reads. Sign-in remains available so the notice can be shown.'
          : 'Restore normal workspace access for all members.'}
        confirmLabel={statusDialog === 'SUSPENDED' ? 'Suspend workspace' : 'Reactivate workspace'}
        confirmVariant={statusDialog === 'SUSPENDED' ? 'danger' : 'primary'}
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate({
          status: statusDialog,
          reason: statusDialog === 'SUSPENDED' ? (statusReason.trim() || 'Suspended by a platform administrator') : undefined,
        })}
        error={actionError || undefined}
      >
        {statusDialog === 'SUSPENDED' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="workspace-suspend-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">Reason</label>
              <Input
                id="workspace-suspend-reason"
                value={statusReason}
                onChange={event => setStatusReason(event.target.value)}
                placeholder="For example: unpaid balance or security review"
                maxLength={500}
                className="w-full bg-surface-muted"
              />
            </div>
            <p className="text-xs leading-5 text-muted">This is recorded in the platform audit log and shown to the workspace owner.</p>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={planDialogOpen}
        onClose={() => { setPlanDialogOpen(false); setActionError('') }}
        title="Change workspace plan"
        subtitle="This applies a local comp plan. Paid Stripe subscriptions cannot be changed here."
        confirmLabel="Apply plan"
        busy={planMutation.isPending}
        isConfirmDisabled={isStripeManaged}
        onConfirm={() => planMutation.mutate(selectedPlan)}
        error={actionError || undefined}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="workspace-plan" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">Plan</label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan} disabled={isStripeManaged}>
              <SelectTrigger id="workspace-plan" className="w-full bg-surface-muted text-heading">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_PLANS.map(plan => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isStripeManaged ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              This workspace has a Stripe subscription. Change the paid plan in Stripe so billing and access stay aligned.
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted">The new seat and storage limits apply immediately. Existing members above the new limit remain until the next membership change.</p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
