import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import { inventoryApi } from '../../../lib/api/inventory'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney } from '../../../lib/format'
import { EMPTY } from '../../../lib/emptyText'
import { useActiveMemberRole, useActiveOrganization } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import TopBarActions from '../../../components/TopBarActions'
import FormDialog from '../../../components/common/FormDialog'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'

const ACCOUNT_ROLES = [
  {
    key: 'inventoryAsset',
    label: 'Inventory asset',
    kind: 'ASSET',
    description: 'Debited when stock is received and credited when it is issued. Use a dedicated control account; reconciliation includes every ledger entry posted to it.',
  },
  {
    key: 'costOfGoodsSold',
    label: 'Cost of goods sold',
    kind: 'EXPENSE',
    description: 'Debited on a sale or internal consumption; credited on a customer return.',
  },
  {
    key: 'goodsReceivedNotInvoiced',
    label: 'Goods received not invoiced',
    kind: 'LIABILITY',
    description: 'Credited on a purchase receipt. A supplier bill explicitly linked to one fully received, valued purchase order clears this account at approval; partial, multi-line, tax/freight, and price-variance matching are not supported.',
  },
  {
    key: 'adjustmentExpense',
    label: 'Adjustment expense',
    kind: 'EXPENSE',
    description: 'Damage, shrinkage, and negative count corrections.',
  },
  {
    key: 'adjustmentGain',
    label: 'Adjustment gain',
    kind: 'INCOME',
    description: 'Positive count corrections that are not customer returns.',
  },
]

const DEFAULT_CODES = {
  inventoryAsset: { code: 'INVENTORY', name: 'Inventory' },
  costOfGoodsSold: { code: 'COST_OF_GOODS_SOLD', name: 'Cost of goods sold' },
  goodsReceivedNotInvoiced: { code: 'GOODS_RECEIVED_NOT_INVOICED', name: 'Goods received not invoiced' },
  adjustmentExpense: { code: 'INVENTORY_ADJUSTMENT_EXPENSE', name: 'Inventory adjustment expense' },
  adjustmentGain: { code: 'INVENTORY_ADJUSTMENT_GAIN', name: 'Inventory adjustment gain' },
}

function blankMapping(currency = '') {
  return {
    currency,
    accounts: Object.fromEntries(
      ACCOUNT_ROLES.map(role => [role.key, { ...DEFAULT_CODES[role.key] }]),
    ),
  }
}

function mappingFromApi(mapping) {
  return {
    currency: mapping.currency,
    accounts: Object.fromEntries(
      ACCOUNT_ROLES.map(role => [role.key, {
        code: mapping.accounts[role.key].code,
        name: mapping.accounts[role.key].name,
      }]),
    ),
  }
}

function money(value, currency) {
  return formatMoney(value, { currency })
}

