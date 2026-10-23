import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, CreditCard, Loader2, ReceiptText, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import { settingsApi } from '../../../lib/api/settings'
import { http } from '../../../lib/api/http'
import { queryKeys } from '../../../lib/queryKeys'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { PLATFORM_PLANS } from '../../../../../../packages/contracts/src/billing/catalog.ts'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'

function money(amount, currency = 'USD') {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(numericAmount)
  } catch {
    return `${amount} ${currency}`
  }
}

function storageLabel(storageUsedGb) {
  if (storageUsedGb == null) return 'Usage unavailable'
  if (storageUsedGb < 0.001) return `${Math.round(storageUsedGb * 1_000_000)} KB used`
  if (storageUsedGb < 1) return `${(storageUsedGb * 1000).toFixed(1)} MB used`
  return `${storageUsedGb.toFixed(2)} GB used`
}

export default function SettingsBilling() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: memberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(memberRole)
  const canManageBilling = roleName === 'OWNER' || roleName === 'ADMIN'
  const billingQuery = useQuery({ queryKey: queryKeys.settings.billing(), queryFn: settingsApi.getBilling })
  const plansQuery = useQuery({ queryKey: [...queryKeys.settings.billing(), 'plans'], queryFn: settingsApi.getBillingPlans })

  const effectivePlan = billingQuery.data?.effectivePlan
  const billingLoaded = billingQuery.isSuccess && Boolean(effectivePlan)

  const checkout = useMutation({
    mutationFn: settingsApi.createBillingCheckout,
    onSuccess: ({ url }) => window.location.assign(url),
  })

  const portal = useMutation({
    mutationFn: settingsApi.createBillingPortal,
    onSuccess: ({ url }) => window.location.assign(url),
  })

  const switchPlan = useMutation({
    mutationFn: (planId) => http.post('/billing/switch-plan', { body: { planId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.billing() })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.billing(), 'plans'] })
    },
  })

  const notice = useMemo(() => {
    if (searchParams.get('checkout') === 'success') return 'Checkout completed. Your plan will update as soon as Stripe confirms the effectivePlan.'
    if (searchParams.get('checkout') === 'cancelled') return 'Checkout was cancelled. No plan change was made.'
    return ''
  }, [searchParams])

  const error = checkout.error?.message || portal.error?.message || switchPlan.error?.message || ''

  // Current active tier identifier
  const freePlan = PLATFORM_PLANS.find(plan => plan.id === 'free')
  const currentPlanName = effectivePlan?.planName.toLowerCase() ?? ''
  const isFree = currentPlanName.includes('free')

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-surface relative">
      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          {plansQuery.data?.enabled && billingQuery.data?.stripePortalAvailable && (
            <Button
              variant="outline"
              type="button"
              onClick={() => portal.mutate()}
              disabled={!canManageBilling || portal.isPending}
              title={!canManageBilling ? 'Only workspace admins and owners can manage billing' : undefined}
              className="gap-2 text-heading h-9"
            >
              {portal.isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              Manage billing
              <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      </TopBarActions>

      <SettingsTabs />

      <section className="flex-1 min-h-0 overflow-y-auto p-5 md:p-8 relative">
        <div className="mx-auto max-w-6xl space-y-7">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Workspace billing & entitlements</p>
            <h1 className="mt-2 text-2xl font-bold text-heading">Plans & subscriptions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body-light">
              Manage your enterprise subscription tier, seat allocations, and storage limits.
            </p>
          </header>

          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {billingQuery.isError && (
            <Alert variant="destructive">
              <AlertDescription>Current plan and entitlement details could not be loaded. Plan changes are disabled until billing status is available. {billingQuery.error?.message || ''}</AlertDescription>
            </Alert>
          )}
          {plansQuery.isError && (
            <Alert>
              <AlertDescription>Live billing prices could not be loaded. Showing the published plan catalog; paid checkout is unavailable until billing reconnects.</AlertDescription>
            </Alert>
          )}

          {/* Current Plan Overview Card */}
          <section aria-labelledby="current-plan-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <span className="rounded-xl bg-accent-light p-3 text-accent">
                  <ShieldCheck size={24} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id="current-plan-title" className="text-lg font-bold text-heading">
                      {effectivePlan?.planName || (billingQuery.isLoading ? 'Loading billing status…' : 'Billing status unavailable')}
                    </h2>
                    {effectivePlan && (
                      <Badge variant="outline" className={effectivePlan.billingStatus === 'ACTIVE' ? 'bg-success-light text-success-text border-success-border text-xs' : 'text-xs'}>
                        {effectivePlan.billingStatus === 'PAST_DUE' ? 'Past due · grace period' : isFree ? 'Free' : 'Active'}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-body-light">
                    {effectivePlan
                      ? `${money(effectivePlan.priceMonthly, effectivePlan.currency || 'USD')} / month`
                      : billingLoaded ? '$0 / month' : '— / month'}
                    {' · '}
                    <span className="font-semibold text-heading">{effectivePlan?.seatsUsed ?? '—'}</span> of{' '}
                    <span>{effectivePlan?.seatLimit ?? (billingLoaded ? freePlan?.seatLimit ?? '—' : '—')}</span> seats allocated
                    {' · '}
                    <span>{storageLabel(effectivePlan?.storageUsedGb)} of {effectivePlan?.storageLimitGb ?? (billingLoaded ? freePlan?.storageLimitGb ?? '—' : '—')} GB</span>
                  </p>

                  {(effectivePlan?.renewsOn || effectivePlan?.graceEndsOn) && (
                    <p className="mt-1 text-xs text-muted">{effectivePlan.billingStatus === 'PAST_DUE' ? 'Paid access grace period ends' : 'Renews'} on {new Date(effectivePlan.billingStatus === 'PAST_DUE' ? effectivePlan.graceEndsOn : effectivePlan.renewsOn).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Available Platform Tiers */}
          <section aria-labelledby="available-plans-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="available-plans-title" className="text-lg font-bold text-heading">Available platform plans</h2>
                <p className="mt-1 text-sm text-body-light">
                  Paid upgrades require configured Stripe checkout and are applied after billing confirms them.
                </p>
              </div>
            </div>

            {plansQuery.isLoading ? (
              <div className="py-8 text-center text-sm text-muted flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span>Loading available plans...</span>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {(plansQuery.data?.tiers || PLATFORM_PLANS).map((tierPlan) => {
                  const isCurrent = billingLoaded && (currentPlanName.includes(tierPlan.name.toLowerCase()) || (tierPlan.id === 'free' && isFree))
                  const checkoutPlan = (plansQuery.data?.items || []).find(item =>
                    item.seatLimit === tierPlan.seatLimit && item.storageLimitGb === tierPlan.storageLimitGb,
                  )
                  const canCheckout = Boolean(plansQuery.data?.stripeConfigured && checkoutPlan)

                  return (
                    <article
                      key={tierPlan.id}
                      className={`flex flex-col rounded-2xl border p-5 transition-all shadow-sm ${
                        isCurrent
                          ? 'border-accent bg-accent-light/30 ring-1 ring-accent'
                          : 'border-border-default bg-surface-raised hover:border-accent-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-base font-bold text-heading">{tierPlan.name}</h3>
                        {isCurrent && (
                          <Badge className="bg-primary text-on-primary text-[10px] px-2 py-0">Current</Badge>
                        )}
                      </div>

                      <p className="mt-2 text-2xl font-extrabold text-heading">
                        {tierPlan.priceMonthly === 0 ? '$0' : canCheckout ? money(checkoutPlan.amount, checkoutPlan.currency) : `$${tierPlan.priceMonthly}`}
                        <span className="text-xs font-normal text-muted ml-1">
                          {tierPlan.priceMonthly === 0 ? '/ month' : '/ month'}
                        </span>
                      </p>

                      <p className="mt-2 text-xs text-body-light leading-relaxed min-h-[36px]">
                        {tierPlan.tagline}
                      </p>

                      <div className="mt-4 pt-3 border-t border-border-subtle space-y-1.5 text-xs text-body">
                        <div className="flex items-center gap-1.5">
                          <Check size={14} className="text-success shrink-0" />
                          <span>Up to {tierPlan.seatLimit} seats</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Check size={14} className="text-success shrink-0" />
                          <span>{tierPlan.storageLimitGb} GB storage</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant={isCurrent ? 'outline' : 'default'}
                        onClick={() => {
                          if (tierPlan.id === 'free') {
                            switchPlan.mutate('free')
                          } else if (canCheckout) {
                            checkout.mutate(checkoutPlan.priceId)
                          } else {
                            return
                          }
                        }}
                        disabled={!billingLoaded || !canManageBilling || isCurrent || switchPlan.isPending || checkout.isPending || (tierPlan.id !== 'free' && !canCheckout)}
                        title={!canManageBilling ? 'Only workspace admins and owners can manage billing' : undefined}
                        className="mt-6 w-full text-xs font-semibold h-9 cursor-pointer"
                      >
                        {switchPlan.isPending ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : isCurrent ? (
                          'Active Plan'
                        ) : (
                          tierPlan.id === 'free'
                            ? 'Switch to Free'
                            : canCheckout
                              ? `Continue to checkout`
                              : 'Billing not configured'
                        )}
                      </Button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* Payment Methods */}
          <section aria-labelledby="payment-methods-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-accent" />
              <h2 id="payment-methods-title" className="text-lg font-bold text-heading">Payment methods</h2>
            </div>
            {billingQuery.data?.paymentMethods?.length ? (
              <div className="divide-y divide-border-default">
                {billingQuery.data.paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium capitalize text-heading">
                        {method.brand} ending in {method.last4}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {method.expires ? `Expires ${method.expires}` : 'Expiration not provided'}
                      </p>
                    </div>
                    <Badge variant="outline">Saved on Stripe</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-body-light">
                {isFree
                  ? 'No payment method required for the Free Starter tier.'
                  : 'Saved cards will appear here after Stripe confirms them.'}
              </p>
            )}
          </section>

          {/* Billing History */}
          <section aria-labelledby="invoice-history-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText size={18} className="text-accent" />
              <h2 id="invoice-history-title" className="text-lg font-bold text-heading">Billing history</h2>
            </div>
            {billingQuery.data?.invoices?.length ? (
              <div className="divide-y divide-border-default">
                {billingQuery.data.invoices.map((invoice) => (
                  <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium text-heading">{invoice.description}</p>
                      <p className="mt-1 text-xs text-muted">{new Date(invoice.date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-heading">{money(invoice.amount, invoice.currency)}</p>
                      <p className="mt-1 text-xs text-body-light">{invoice.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-body-light">
                {isFree
                  ? 'No past invoices. Your workspace is currently utilizing the Free Starter tier.'
                  : 'Invoices from Stripe will appear here after billing cycle runs.'}
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
