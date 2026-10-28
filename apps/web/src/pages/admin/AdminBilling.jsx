import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CreditCard, ExternalLink, ReceiptText, TrendingUp, TriangleAlert } from 'lucide-react'
import { platformApi } from '../../lib/api/platform'
import { formatMoney } from '../../lib/format'
import {
  AdminEmptyState,
  AdminError,
  AdminKpiCard,
  AdminLoading,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/ui'

function dateLabel(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminBilling() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['platform', 'billing'], queryFn: platformApi.billing })

  if (query.isLoading) return <AdminLoading label="Loading billing..." />
  if (query.isError || !query.data) return <AdminError message={query.error?.message} onRetry={() => query.refetch()} />

  const { summary, subscriptions, invoices } = query.data
  const currency = summary.currency

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Billing"
        description="Subscriptions and invoices across every workspace. Paid plan changes, refunds, and cancellations stay in Stripe."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard label="Active subscriptions" value={summary.activeSubscriptions.toLocaleString()} detail="Latest local subscription per workspace" icon={CreditCard} tone="emerald" />
        <AdminKpiCard label="Past due" value={summary.pastDueSubscriptions.toLocaleString()} detail="Subscriptions in the grace period" icon={TriangleAlert} tone={summary.pastDueSubscriptions ? 'rose' : 'slate'} />
        <AdminKpiCard label="MRR" value={formatMoney(summary.mrr, { currency })} detail="Active local subscriptions only" icon={TrendingUp} tone="emerald" />
        <AdminKpiCard label="Invoiced total" value={formatMoney(summary.invoiceTotal, { currency })} detail={`${summary.invoiceCount.toLocaleString()} local invoice records`} icon={ReceiptText} tone="slate" />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-heading">Subscriptions</h2>
          <p className="mt-0.5 text-xs text-muted">Click a workspace to inspect its plan and usage.</p>
        </div>
        {subscriptions.length === 0 ? (
          <div className="p-4"><AdminEmptyState icon={CreditCard} title="No subscriptions recorded" description="Workspaces appear here after their first billing record is created." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Monthly</th>
                  <th className="px-4 py-3">Renews</th>
                  <th className="px-4 py-3">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {subscriptions.map(row => (
                  <tr key={row.id} className="cursor-pointer hover:bg-white/70" onClick={() => navigate(`/admin/workspaces/${row.tenantId}`)}>
                    <td className="px-4 py-3 font-semibold text-heading">{row.tenantName}</td>
                    <td className="px-4 py-3 text-body">{row.planName}</td>
                    <td className="px-4 py-3"><AdminStatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-heading">{formatMoney(row.priceMonthly, { currency: row.currency })}</td>
                    <td className="px-4 py-3 text-muted">{dateLabel(row.renewsOn)}</td>
                    <td className="px-4 py-3">
                      {row.stripeSubscriptionId ? (
                        <a
                          href={`https://dashboard.stripe.com/subscriptions/${row.stripeSubscriptionId}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={event => event.stopPropagation()}
                          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                        >
                          Open <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-muted">Local</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/65 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-heading">Recent invoices</h2>
          <p className="mt-0.5 text-xs text-muted">Local billing records; Stripe remains the source of truth.</p>
        </div>
        {invoices.length === 0 ? (
          <div className="p-4"><AdminEmptyState icon={ReceiptText} title="No invoices recorded" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-border-subtle bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {invoices.map(row => (
                  <tr key={row.id} className="hover:bg-white/70">
                    <td className="px-4 py-3 text-muted">{dateLabel(row.date)}</td>
                    <td className="px-4 py-3 font-medium text-heading">{row.tenantName}</td>
                    <td className="px-4 py-3 text-body">{row.description}</td>
                    <td className="px-4 py-3"><AdminStatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-heading">{formatMoney(row.amount, { currency: row.currency })}</td>
                    <td className="px-4 py-3">
                      {row.stripeInvoiceId ? (
                        <a href={`https://dashboard.stripe.com/invoices/${row.stripeInvoiceId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                          Open <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-muted">Local</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
