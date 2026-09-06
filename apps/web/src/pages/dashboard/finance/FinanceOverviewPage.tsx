import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PayableStatus } from '@asas/contracts'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Toaster, toast } from '@/components/ui/toast'
import { financeApi } from '@/lib/api/finance.js'
import { ApiError } from '@/lib/api/http.js'
import { formatDate, formatMoney } from '@/lib/format.js'
import { downloadBlob } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys.js'

/**
 * Ports the legacy `FinanceOverview` KPI row and charts onto the real
 * `GET /finance/overview` endpoint. Every figure is a SQL aggregate the service computed over
 * the whole tenant set — no client-side sums, no `.reduce()`, and no series that a seed
 * script invented. When `cashFlow` is empty (no `CashFlowSnapshot` rows yet) the chart
 * section says so instead of plotting a projection.
 *
 * The aging card renders the plan's Phase 3 AR aging report: open receivables bucketed by
 * days past due (`current`/`1-30`/`31-60`/`60+`), one `CASE WHEN` SQL query over the whole
 * tenant set — never a status-only summary or a client-side aggregation.
 */

const PAYABLE_STATUS_META: Record<PayableStatus, { label: string; variant: 'secondary' | 'info' | 'success' | 'danger' | 'warning' }> = {
  PENDING: { label: 'Pending', variant: 'secondary' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  APPROVED: { label: 'Approved', variant: 'warning' },
  PAID: { label: 'Paid', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
}

const AGING_BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '60+': '60+ days',
}

export function FinanceOverviewPage() {
  const overview = useQuery({
    queryKey: queryKeys.finance.all(),
    queryFn: () => financeApi.getOverview(),
  })

  // The aging report — one `CASE WHEN` SQL query over the whole unpaid receivable set.
  // `limit: 1` keeps the payload tiny; only `summary` is used.
  const receivables = useQuery({
    queryKey: queryKeys.finance.receivables.list({ page: 1, limit: 1 }),
    queryFn: () => financeApi.listReceivables({ page: 1, limit: 1 }),
  })

  // The recent payables table (the PDF surface) — a page of the list, not the whole set.
  const payables = useQuery({
    queryKey: queryKeys.finance.payables.list({ page: 1, limit: 8 }),
    queryFn: () => financeApi.listPayables({ page: 1, limit: 8 }),
  })

  const data = overview.data
  const aging = receivables.data?.summary

  const cashFlow = useMemo(
    () =>
      (data?.cashFlow ?? []).map(point => ({
        month: point.month,
        inflow: point.inflow.amount,
        outflow: point.outflow.amount,
        net: point.net.amount,
      })),
    [data],
  )

  // The plan's four fixed buckets, zero-filled server-side — rendered here, never aggregated.
  const agingRows = useMemo<{ label: string; money: { amount: number; currency: string }; count: number }[]>(
    () =>
      aging?.agingBuckets
        ? aging.agingBuckets.map(bucket => ({
            label: AGING_BUCKET_LABELS[bucket.bucket] ?? bucket.bucket,
            money: bucket.total,
            count: bucket.count,
          }))
        : [],
    [aging],
  )

  // Display-only comparison scale: each bar is a share of the largest bucket, so the four are
  // visually comparable without any business meaning attached.
  const agingMax =
    agingRows.length > 0 ? Math.max(...agingRows.map(row => row.money.amount)) : 0

  const moneyTooltip = (label: string, value: number) => `${label}: ${formatMoney(value, { compact: true })}`

  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function downloadInvoice(id: string) {
    setDownloadingId(id)
    try {
      const blob = await financeApi.downloadInvoicePdf(id)
      downloadBlob(blob, `invoice-${id}.pdf`)
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Could not download the invoice',
        description: error instanceof ApiError ? error.message : 'Try again.',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Finance</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Accounts payable, receivable, and expenses — all figures computed server-side.
        </p>
      </div>

      {overview.isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the finance overview.</p>
      ) : !data ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Open payables</CardDescription>
                <CardTitle className="text-3xl">
                  {formatMoney(data.payableOutstanding, { compact: true })}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open receivables</CardDescription>
                <CardTitle className="text-3xl">
                  {formatMoney(data.receivableOutstanding, { compact: true })}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Expenses total</CardDescription>
                <CardTitle className="text-3xl">
                  {formatMoney(data.expensesTotal, { compact: true })}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Expenses pending</CardDescription>
                <CardTitle className="text-3xl">
                  {data.expensesPendingCount}
                  <span className="ml-2 text-base font-normal text-[var(--color-muted)]">
                    {formatMoney(data.expensesPendingTotal, { compact: true })}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cash flow</CardTitle>
                <CardDescription>Monthly snapshots from the cash-flow ledger.</CardDescription>
              </CardHeader>
              <CardContent>
                {cashFlow.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    No cash-flow snapshots yet. Snapshots appear once the tenant has monthly
                    ledger rows.
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cashFlow} accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                        <YAxis
                          tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                          tickFormatter={value => formatMoney(Number(value), { compact: true })}
                        />
                        <RechartsTooltip
                          formatter={(value, name) =>
                            moneyTooltip(String(name), Number(value))
                          }
                        />
                        <Legend />
                        <Bar dataKey="inflow" name="Inflow" fill="var(--color-chart-positive)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="outflow" name="Outflow" fill="var(--color-chart-negative)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="net" name="Net" fill="var(--color-chart-secondary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Receivables aging</CardTitle>
                <CardDescription>
                  Open receivables by days past due — one SQL query, aggregated server-side.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {aging ? (
                  <div className="flex h-full flex-col justify-center gap-4">
                    {agingRows.map(row => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm text-[var(--color-body)]">{row.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-chart-secondary)]"
                            style={{
                              width: `${agingMax > 0 ? (row.money.amount / agingMax) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--color-heading)]">
                          {formatMoney(row.money, { compact: true })}
                        </span>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted)]">
                          {row.count}
                        </span>
                      </div>
                    ))}
                    <p className="text-xs text-[var(--color-muted)]">
                      Open balance: {formatMoney(aging.openBalance)} across {aging.overdueCount} overdue and{' '}
                      {aging.currentCount} current invoices.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">Loading…</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent payables</CardTitle>
              <CardDescription>
                Open and recent invoices. Each row renders to a deterministic PDF on demand.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {payables.isError ? (
                <p className="text-sm text-[var(--color-danger)]">Could not load payables.</p>
              ) : payables.isLoading ? (
                <p className="text-sm text-[var(--color-muted)]">Loading…</p>
              ) : (payables.data?.items ?? []).length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">No payables yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-card-sm)] border border-[var(--color-border-default)]">
                  <table className="w-full text-sm text-left">
                    <thead className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-muted)] text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                      <tr>
                        <th className="px-4 py-3">Vendor</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-faint)]">
                      {(payables.data?.items ?? []).map(invoice => {
                        const meta = PAYABLE_STATUS_META[invoice.status]
                        return (
                          <tr key={invoice.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-[var(--color-heading)]">{invoice.vendor}</p>
                              {invoice.invoiceNumber && (
                                <p className="text-xs text-[var(--color-muted)]">{invoice.invoiceNumber}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-body)]">{formatDate(invoice.date)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={meta.variant}>{meta.label}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--color-heading)]">
                              {formatMoney(invoice.amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={downloadingId === invoice.id}
                                onClick={() => void downloadInvoice(invoice.id)}
                              >
                                <Download /> {downloadingId === invoice.id ? '…' : 'PDF'}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Toaster />
    </div>
  )
}
