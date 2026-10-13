import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CreditCard, Loader2, ReceiptText, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import TopBarActions from '../../../components/TopBarActions'
import SettingsTabs from './SettingsTabs'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'
import QueryState from '../../../components/common/QueryState'

function money(amount, currency) {
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
  const [searchParams] = useSearchParams()
  const billingQuery = useQuery({ queryKey: queryKeys.settings.billing(), queryFn: settingsApi.getBilling })
  const plansQuery = useQuery({ queryKey: [...queryKeys.settings.billing(), 'plans'], queryFn: settingsApi.getBillingPlans })
  const subscription = billingQuery.data?.subscriptions?.find(item => item.status === 'ACTIVE') ?? billingQuery.data?.subscriptions?.[0]
  const checkout = useMutation({
    mutationFn: settingsApi.createBillingCheckout,
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const portal = useMutation({
    mutationFn: settingsApi.createBillingPortal,
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const notice = useMemo(() => {
    if (searchParams.get('checkout') === 'success') return 'Checkout completed. Your plan will update as soon as Stripe confirms the subscription.'
    if (searchParams.get('checkout') === 'cancelled') return 'Checkout was cancelled. No plan change was made.'
    return ''
  }, [searchParams])
  const error = checkout.error?.message || portal.error?.message || ''

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface">
      <TopBarActions>
        <div className="flex items-center gap-3">
          {plansQuery.data?.enabled && billingQuery.data?.stripePortalAvailable && (
            <button
              type="button"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              className="inline-flex items-center gap-2 rounded-input border border-border-default bg-surface-raised px-4 py-2 text-sm font-semibold text-heading hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
            >
              {portal.isPending ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              Manage billing
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </TopBarActions>

      <SettingsTabs />

      <main className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-6xl space-y-7">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Workspace billing</p>
            <h1 className="mt-2 text-2xl font-bold text-heading">Plans and invoices</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body-light">Manage the plan attached to this workspace. Payments are handled on Stripe’s hosted checkout and billing portal.</p>
          </header>

          {notice && <div role="status" className="rounded-card-sm border border-border-default bg-surface-raised px-4 py-3 text-sm text-heading">{notice}</div>}
          {error && <div role="alert" className="rounded-card-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

          <section aria-labelledby="current-plan-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-card-sm bg-accent/10 p-2.5 text-accent"><ShieldCheck size={20} /></span>
                <div>
                  <h2 id="current-plan-title" className="text-lg font-bold text-heading">Current plan</h2>
                  <QueryState isLoading={billingQuery.isLoading} isError={billingQuery.isError} error={billingQuery.error} isEmpty={!subscription} emptyTitle="No paid plan yet" emptyDescription="Choose a workspace plan below to start a subscription.">
                    {subscription && <>
                      <p className="mt-1 text-sm font-semibold text-heading">{subscription.planName} <span className="font-normal text-body-light">· {subscription.status.toLowerCase().replace('_', ' ')}</span></p>
                      <p className="mt-1 text-sm text-body-light">{money(subscription.priceMonthly, subscription.currency || 'USD')} / month · {subscription.seatsUsed} of {subscription.seatLimit} seats · {storageLabel(subscription.storageUsedGb)} / {subscription.storageLimitGb} GB</p>
                      {subscription.renewsOn && <p className="mt-1 text-xs text-muted">Renews {new Date(subscription.renewsOn).toLocaleDateString()}</p>}
                    </>}
                  </QueryState>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="available-plans-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="available-plans-title" className="text-lg font-bold text-heading">Available plans</h2>
                <p className="mt-1 text-sm text-body-light">Monthly prices are provided directly by Stripe.</p>
              </div>
              {plansQuery.data?.enabled && <span className="text-xs text-muted">Secure payment · Cancel or update through the billing portal</span>}
            </div>
            {plansQuery.isLoading ? <p className="py-8 text-center text-sm text-muted">Loading plans…</p>
              : plansQuery.isError ? <div role="alert" className="rounded-card-sm border border-border-default p-4 text-sm text-danger">{plansQuery.error?.message || 'Plans could not be loaded.'}</div>
                : !plansQuery.data?.enabled ? <div className="rounded-card border border-dashed border-border-default bg-surface-raised p-6 text-sm text-body-light">Online billing is not configured for this environment yet.</div>
                  : plansQuery.data.items.length === 0 ? <div className="rounded-card border border-dashed border-border-default bg-surface-raised p-6 text-sm text-body-light">No active monthly plans are configured in Stripe.</div>
                    : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plansQuery.data.items.map(plan => (
                      <article key={plan.priceId} className="flex flex-col rounded-card border border-border-default bg-surface-raised p-5 shadow-card">
                        <h3 className="text-base font-bold text-heading">{plan.name}</h3>
                        <p className="mt-3 text-3xl font-bold tracking-tight text-heading">{money(plan.amount, plan.currency)}<span className="text-sm font-medium text-body-light"> / month</span></p>
                        <p className="mt-2 text-xs text-body-light">Billed monthly. Taxes, if applicable, are calculated by Stripe Checkout.</p>
                        <p className="mt-2 text-xs font-medium text-body-light">Up to {plan.seatLimit} seats · {plan.storageLimitGb} GB storage</p>
                        <button
                          type="button"
                          onClick={() => checkout.mutate(plan.priceId)}
                          disabled={checkout.isPending || portal.isPending || subscription?.status === 'ACTIVE'}
                          className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-card hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                        >
                          {checkout.isPending ? <><Loader2 size={15} className="animate-spin" /> Opening secure checkout…</> : subscription?.status === 'ACTIVE' ? (subscription.priceId === plan.priceId ? 'Current plan' : 'Manage current plan first') : 'Choose plan'}
                        </button>
                      </article>
                    ))}</div>}
          </section>

          <section aria-labelledby="payment-methods-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="mb-4 flex items-center gap-2"><CreditCard size={18} className="text-accent" /><h2 id="payment-methods-title" className="text-lg font-bold text-heading">Payment methods</h2></div>
            {billingQuery.data?.paymentMethods?.length
              ? <div className="divide-y divide-border-default">{billingQuery.data.paymentMethods.map(method => <div key={method.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium capitalize text-heading">{method.brand} ending in {method.last4}</p><p className="mt-1 text-xs text-muted">{method.expires ? `Expires ${method.expires}` : 'Expiration not provided'}</p></div><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-body-light">Saved on Stripe</span></div>)}</div>
              : <p className="text-sm text-body-light">Saved cards will appear here after Stripe confirms them. Add or update a card through Manage billing.</p>}
          </section>

          <section aria-labelledby="invoice-history-title" className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card md:p-6">
            <div className="mb-4 flex items-center gap-2"><ReceiptText size={18} className="text-accent" /><h2 id="invoice-history-title" className="text-lg font-bold text-heading">Billing history</h2></div>
            {billingQuery.data?.invoices?.length
              ? <div className="divide-y divide-border-default">{billingQuery.data.invoices.map(invoice => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium text-heading">{invoice.description}</p><p className="mt-1 text-xs text-muted">{new Date(invoice.date).toLocaleDateString()}</p></div><div className="text-right"><p className="font-semibold text-heading">{invoice.currency ? money(invoice.amount, invoice.currency) : invoice.amount}</p><p className="mt-1 text-xs text-body-light">{invoice.status}</p></div></div>)}</div>
              : <p className="text-sm text-body-light">Invoices from Stripe will appear here after billing is connected.</p>}
          </section>
        </div>
      </main>
    </div>
  )
}