export default function InventoryValuation() {
  const queryClient = useQueryClient()
  const { data: activeMemberRole } = useActiveMemberRole()
  const { data: activeOrganization } = useActiveOrganization()
  const canWrite = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole))

  const [method, setMethod] = useState('FIFO')
  const [mappings, setMappings] = useState(() => [blankMapping()])
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const [setupExpanded, setSetupExpanded] = useState(false)
  const [accountInputsOpen, setAccountInputsOpen] = useState(false)
  const [reconciliationOpen, setReconciliationOpen] = useState(false)
  const [unvaluedOpen, setUnvaluedOpen] = useState(false)
  const setupAutoOpened = useRef(false)

  const [openingProduct, setOpeningProduct] = useState(null)
  const [openingCurrency, setOpeningCurrency] = useState('')
  const [openingCost, setOpeningCost] = useState('')
  const [openingAsOf, setOpeningAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [openingError, setOpeningError] = useState('')
  const [openingResult, setOpeningResult] = useState(null)

  const [unvaluedSearch, setUnvaluedSearch] = useState('')
  const [unvaluedPage, setUnvaluedPage] = useState(1)
  const UNVALUED_PAGE_SIZE = 10

  const setupQuery = useQuery({
    queryKey: queryKeys.inventory.valuationSetup(),
    queryFn: () => inventoryApi.getValuationSetup(),
  })
  const setup = setupQuery.data
  const configured = setup?.configured === true
  const postingsLocked = (setup?.valuationPostings ?? 0) > 0
  const methodLabel = setup?.costingMethod === 'WEIGHTED_AVERAGE'
    ? 'Weighted average'
    : setup?.costingMethod === 'FIFO'
      ? 'FIFO'
      : 'Not set'

  const reportQuery = useQuery({
    queryKey: queryKeys.inventory.valuationReport(),
    queryFn: () => inventoryApi.getValuationReport(),
  })
  const report = reportQuery.data

  const unvaluedQuery = useQuery({
    queryKey: queryKeys.inventory.unvaluedProducts(),
    queryFn: () => inventoryApi.listUnvaluedProducts(),
  })
  const unvaluedProducts = unvaluedQuery.data?.items ?? []
  const mappedCurrencies = useMemo(
    () => new Set((setup?.mappings ?? []).map(mapping => mapping.currency)),
    [setup],
  )

  const filteredUnvalued = useMemo(() => {
    if (!unvaluedSearch.trim()) return unvaluedProducts
    const q = unvaluedSearch.toLowerCase().trim()
    return unvaluedProducts.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    )
  }, [unvaluedProducts, unvaluedSearch])

  const totalUnvaluedPages = Math.max(1, Math.ceil(filteredUnvalued.length / UNVALUED_PAGE_SIZE))
  const pagedUnvalued = useMemo(() => {
    const start = (unvaluedPage - 1) * UNVALUED_PAGE_SIZE
    return filteredUnvalued.slice(start, start + UNVALUED_PAGE_SIZE)
  }, [filteredUnvalued, unvaluedPage])

  // Hydrate the form once from the saved policy. Later refetches must not overwrite edits the
  // operator is still making.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!setup || hydrated.current) return
    hydrated.current = true
    setMethod(setup.costingMethod ?? 'FIFO')
    if (setup.mappings.length > 0) {
      setMappings(setup.mappings.map(mappingFromApi))
    }
  }, [setup])

  useEffect(() => {
    if (!setup || setupAutoOpened.current) return
    setupAutoOpened.current = true
    setSetupExpanded(!setup.configured)
  }, [setup])

  // The workspace currency is a sensible default for the first mapping, but only fill a blank so
  // a currency the operator is typing is never replaced.
  useEffect(() => {
    const currency = activeOrganization?.currency
    if (!currency) return
    setMappings(previous => previous.map(mapping =>
      mapping.currency === '' ? { ...mapping, currency } : mapping,
    ))
  }, [activeOrganization?.currency])

  const saveMutation = useMutation({
    mutationFn: (body) => inventoryApi.saveValuationSetup(body),
    onSuccess: () => {
      setSaveError('')
      setSaved(true)
      setSetupExpanded(false)
      setAccountInputsOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
    },
    onError: (error) => {
      setSaved(false)
      setSaveError(error?.message || 'Could not save the valuation policy.')
    },
  })

  const openingMutation = useMutation({
    mutationFn: (body) => inventoryApi.openInventoryValuation(body),
    onSuccess: (result) => {
      setOpeningProduct(null)
      setOpeningCost('')
      setOpeningError('')
      setOpeningResult(result)
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
    },
    onError: (error) => setOpeningError(error?.message || 'Could not post the opening valuation.'),
  })

  const totals = useMemo(() => {
    const rows = report?.currencies ?? []
    return {
      currencies: rows.length,
      unvaluedQuantity: rows.reduce((sum, row) => sum + row.unvaluedQuantity, 0),
      unvaluedMovements: rows.reduce((sum, row) => sum + row.unvaluedMovementCount, 0),
      allReconciled: configured && rows.length > 0 && rows.every(row => row.reconciled),
    }
  }, [report, configured])

  const reconciledRows = (report?.currencies ?? []).filter(row => !row.reconciled)
  const openingQuantity = openingProduct?.unvaluedQuantity ?? 0
  const openingPreview = openingCost.trim() !== '' && Number.isFinite(Number(openingCost))
    ? Number(openingCost) * openingQuantity
    : null

  function updateMapping(index, patch) {
    setMappings(previous => previous.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)))
    setSaved(false)
  }

  function updateAccount(index, roleKey, field, value) {
    setMappings(previous => previous.map((mapping, i) => {
      if (i !== index) return mapping
      return {
        ...mapping,
        accounts: {
          ...mapping.accounts,
          [roleKey]: { ...mapping.accounts[roleKey], [field]: value },
        },
      }
    }))
    setSaved(false)
  }

  function resetToDefaultNumbering() {
    setMappings(previous => previous.map(mapping => ({
      ...mapping,
      accounts: Object.fromEntries(
        ACCOUNT_ROLES.map(role => [role.key, { ...DEFAULT_CODES[role.key] }]),
      ),
    })))
    setSaved(false)
  }

  function addCurrency() {
    setMappings(previous => [...previous, blankMapping()])
    setSaved(false)
  }

  function removeCurrency(index) {
    setMappings(previous => previous.filter((_, i) => i !== index))
    setSaved(false)
  }

  function toggleSetup() {
    const next = !setupExpanded
    setSetupExpanded(next)
    if (next) {
      window.requestAnimationFrame(() => {
        document.getElementById('valuation-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  function handleSave() {
    setSaveError('')
    const normalized = mappings.map(mapping => ({
      currency: mapping.currency.trim().toUpperCase(),
      accounts: Object.fromEntries(
        ACCOUNT_ROLES.map(role => [role.key, {
          code: mapping.accounts[role.key].code.trim(),
          name: mapping.accounts[role.key].name.trim(),
        }]),
      ),
    }))

    if (normalized.some(mapping => !/^[A-Z]{3}$/.test(mapping.currency))) {
      setSaveError('Every mapping needs a three-letter currency code, for example USD.')
      return
    }
    if (new Set(normalized.map(mapping => mapping.currency)).size !== normalized.length) {
      setSaveError('Each currency can be mapped only once.')
      return
    }
    for (const mapping of normalized) {
      const missing = ACCOUNT_ROLES.find(role => !mapping.accounts[role.key].code || !mapping.accounts[role.key].name)
      if (missing) {
        setSaveError(`${missing.label} needs both an account code and an account name in ${mapping.currency}.`)
        return
      }
      const codes = ACCOUNT_ROLES.map(role => mapping.accounts[role.key].code.toUpperCase())
      if (new Set(codes).size !== codes.length) {
        setSaveError(`Every role in ${mapping.currency} needs a distinct account code; each side of a journal must be a different account.`)
        return
      }
    }

    saveMutation.mutate({ costingMethod: method, mappings: normalized })
  }

  function openOpeningDialog(product) {
    setOpeningProduct(product)
    setOpeningCurrency(product.currency)
    setOpeningCost('')
    setOpeningAsOf(new Date().toISOString().slice(0, 10))
    setOpeningError('')
    setOpeningResult(null)
  }

  function submitOpening() {
    const cost = openingCost.trim()
    if (cost === '' || !Number.isFinite(Number(cost)) || Number(cost) <= 0) {
      setOpeningError('Enter a positive unit cost for the unvalued quantity.')
      return
    }
    if (!openingAsOf) {
      setOpeningError('Choose the date the opening position is effective.')
      return
    }
    setOpeningError('')
    openingMutation.mutate({ productId: openingProduct.id, unitCost: cost, asOf: openingAsOf })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface">
      <TopBarActions><div /></TopBarActions>

      <section className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-[1500px] space-y-4">

          <header className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-info-border bg-info-light text-info shadow-xs">
                  <Scale size={20} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-bold tracking-tight text-heading">Inventory valuation</h1>
                    <Badge
                      variant="outline"
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        configured
                          ? 'border-success-border bg-success-light text-success-text'
                          : 'border-warning-border bg-warning-light text-warning-text'
                      }`}
                    >
                      {configured ? <CheckCircle2 size={11} className="mr-1 inline" /> : <AlertTriangle size={11} className="mr-1 inline" />}
                      {configured ? 'Live' : 'Setup needed'}
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-body-light">
                    {configured
                      ? 'Stock value posts to your ledger and reconciles with the inventory control account.'
                      : 'Stock is tracked by quantity only. Set up valuation so every unit carries a real cost and the ledger can reconcile.'}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setupQuery.refetch()
                    reportQuery.refetch()
                    unvaluedQuery.refetch()
                  }}
                  disabled={setupQuery.isFetching || reportQuery.isFetching || unvaluedQuery.isFetching}
                  className="h-8.5 rounded-xl px-3 text-xs font-semibold shadow-xs"
                >
                  <RefreshCw size={13} className={(setupQuery.isFetching || reportQuery.isFetching || unvaluedQuery.isFetching) ? 'animate-spin' : ''} />
                  <span className="ml-1.5">Refresh</span>
                </Button>
                {(canWrite || setupExpanded) && (
                  <Button
                    type="button"
                    variant={configured || setupExpanded ? 'outline' : 'default'}
                    size="sm"
                    onClick={toggleSetup}
                    className="h-8.5 rounded-xl px-3.5 text-xs font-semibold"
                  >
                    {setupExpanded ? 'Hide setup' : configured ? 'Edit policy' : 'Set up valuation'}
                  </Button>
                )}
              </div>
            </div>
          </header>

          {saved && !saveError && (
            <Alert className="border-success-border bg-success-light py-2.5 text-success-text">
              <AlertDescription className="text-xs text-success-text">
                Valuation policy saved. New receipts, issues, and openings will post to these accounts.
              </AlertDescription>
            </Alert>
          )}

          {openingResult && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-success-border bg-success-light px-4 py-3 text-xs leading-relaxed text-success-text">
              <span className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <span>
                  Valued {openingResult.quantity} unit{openingResult.quantity === 1 ? '' : 's'} for{' '}
                  {money(openingResult.value, openingCurrency)}. Journal entry{' '}
                  <span className="font-semibold tabular-nums">{openingResult.journalEntryId}</span> was posted against inventory opening equity.
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 text-[11px] font-bold underline underline-offset-2"
                onClick={() => setOpeningResult(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {configured && report && !totals.allReconciled && reconciledRows.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-light px-4 py-3 text-xs leading-relaxed text-warning-text">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1">Some currencies do not reconcile. Open the report to see the difference.</span>
              <button
                type="button"
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={() => setReconciliationOpen(true)}
              >
                Review
              </button>
            </div>
          )}

          {!configured ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Layers,
                  title: '1. Choose a costing method',
                  text: 'FIFO or weighted average. You can change it until the first valuation posting.',
                },
                {
                  icon: Wallet,
                  title: '2. Map five ledger accounts',
                  text: 'Sensible default account codes are prefilled for your workspace currency.',
                },
                {
                  icon: Scale,
                  title: '3. Value existing stock',
                  text: totals.unvaluedQuantity > 0
                    ? `${totals.unvaluedQuantity.toLocaleString()} units currently have no cost.`
                    : 'Enable valuation, then value any stock that is already on hand.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-border-default bg-surface-raised/75 p-4 shadow-xs backdrop-blur-xl">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent/15 bg-accent-light text-accent">
                    <Icon size={15} />
                  </span>
                  <p className="mt-3 text-xs font-semibold text-heading">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Costing method"
                value={methodLabel}
                hint={postingsLocked ? 'Locked after the first valuation posting' : 'Can still be changed until a posting exists'}
                icon={Layers}
                tone="default"
              />
              <SummaryCard
                label="Currencies mapped"
                value={`${mappedCurrencies.size} ${mappedCurrencies.size === 1 ? 'currency' : 'currencies'}`}
                hint={`${totals.unvaluedQuantity.toLocaleString()} units without cost`}
                icon={Wallet}
                tone={totals.unvaluedQuantity > 0 ? 'warning' : 'info'}
              />
              <SummaryCard
                label="Reconciliation"
                value={totals.currencies === 0 ? 'No stock' : totals.allReconciled ? 'Reconciled' : 'Needs attention'}
                hint={totals.currencies === 0 ? 'There is no on-hand quantity to reconcile' : totals.allReconciled ? 'Stock, subledger, and ledger agree' : 'Open the report for the currency detail'}
                icon={CheckCircle2}
                tone={totals.currencies === 0 ? 'default' : totals.allReconciled ? 'success' : 'warning'}
              />
            </div>
          )}

          <section id="valuation-setup" className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card scroll-mt-4">
            <div className="border-b border-border-subtle p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-heading">Valuation policy</h2>
                  {postingsLocked && (
                    <Badge variant="outline" className="h-6 shrink-0 gap-1 px-2 text-[10px] font-semibold">
                      <Lock size={10} /> Method locked
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-body-light">
                  {configured
                    ? `${methodLabel} · ${mappedCurrencies.size} ${mappedCurrencies.size === 1 ? 'currency' : 'currencies'} mapped. Every currency posts to its own five ledger accounts.`
                    : 'Three short steps. Default account codes are ready, so you can enable valuation without an accounting setup.'}
                </p>
              </div>
            </div>

            {setupExpanded && (
              <div className="space-y-6 p-5">
                {setupQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
                    <Loader2 size={14} className="animate-spin" /> Loading valuation setup…
                  </div>
                ) : setupQuery.isError ? (
                  <Alert variant="destructive" className="py-2 px-3">
                    <AlertDescription className="text-xs text-danger">
                      {setupQuery.error?.message || 'Could not load the valuation setup.'}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {/* Step 1 — method */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-light text-[11px] font-bold text-accent">1</span>
                        <div>
                          <h3 className="text-sm font-bold text-heading">Choose a costing method</h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-body-light">
                            This decides how cost leaves inventory. You can change it until the first valuation posting.
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { value: 'FIFO', title: 'FIFO', text: 'Oldest costs leave first. Best when stock is traceable and you want exact layer costs.' },
                          { value: 'WEIGHTED_AVERAGE', title: 'Weighted average', text: 'Blends all units into one average cost. Simpler when identical items are mixed.' },
                        ].map(option => {
                          const selected = method === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              disabled={!canWrite || postingsLocked}
                              onClick={() => { setMethod(option.value); setSaved(false) }}
                              className={`rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                selected
                                  ? 'border-accent bg-accent-light ring-2 ring-accent/20'
                                  : 'border-border-default bg-surface hover:border-border-strong'
                              }`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-heading">{option.title}</span>
                                {selected && <CheckCircle2 size={16} className="text-accent" />}
                              </span>
                              <span className="mt-1 block text-[11px] leading-relaxed text-muted">{option.text}</span>
                            </button>
                          )
                        })}
                      </div>
                      {postingsLocked && (
                        <p className="text-[11px] text-muted">
                          {setup?.valuationPostings} valuation posting{(setup?.valuationPostings ?? 0) === 1 ? '' : 's'} already exist, so the method cannot change.
                        </p>
                      )}
                    </div>

                    {/* Step 2 — accounts */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-light text-[11px] font-bold text-accent">2</span>
                        <div>
                          <h3 className="text-sm font-bold text-heading">Map the ledger accounts</h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-body-light">
                            Missing accounts are created with the type shown. Defaults are prefilled; edit them if your chart of accounts uses different codes.
                          </p>
                        </div>
                      </div>

                      {mappings.map((mapping, index) => (
                        <div key={index} className="space-y-3 rounded-xl border border-border-subtle bg-surface-muted/35 p-3.5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-heading" htmlFor={`valuation-currency-${index}`}>Currency</label>
                              <Input
                                id={`valuation-currency-${index}`}
                                type="text"
                                value={mapping.currency}
                                maxLength={3}
                                onChange={(event) => updateMapping(index, { currency: event.target.value.toUpperCase() })}
                                placeholder="USD"
                                disabled={!canWrite}
                                className="mt-1 h-8.5 w-28 text-xs font-semibold uppercase tabular-nums"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted">Five accounts</span>
                              {mappings.length > 1 && canWrite && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeCurrency(index)}
                                  className="h-7 px-2 text-[11px] text-danger hover:bg-danger-light"
                                  aria-label={`Remove ${mapping.currency || 'currency'} mapping`}
                                >
                                  <Trash2 size={12} className="mr-1" /> Remove
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {ACCOUNT_ROLES.map(role => (
                              <div key={role.key} className="rounded-lg border border-border-subtle bg-surface-raised/65 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-heading">{role.label}</span>
                                  <Badge variant="outline" className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase">
                                    {role.kind}
                                  </Badge>
                                </div>
                                {accountInputsOpen ? (
                                  <div className="mt-2 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
                                    <Input
                                      type="text"
                                      value={mapping.accounts[role.key].code}
                                      maxLength={32}
                                      onChange={(event) => updateAccount(index, role.key, 'code', event.target.value.toUpperCase())}
                                      placeholder="ACCOUNT_CODE"
                                      disabled={!canWrite}
                                      aria-label={`${role.label} account code for ${mapping.currency || 'currency'}`}
                                      className="h-8 px-2 text-[11px] font-semibold tabular-nums"
                                    />
                                    <Input
                                      type="text"
                                      value={mapping.accounts[role.key].name}
                                      maxLength={120}
                                      onChange={(event) => updateAccount(index, role.key, 'name', event.target.value)}
                                      placeholder="Account name"
                                      disabled={!canWrite}
                                      aria-label={`${role.label} account name for ${mapping.currency || 'currency'}`}
                                      className="h-8 px-2 text-[11px]"
                                    />
                                  </div>
                                ) : (
                                  <p className="mt-1.5 truncate text-[11px] text-muted">
                                    <span className="font-mono text-heading">{mapping.accounts[role.key].code}</span>
                                    <span> · {mapping.accounts[role.key].name}</span>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {canWrite && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Button type="button" variant="outline" size="sm" onClick={addCurrency} className="h-8.5 rounded-xl px-3 text-xs">
                            <Plus size={14} className="mr-1" /> Add currency
                          </Button>
                          <button
                            type="button"
                            onClick={() => setAccountInputsOpen(value => !value)}
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            {accountInputsOpen ? 'Done editing codes' : 'Edit account codes'}
                          </button>
                          <button
                            type="button"
                            onClick={resetToDefaultNumbering}
                            className="text-xs font-medium text-muted hover:text-heading hover:underline"
                          >
                            Reset defaults
                          </button>
                        </div>
                      )}

                      <details className="rounded-xl border border-border-subtle bg-surface-muted/35 p-3 text-xs">
                        <summary className="cursor-pointer font-semibold text-body">What do these accounts do?</summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {ACCOUNT_ROLES.map(role => (
                            <div key={role.key}>
                              <p className="font-semibold text-heading">{role.label}</p>
                              <p className="mt-0.5 leading-relaxed text-muted">{role.description}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>

                    {/* Step 3 — save */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-light text-[11px] font-bold text-accent">3</span>
                        <div>
                          <h3 className="text-sm font-bold text-heading">{configured ? 'Review and save' : 'Enable valuation'}</h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-body-light">
                            {configured ? 'Save changes to the policy. Existing postings are never revalued.' : 'Once enabled, valued receipts, issues, and opening stock will post to these accounts.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised/65 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-heading">{method === 'WEIGHTED_AVERAGE' ? 'Weighted average' : 'FIFO'} · {mappings.length} {mappings.length === 1 ? 'currency' : 'currencies'}</p>
                          <p className="mt-0.5 text-[11px] text-muted">Five account roles per currency. Every role uses a different account.</p>
                        </div>
                        {canWrite ? (
                          <Button
                            type="button"
                            onClick={handleSave}
                            disabled={saveMutation.isPending}
                            className="h-9 rounded-xl px-4 text-xs font-semibold"
                          >
                            {saveMutation.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                            {configured ? 'Save policy' : 'Enable valuation'}
                          </Button>
                        ) : (
                          <p className="text-[11px] text-muted">Only owners and administrators can change this policy.</p>
                        )}
                      </div>
                      {saveError && (
                        <Alert variant="destructive" className="py-2 px-3">
                          <AlertDescription className="text-xs text-danger">{saveError}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {configured && (
          <section className="overflow-hidden rounded-2xl border border-border-default bg-gradient-to-b from-surface-raised to-surface-raised/80 shadow-card backdrop-blur-xl">
            <div className="border-b border-border-subtle p-5">
              <h2 className="text-base font-bold text-heading">Health checks</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Two checks confirm that stock, the subledger, and the ledger agree.
              </p>
            </div>

            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-heading">Reconciliation</h3>
                  <Badge
                    variant="outline"
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      reportQuery.isLoading
                        ? 'border-border-default bg-surface-muted text-muted'
                        : totals.currencies === 0
                          ? 'border-border-default bg-surface-muted text-muted'
                          : totals.allReconciled
                            ? 'border-success-border bg-success-light text-success-text'
                            : 'border-warning-border bg-warning-light text-warning-text'
                    }`}
                  >
                    {reportQuery.isLoading
                      ? 'Checking'
                      : totals.currencies === 0
                        ? 'No stock'
                        : totals.allReconciled
                          ? 'Reconciled'
                          : 'Needs attention'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {reportQuery.isLoading
                    ? 'Comparing stock value with the inventory control account.'
                    : totals.currencies === 0
                      ? 'This report appears once products exist in a mapped currency.'
                      : totals.allReconciled
                        ? 'Stock, subledger, and ledger agree.'
                        : 'Some currencies need attention.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReconciliationOpen(value => !value)}
                className="h-8.5 shrink-0 rounded-xl px-3 text-xs font-semibold"
              >
                {reconciliationOpen ? 'Hide report' : 'View report'}
              </Button>
            </div>

            {reconciliationOpen && (
              <div className="space-y-3.5 px-5 pb-5">
                {reportQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted">
                    <Loader2 size={14} className="animate-spin" /> Loading reconciliation…
                  </div>
                ) : reportQuery.isError ? (
                  <Alert variant="destructive" className="py-2 px-3">
                    <AlertDescription className="text-xs text-danger">
                      {reportQuery.error?.message || 'Could not load the reconciliation report.'}
                    </AlertDescription>
                  </Alert>
                ) : (report?.currencies.length ?? 0) === 0 ? (
                  <div className="py-8 text-center">
                    <Scale size={28} className="mx-auto mb-2 text-muted/60" />
                    <p className="text-sm font-semibold text-heading">No inventory positions yet</p>
                    <p className="mt-1 text-xs text-muted">The report appears once products exist in a mapped currency.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="w-full border-collapse text-left">
                      <TableHeader className="sticky top-0 z-10 h-10 border-b border-border-default bg-surface-muted/60">
                        <TableRow className="h-10 border-0 hover:bg-transparent">
                          <TableHead className="h-10 py-0 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted rtl:text-right">Currency</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">On hand</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Valued</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Unvalued</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Inventory value</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Posted</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">GL balance</TableHead>
                          <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Difference</TableHead>
                          <TableHead className="h-10 whitespace-nowrap py-0 pl-3 pr-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-muted">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border-subtle">
                        {report.currencies.map(row => (
                          <TableRow key={row.currency} className="h-11 transition-colors hover:bg-surface-muted/60">
                            <TableCell className="pl-4 pr-3 py-2.5 text-xs font-bold tabular-nums text-heading">{row.currency}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-body">{row.quantityOnHand.toLocaleString()}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-body">{row.valuedQuantity.toLocaleString()}</TableCell>
                            <TableCell className={`px-3 py-2.5 text-right text-xs tabular-nums ${row.unvaluedQuantity > 0 ? 'font-semibold text-warning-text' : 'font-medium text-body'}`}>
                              {row.unvaluedQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-heading">{money(row.inventoryValue, row.currency)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-body">{money(row.postedValue, row.currency)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-body">{money(row.ledgerAssetBalance, row.currency)}</TableCell>
                            <TableCell className={`px-3 py-2.5 text-right text-xs tabular-nums ${Number(row.ledgerDifference) !== 0 ? 'font-semibold text-danger' : 'font-medium text-body'}`}>
                              {money(row.ledgerDifference, row.currency)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2.5 pl-3 pr-4 text-center">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                row.reconciled
                                  ? 'border-success-border bg-success-light text-success-text'
                                  : 'border-warning-border bg-warning-light text-warning-text'
                              }`}>
                                {row.reconciled ? 'Reconciled' : 'Needs attention'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {(totals.unvaluedMovements > 0 || (report?.currencies ?? []).some(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0) || totals.unvaluedQuantity > 0) && (
                  <div className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-muted/40 p-3 text-[11px] leading-relaxed text-muted">
                    {totals.unvaluedQuantity > 0 && (
                      <p>
                        {totals.unvaluedQuantity.toLocaleString()} unit{totals.unvaluedQuantity === 1 ? '' : 's'} across {unvaluedProducts.length} product{unvaluedProducts.length === 1 ? '' : 's'} still need an opening cost.
                      </p>
                    )}
                    {(report?.currencies ?? []).some(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0) && (
                      <p>
                        <span className="font-semibold text-heading">Unposted or inconsistent value:</span>{' '}
                        {(report?.currencies ?? []).filter(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0)
                          .map(row => `${row.currency}: unposted ${money(row.unpostedValue, row.currency)}, subledger difference ${money(row.subledgerDifference, row.currency)}`)
                          .join('; ')}.
                      </p>
                    )}
                    {totals.unvaluedMovements > 0 && (
                      <p>
                        <span className="font-semibold text-heading">{totals.unvaluedMovements} historical movement(s) have no valuation event.</span>{' '}
                        Opening valuation assigns cost to current on-hand quantity; it cannot recreate cost of goods sold for issues recorded before valuation existed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-heading">Stock without cost</h3>
                  <Badge
                    variant="outline"
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      unvaluedProducts.length > 0
                        ? 'border-warning-border bg-warning-light text-warning-text'
                        : 'border-success-border bg-success-light text-success-text'
                    }`}
                  >
                    {unvaluedProducts.length > 0 ? `${unvaluedProducts.length} product${unvaluedProducts.length === 1 ? '' : 's'}` : 'Complete'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {unvaluedProducts.length > 0
                    ? 'Assign a cost to stock received before valuation existed. This posts the opening value to the ledger.'
                    : 'Every on-hand unit currently has an established cost.'}
                </p>
              </div>
              {unvaluedProducts.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnvaluedOpen(value => !value)}
                  className="h-8.5 shrink-0 rounded-xl px-3 text-xs font-semibold"
                >
                  {unvaluedOpen ? 'Hide stock' : 'Review stock'}
                </Button>
              )}
            </div>

            {unvaluedQuery.isLoading ? (
              <div className="flex items-center gap-2 px-5 pb-5 text-xs text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading stock…
              </div>
            ) : unvaluedProducts.length === 0 ? null : unvaluedOpen ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
                  <p className="text-[11px] text-muted">Value the remainder to establish cost and post the opening position.</p>
                  <div className="relative flex w-full items-center sm:w-64">
                    <input
                      type="text"
                      placeholder="Search product or SKU..."
                      value={unvaluedSearch}
                      onChange={(event) => {
                        setUnvaluedSearch(event.target.value)
                        setUnvaluedPage(1)
                      }}
                      className="h-8.5 w-full rounded-xl border border-border-default bg-surface-raised pl-8 pr-3 text-xs text-heading placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <Search size={14} className="pointer-events-none absolute left-2.5 shrink-0 text-muted" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse text-left">
                    <TableHeader className="sticky top-0 z-10 h-10 border-b border-border-default bg-surface-muted/60">
                      <TableRow className="h-10 border-0 hover:bg-transparent">
                        <TableHead className="h-10 py-0 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted rtl:text-right">Product</TableHead>
                        <TableHead className="h-10 px-3 py-0 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted rtl:text-right">SKU</TableHead>
                        <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">On hand</TableHead>
                        <TableHead className="h-10 whitespace-nowrap px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Unvalued</TableHead>
                        <TableHead className="h-10 px-3 py-0 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">Currency</TableHead>
                        <TableHead className="h-10 py-0 pl-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border-subtle">
                      {pagedUnvalued.map(product => {
                        const mapped = mappedCurrencies.has(product.currency)
                        return (
                          <TableRow key={product.id} className="h-11 transition-colors hover:bg-surface-muted/60">
                            <TableCell className="pl-4 pr-3 py-2.5 text-xs font-semibold text-heading">
                              {product.name}
                              {product.archivedAt && <Badge variant="outline" className="ml-2">Archived</Badge>}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-xs font-medium tabular-nums text-muted">{product.sku}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-body">{product.stock.toLocaleString()}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-warning-text">
                              {product.unvaluedQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-xs font-medium tabular-nums text-body">{product.currency}</TableCell>
                            <TableCell className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canWrite || !mapped}
                                title={
                                  !mapped
                                    ? `Add a ledger-account mapping for ${product.currency} first`
                                    : !canWrite
                                      ? 'Only workspace administrators can value opening stock'
                                      : undefined
                                }
                                onClick={() => openOpeningDialog(product)}
                                className="h-8 rounded-lg px-3 text-xs font-semibold"
                              >
                                Value opening
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredUnvalued.length === 0 && (
                        <TableRow className="border-0 hover:bg-transparent">
                          <TableCell colSpan={6} className="px-6 py-8 text-center text-xs text-muted">
                            No products match your search.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {filteredUnvalued.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-4 text-xs text-muted">
                    <div>
                      Showing <span className="font-semibold text-heading">{(unvaluedPage - 1) * UNVALUED_PAGE_SIZE + 1}–{Math.min(unvaluedPage * UNVALUED_PAGE_SIZE, filteredUnvalued.length)}</span> of <span className="font-semibold text-heading">{filteredUnvalued.length}</span> products
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={unvaluedPage <= 1} onClick={() => setUnvaluedPage(page => Math.max(1, page - 1))} className="h-8 rounded-lg px-2.5 text-xs">
                        <ChevronLeft size={14} className="mr-1" /> Previous
                      </Button>
                      <span className="px-1 text-xs font-medium">Page {unvaluedPage} of {totalUnvaluedPages}</span>
                      <Button type="button" variant="outline" size="sm" disabled={unvaluedPage >= totalUnvaluedPages} onClick={() => setUnvaluedPage(page => Math.min(totalUnvaluedPages, page + 1))} className="h-8 rounded-lg px-2.5 text-xs">
                        Next <ChevronRight size={14} className="ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </section>
          )}

          <details className="rounded-2xl border border-border-default bg-surface-raised/60 p-4 shadow-xs backdrop-blur-xl">
            <summary className="cursor-pointer text-xs font-semibold text-body">
              Good to know: how valuation posts, reconciles, and opens
            </summary>
            <div className="mt-3.5 grid gap-4 border-t border-border-subtle pt-3.5 sm:grid-cols-3">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-heading">Posting flows</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  A purchase receipt credits goods received not invoiced. A receivable invoice can issue stock and
                  post cost of goods sold; an invoice without stock lines stays total-only. One approved bill can
                  clear GRNI for a fully received, valued, single-line purchase order. Partial receipts, multi-line
                  orders, tax, freight, and price variances cannot be matched.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-heading">What reconciles</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  The report compares stock value with the mapped inventory asset account only. GRNI, cost of goods
                  sold, and adjustment accounts are posted but not reconciled here. Use a dedicated control account,
                  because any unrelated journal posted to it is included in the ledger balance.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-heading">Opening and method changes</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Opening valuation posts a journal immediately, so the Finance opening trial-balance flow can no
                  longer be used afterwards. If a Finance opening balance already exists, inventory opening is
                  refused — choose one route. The costing method is locked after the first valuation posting, and
                  products in an unmapped currency stay quantity-only rather than being silently valued.
                </p>
              </div>
            </div>
          </details>

        </div>
      </section>

      <FormDialog
        open={Boolean(openingProduct)}
        onClose={() => !openingMutation.isPending && setOpeningProduct(null)}
        title="Value opening stock"
        subtitle={openingProduct ? `${openingProduct.name}: ${openingProduct.unvaluedQuantity} of ${openingProduct.stock} unit(s) have no cost.` : undefined}
        confirmLabel="Post opening valuation"
        busy={openingMutation.isPending}
        onConfirm={submitOpening}
        error={openingError}
        width="max-w-md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Unit cost ({openingProduct?.currency})</label>
              <Input
                type="text"
                inputMode="decimal"
                value={openingCost}
                onChange={(event) => setOpeningCost(event.target.value)}
                placeholder="e.g. 12.50"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Effective as of</label>
              <Input
                type="date"
                value={openingAsOf}
                onChange={(event) => setOpeningAsOf(event.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="rounded-input border border-border-default bg-surface px-3 py-2.5 text-xs text-muted flex items-center justify-between">
            <span>Opening value ({openingQuantity} unit{openingQuantity === 1 ? '' : 's'})</span>
            <span className="font-semibold text-heading tabular-nums">
              {openingPreview == null ? EMPTY.amount : money(openingPreview, openingProduct?.currency)}
            </span>
          </div>

          <Alert className="border-warning-border bg-warning-light text-warning-text py-2 px-3">
            <AlertDescription className="text-[11px] leading-relaxed text-warning-text">
              This assigns cost to quantity that already exists; it creates no stock movement. It
              posts the value against inventory opening equity and cannot be undone by deleting the
              quantity. If you plan to use Finance&apos;s opening trial balance instead, do that first:
              this journal makes the ledger non-empty and blocks that flow.
            </AlertDescription>
          </Alert>

          {!configured && (
            <p className="text-[11px] text-danger">
              Configure the valuation policy before posting an opening position.
            </p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}

function SummaryCard({ label, value, hint, icon: Icon, tone = 'default' }) {
  const iconBadgeStyle = tone === 'warning'
    ? 'border-warning-border bg-warning-light text-warning-text'
    : tone === 'success'
      ? 'border-success-border bg-success-light text-success-text'
      : tone === 'info'
        ? 'border-info-border bg-info-light text-info'
        : 'border-accent/15 bg-accent-light text-accent';

  return (
    <div className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-border-default bg-gradient-to-b from-surface-raised to-surface-raised/60 p-4 shadow-xs backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-none tracking-wider text-muted">
          {label}
        </span>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${iconBadgeStyle}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="my-1">
        <p className="truncate text-xl font-bold leading-none tracking-tight text-heading tabular-nums">
          {value}
        </p>
      </div>
      <div className="border-t border-border-subtle pt-1.5 text-[11px] leading-snug text-muted">
        {hint}
      </div>
    </div>
  )
}
