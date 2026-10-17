import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { http } from '../../lib/api/http'

function formatPrice(amount, currency) {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(numericAmount)
  } catch {
    return `${amount} ${currency}`
  }
}

export default function Pricing() {
  const plansQuery = useQuery({ queryKey: ['marketing', 'billing-plans'], queryFn: () => http.get('/billing/plans') })
  const catalog = plansQuery.data

  return (
    <MarketingPageFrame
      eyebrow="Plans and pricing"
      title="A clear view of your workspace plan"
      description="Plan names, monthly prices, seat counts, and storage limits come from the active Asas billing catalog and stay in step with the Stripe prices configured for this environment."
    >
      {plansQuery.isLoading ? (
        <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted"><Loader2 size={18} className="animate-spin" />Loading current plans…</div>
      ) : plansQuery.isError ? (
        <div role="alert" className="rounded-card border border-danger/30 bg-danger/5 p-5 text-sm text-danger">Current plans could not be loaded. Please try again later.</div>
      ) : !catalog?.enabled ? (
        <div className="rounded-card border border-border-default bg-surface-muted p-6">
          <h2 className="text-lg font-bold text-heading">Online plans are not configured</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">There are no published plan prices for this environment yet. Once monthly plans are configured, their current prices and limits will appear here.</p>
          <Link to="/register" className="mt-5 inline-flex items-center gap-2 rounded-button bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">Create an account <ArrowRight size={15} /></Link>
        </div>
      ) : catalog.items.length === 0 ? (
        <div className="rounded-card border border-border-default bg-surface-muted p-6">
          <h2 className="text-lg font-bold text-heading">No monthly plans are available</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">The billing catalog is enabled, but no active monthly plans are currently published.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {catalog.items.map(plan => (
              <article key={plan.priceId} className="flex flex-col rounded-card border border-border-default bg-surface-raised p-6 shadow-card">
                <div>
                  <h2 className="text-lg font-bold text-heading">{plan.name}</h2>
                  <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-4xl font-extrabold tracking-tight text-heading">{formatPrice(plan.amount, plan.currency)}</span>
                    <span className="text-sm text-muted">per month</span>
                  </p>
                </div>
                <ul className="mt-6 space-y-3 border-t border-border-subtle pt-5 text-sm text-body-light">
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" />Up to {plan.seatLimit} team seats</li>
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" />{plan.storageLimitGb} GB workspace storage</li>
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" />Monthly subscription, billed through Stripe</li>
                </ul>
                <Link to="/register" className="mt-7 inline-flex items-center justify-center gap-2 rounded-button bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">Get started <ArrowRight size={15} /></Link>
              </article>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted">Taxes, if applicable, are calculated by Stripe Checkout. An administrator can select or manage a subscription in Settings → Billing after creating a workspace.</p>
        </>
      )}
    </MarketingPageFrame>
  )
}
