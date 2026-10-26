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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'

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

          {/* ── 1. Compact Unified Header Card (Merged Title + Badges + Integrated Amber Warning) ── */}
          <header className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-card space-y-3 flex flex-col">
            <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-info-light border border-info-border text-info flex items-center justify-center shrink-0 shadow-xs">
                  <Scale size={20} />
                </span>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-heading tracking-tight truncate">Inventory valuation</h1>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed truncate sm:whitespace-normal">
                    The company costing policy, the real ledger accounts it posts to, and the
                    reconciliation between on-hand stock and the inventory control account.
                  </p>
                </div>
              </div>

              {/* Badges + Refresh on ONE Single Horizontal Row */}
              <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                <Badge
                  variant={configured ? 'success' : 'outline'}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${
                    configured
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  }`}
                >
                  {configured ? <CheckCircle2 size={12} className="mr-1 inline" /> : <AlertTriangle size={12} className="mr-1 inline" />}
                  {configured ? 'Valuation configured' : 'Quantity only'}
                </Badge>
                <Badge
                  variant="secondary"
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-muted text-heading border border-border-subtle shrink-0"
                >
                  {setup?.costingMethod === 'WEIGHTED_AVERAGE' ? 'Weighted average' : setup?.costingMethod === 'FIFO' ? 'FIFO' : 'No costing method'}
                </Badge>
                <Badge
                  variant="outline"
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-border-default bg-surface-raised text-heading shrink-0"
                >
                  {setup?.valuationPostings ?? 0} valuation posting{(setup?.valuationPostings ?? 0) === 1 ? '' : 's'}
                </Badge>
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
                  className="h-8.5 px-3 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-muted text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                >
                  <RefreshCw size={13} className={(setupQuery.isFetching || reportQuery.isFetching || unvaluedQuery.isFetching) ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>

            {/* Bottom Integrated Amber Alert Bar */}
            {!configured && !setupQuery.isLoading && (
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-2.5 text-xs text-amber-900 leading-relaxed">
                <AlertTriangle size={15} className="shrink-0 text-amber-600 mt-0.5" />
                <span>
                  Inventory is currently quantity-only. Stock can move, but no cost is posted to the
                  ledger and no valuation report can reconcile. Choose a costing method and map real
                  ledger accounts below. Nothing is valued from a product&apos;s selling price.
                </span>
              </div>
            )}

            {openingResult && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between gap-3 text-xs text-emerald-900 leading-relaxed">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                  <span>
                    Valued {openingResult.quantity} unit{openingResult.quantity === 1 ? '' : 's'} for{' '}
                    {money(openingResult.value, openingCurrency)}.
                    Journal entry <span className="font-semibold tabular-nums">{openingResult.journalEntryId}</span> was posted
                    against inventory opening equity.
                  </span>
                </span>
                <button
                  type="button"
                  className="text-[11px] font-bold underline underline-offset-2 shrink-0 cursor-pointer"
                  onClick={() => setOpeningResult(null)}
                >
                  Dismiss
                </button>
              </div>
            )}

            {configured && report && !totals.allReconciled && reconciledRows.length > 0 && (
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                  <span>Valuation does not reconcile for every currency.</span>
                </div>
                <div className="pl-6 space-y-0.5 text-[11px]">
                  {reconciledRows.map(row => (
                    <p key={row.currency}>
                      <span className="font-semibold">{row.currency}:</span>{' '}
                      {[
                        row.unvaluedQuantity > 0 ? `${row.unvaluedQuantity} unit(s) without cost` : null,
                        row.valuedQuantity > row.quantityOnHand ? `${row.valuedQuantity - row.quantityOnHand} more valued unit(s) than stock` : null,
                        Number(row.unpostedValue) !== 0 ? `${money(row.unpostedValue, row.currency)} recorded but not posted` : null,
                        Number(row.ledgerDifference) !== 0 ? `${money(row.ledgerDifference, row.currency)} ledger difference` : null,
                        Number(row.subledgerDifference) !== 0 ? `${money(row.subledgerDifference, row.currency)} subledger difference` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </header>

          {/* ── 2. Row 1: Standardized 4 Apple-Glass KPI Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Costing method"
              value={setup?.costingMethod === 'WEIGHTED_AVERAGE' ? 'Weighted average' : setup?.costingMethod === 'FIFO' ? 'FIFO' : 'Not set'}
              hint={postingsLocked ? 'Locked after the first valuation posting' : 'Can still be changed until a posting exists'}
              icon={Layers}
              tone="default"
            />
            <SummaryCard
              label="Mapped currencies"
              value={String(totals.currencies)}
              hint="Each currency posts to its own accounts"
              icon={Wallet}
              tone="info"
            />
            <SummaryCard
              label="Units without cost"
              value={totals.unvaluedQuantity.toLocaleString()}
              hint={totals.unvaluedQuantity > 0 ? 'Opening valuation is required' : 'Every on-hand unit carries cost'}
              icon={AlertTriangle}
              tone={totals.unvaluedQuantity > 0 ? 'warning' : 'default'}
            />
            <SummaryCard
              label="Reconciliation"
              value={!configured ? 'Not available' : totals.currencies === 0 ? 'No stock' : totals.allReconciled ? 'Reconciled' : 'Needs attention'}
              hint={!configured ? 'Configure a policy first' : totals.currencies === 0 ? 'There is no on-hand quantity to reconcile' : totals.allReconciled ? 'Stock, subledger, and ledger agree' : 'See the currency detail below'}
              icon={CheckCircle2}
              tone={!configured || totals.currencies === 0 ? 'default' : totals.allReconciled ? 'success' : 'warning'}
            />
          </div>

          {/* ── 3. Row 2: Full-Width Compact 2-Column Bento for Costing Policy & Ledger Mapping ── */}
          <section className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-5 shadow-card space-y-4">
            {/* Card Header with Immediate Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-subtle">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-heading">Costing policy and ledger mapping</h2>
                  {postingsLocked && (
                    <Badge variant="outline" className="h-6 px-2 text-[10px] font-semibold gap-1 shrink-0">
                      <Lock size={10} /> Method locked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 max-w-3xl leading-relaxed">
                  Missing accounts are created with the accounting kind shown. An existing account with a
                  different kind is rejected rather than reclassified. Every role needs a distinct account so
                  each journal has two different sides.
                </p>
              </div>
              {canWrite && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetToDefaultNumbering}
                    className="h-8.5 px-3 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-muted text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Reset to default numbering
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="h-8.5 px-4 rounded-xl text-xs font-semibold shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Save valuation policy
                  </Button>
                </div>
              )}
            </div>

            {/* Mappings */}
            <div className="space-y-4">
              {mappings.map((mapping, index) => (
                <div key={index} className="space-y-3.5">
                  {/* Top Controls Row (Costing method & Currency) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-50/70 p-3.5 rounded-xl border border-border-subtle">
                    <div className="md:col-span-8 space-y-1">
                      <label className="block text-xs font-bold text-heading">Costing method</label>
                      <Select value={method} onValueChange={(value) => { setMethod(value); setSaved(false) }} disabled={!canWrite || postingsLocked}>
                        <SelectTrigger className="w-full h-8.5 text-xs bg-surface-raised" aria-label="Costing method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIFO" className="text-xs">FIFO — allocate the oldest layers first</SelectItem>
                          <SelectItem value="WEIGHTED_AVERAGE" className="text-xs">Weighted average — blend cost across the position</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-500">
                        {postingsLocked
                          ? `${setup.valuationPostings} posting${setup.valuationPostings === 1 ? '' : 's'} already exist, so the method cannot change.`
                          : 'Changing the costing method requires an empty valuation history.'}
                      </p>
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-heading">Currency</label>
                        {mappings.length > 1 && canWrite && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCurrency(index)}
                            className="h-6 px-1.5 text-danger text-[11px] hover:bg-danger-light"
                            aria-label={`Remove ${mapping.currency || 'currency'} mapping`}
                          >
                            <Trash2 size={12} className="mr-1" /> Remove
                          </Button>
                        )}
                      </div>
                      <Input
                        type="text"
                        value={mapping.currency}
                        maxLength={3}
                        onChange={(event) => updateMapping(index, { currency: event.target.value.toUpperCase() })}
                        placeholder="USD"
                        disabled={!canWrite}
                        aria-label={`Currency for mapping ${index + 1}`}
                        className="h-8.5 text-xs font-semibold uppercase tabular-nums bg-surface-raised"
                      />
                      <p className="text-[11px] text-slate-500">
                        Currency for these 5 control ledger accounts.
                      </p>
                    </div>
                  </div>

                  {/* 5 GL Account Mappings in a 2-Column Bento Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {ACCOUNT_ROLES.map(role => (
                      <div key={role.key} className="p-3.5 rounded-xl border border-border-subtle bg-slate-50/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-heading">{role.label}</span>
                          <Badge variant="outline" className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase font-sans">
                            {role.kind}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            type="text"
                            value={mapping.accounts[role.key].code}
                            maxLength={32}
                            onChange={(event) => updateAccount(index, role.key, 'code', event.target.value.toUpperCase())}
                            placeholder="ACCOUNT_CODE"
                            disabled={!canWrite}
                            aria-label={`${role.label} account code for ${mapping.currency || 'currency'}`}
                            className="h-8.5 px-3 rounded-lg text-xs font-semibold tabular-nums border border-border-default bg-surface-raised"
                          />
                          <Input
                            type="text"
                            value={mapping.accounts[role.key].name}
                            maxLength={120}
                            onChange={(event) => updateAccount(index, role.key, 'name', event.target.value)}
                            placeholder="Account name"
                            disabled={!canWrite}
                            aria-label={`${role.label} account name for ${mapping.currency || 'currency'}`}
                            className="h-8.5 px-3 rounded-lg text-xs font-medium border border-border-default bg-surface-raised"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">{role.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {canWrite && (
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={addCurrency} className="h-8.5 px-3 rounded-xl text-xs gap-1.5 cursor-pointer">
                  <Plus size={14} /> Add currency mapping
                </Button>
              </div>
            )}

            {!canWrite && (
              <p className="text-[11px] text-muted">
                Only workspace owners and administrators can change the valuation policy.
              </p>
            )}

            {saveError && (
              <Alert variant="destructive" className="py-2 px-3">
                <AlertDescription className="text-xs text-danger">{saveError}</AlertDescription>
              </Alert>
            )}

            {saved && !saveError && (
              <Alert className="py-2 px-3 border-success-border bg-success-light text-success-text">
                <AlertDescription className="text-xs text-success-text">
                  Valuation policy saved. New receipts, issues, and openings will post to these accounts.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* ── 4. Row 3: Full-Width Reconciliation Card (Eliminates Horizontal Clipping & Scrollbar!) ── */}
          <section className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl p-5 shadow-card space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-border-subtle">
              <div>
                <h2 className="text-base font-bold text-heading">Reconciliation</h2>
                <p className="text-xs text-slate-500 mt-0.5 max-w-3xl leading-relaxed">
                  On-hand quantity is compared with the valued subledger and the mapped inventory
                  asset account. A currency reconciles only when every unit has cost, all value is
                  posted, and the subledger and ledger differences are zero.
                </p>
              </div>
            </div>

            {reportQuery.isLoading ? (
              <div className="p-8 flex items-center justify-center text-muted text-xs gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading reconciliation…
              </div>
            ) : reportQuery.isError ? (
              <div className="py-2">
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertDescription className="text-xs text-danger">
                    {reportQuery.error?.message || 'Could not load the reconciliation report.'}
                  </AlertDescription>
                </Alert>
              </div>
            ) : (report?.currencies.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <Scale size={28} className="mx-auto text-muted/60 mb-2" />
                <p className="text-sm font-semibold text-heading">No inventory positions yet</p>
                <p className="text-xs text-muted mt-1">
                  The report appears once products exist in a mapped currency.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-left border-collapse">
                  <TableHeader className="bg-surface-muted/60 border-b border-border-default sticky top-0 z-10 h-10">
                    <TableRow className="h-10 hover:bg-transparent border-0">
                      <TableHead className="pl-4 pr-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Currency</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">On hand</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Valued</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Unvalued</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Inventory value</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Posted</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">GL balance</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Difference</TableHead>
                      <TableHead className="pl-3 pr-4 py-0 text-center text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {report.currencies.map(row => (
                      <TableRow key={row.currency} className="h-11 hover:bg-surface-muted/60 transition-colors">
                        <TableCell className="pl-4 pr-3 py-2.5 text-xs font-bold text-heading tabular-nums">{row.currency}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{row.quantityOnHand.toLocaleString()}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{row.valuedQuantity.toLocaleString()}</TableCell>
                        <TableCell className={`px-3 py-2.5 text-right tabular-nums text-xs ${row.unvaluedQuantity > 0 ? 'text-amber-700 font-semibold' : 'text-body font-medium'}`}>
                          {row.unvaluedQuantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-heading">{money(row.inventoryValue, row.currency)}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{money(row.postedValue, row.currency)}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{money(row.ledgerAssetBalance, row.currency)}</TableCell>
                        <TableCell className={`px-3 py-2.5 text-right tabular-nums text-xs ${Number(row.ledgerDifference) !== 0 ? 'text-danger font-semibold' : 'text-body font-medium'}`}>
                          {money(row.ledgerDifference, row.currency)}
                        </TableCell>
                        <TableCell className="pl-3 pr-4 py-2.5 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                            row.reconciled
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
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

            {/* Recessed Footer Explanation */}
            {(totals.unvaluedMovements > 0 || (report?.currencies ?? []).some(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0) || totals.unvaluedQuantity > 0) && (
              <div className="p-3 rounded-xl bg-slate-50/80 border border-border-subtle text-xs text-slate-600 leading-relaxed space-y-1.5">
                {totals.unvaluedQuantity > 0 && (
                  <p>
                    All on-hand stock ({totals.unvaluedQuantity.toLocaleString()} unit{totals.unvaluedQuantity === 1 ? '' : 's'} across {unvaluedProducts.length} product{unvaluedProducts.length === 1 ? '' : 's'}) is still unvalued until an opening valuation is posted.
                  </p>
                )}
                {(report?.currencies ?? []).some(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0) && (
                  <p>
                    <span className="font-semibold text-heading">Unposted or inconsistent value:</span>{' '}
                    {(report?.currencies ?? []).filter(row => Number(row.unpostedValue) !== 0 || Number(row.subledgerDifference) !== 0)
                      .map(row => `${row.currency} — unposted ${money(row.unpostedValue, row.currency)}, subledger difference ${money(row.subledgerDifference, row.currency)}`)
                      .join('; ')}.
                  </p>
                )}
                {totals.unvaluedMovements > 0 && (
                  <p>
                    <span className="font-semibold text-heading">{totals.unvaluedMovements} historical movement(s) have no valuation event.</span>{' '}
                    Opening valuation assigns cost to current on-hand quantity; it cannot recreate cost
                    of goods sold for issues that were recorded before valuation existed.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── 5. Row 4: Paginated & Searchable On-hand Quantity Without Cost ── */}
          <section className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-heading">On-hand quantity without cost</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0">
                    {unvaluedProducts.length} product{unvaluedProducts.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  These units exist in the quantity ledger but have no valuation layer yet. Value the
                  remainder to establish cost and post the opening position. This posts Dr Inventory /
                  Cr Inventory opening equity immediately.
                </p>
              </div>

              {/* Local SKU/Product Search Input */}
              <div className="relative flex items-center w-full sm:w-64 shrink-0">
                <input
                  type="text"
                  placeholder="Search product or SKU..."
                  value={unvaluedSearch}
                  onChange={(e) => {
                    setUnvaluedSearch(e.target.value)
                    setUnvaluedPage(1)
                  }}
                  className="w-full h-8.5 pl-8 pr-3 rounded-xl border border-border-default bg-surface-raised text-xs text-heading placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-slate-300"
                />
                <Search size={14} className="pointer-events-none absolute left-2.5 text-muted shrink-0" />
              </div>
            </div>

            {unvaluedQuery.isLoading ? (
              <div className="p-8 flex items-center justify-center text-muted text-xs gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading unvalued products…
              </div>
            ) : unvaluedProducts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 size={28} className="mx-auto text-success mb-2" />
                <p className="text-sm font-semibold text-heading">No unvalued on-hand quantity</p>
                <p className="text-xs text-muted mt-1">
                  Every unit currently on hand has an established cost.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-left border-collapse">
                  <TableHeader className="bg-surface-muted/60 border-b border-border-default sticky top-0 z-10 h-10">
                    <TableRow className="h-10 hover:bg-transparent border-0">
                      <TableHead className="pl-4 pr-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Product</TableHead>
                      <TableHead className="px-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">SKU</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">On hand</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Valued</TableHead>
                      <TableHead className="px-3 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Unvalued</TableHead>
                      <TableHead className="px-3 py-0 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Currency</TableHead>
                      <TableHead className="pl-3 pr-4 py-0 text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {pagedUnvalued.map(product => {
                      const mapped = mappedCurrencies.has(product.currency)
                      return (
                        <TableRow key={product.id} className="h-11 hover:bg-surface-muted/60 transition-colors">
                          <TableCell className="pl-4 pr-3 py-2.5 text-xs font-semibold text-heading">
                            {product.name}
                            {product.archivedAt && <Badge variant="outline" className="ml-2">Archived</Badge>}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-xs font-medium text-slate-500 tabular-nums">{product.sku}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{product.stock.toLocaleString()}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-body">{product.valuedQuantity.toLocaleString()}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-amber-700">
                            {product.unvaluedQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-xs font-medium text-slate-600 tabular-nums">{product.currency}</TableCell>
                          <TableCell className="pl-3 pr-4 py-2.5 text-right whitespace-nowrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!configured || !canWrite || !mapped}
                              title={
                                !configured
                                  ? 'Configure the valuation policy first'
                                  : !mapped
                                    ? `Add a ledger-account mapping for ${product.currency} first`
                                    : !canWrite
                                      ? 'Only workspace administrators can value opening stock'
                                      : undefined
                              }
                              onClick={() => openOpeningDialog(product)}
                              className="h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer border-border-default hover:bg-surface-muted"
                            >
                              Value opening
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {filteredUnvalued.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={7} className="px-6 py-8 text-center text-muted text-xs">
                          No products match your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Standard Pagination Footer (10 rows per page) */}
            {filteredUnvalued.length > 0 && (
              <div className="px-4 py-3 border-t border-border-subtle bg-surface-muted/30 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  Showing <span className="font-semibold text-heading">{(unvaluedPage - 1) * UNVALUED_PAGE_SIZE + 1}–{Math.min(unvaluedPage * UNVALUED_PAGE_SIZE, filteredUnvalued.length)}</span> of <span className="font-semibold text-heading">{filteredUnvalued.length}</span> products
                  {filteredUnvalued.length !== unvaluedProducts.length && (
                    <span className="ml-1 text-[11px] text-muted">
                      (filtered from {unvaluedProducts.length})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={unvaluedPage <= 1}
                    onClick={() => setUnvaluedPage(p => Math.max(1, p - 1))}
                    className="h-8 px-2.5 text-xs rounded-lg cursor-pointer"
                  >
                    <ChevronLeft size={14} className="mr-1" /> Previous
                  </Button>
                  <span className="text-xs font-medium px-1">
                    Page {unvaluedPage} of {totalUnvaluedPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={unvaluedPage >= totalUnvaluedPages}
                    onClick={() => setUnvaluedPage(p => Math.min(totalUnvaluedPages, p + 1))}
                    className="h-8 px-2.5 text-xs rounded-lg cursor-pointer"
                  >
                    Next <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ── 6. Row 5: 3-Column Apple-Glass Reference Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-border-default bg-slate-50/60 shadow-xs space-y-1.5">
              <h3 className="text-xs font-bold text-slate-800">Architecture note</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                New receivable invoices can optionally issue valued stock and post the related cost-of-goods
                journal; an invoice without stock lines remains total-only. The Accounts Receivable action menu
                exposes the exact-reversal void and the unpaid-only delete action, and historical unvalued issues
                are not backfilled. A purchase receipt credits goods received not invoiced. Accounts Payable can
                link one bill to one fully received, valued, single-line purchase order; a pending or rejected bill
                can correct or clear that link. Approval debits the exact GRNI account from that receipt. Partial
                receipts, multi-line orders, taxes/freight, and price differences remain unsupported and cannot be
                matched. Every manual stock movement now carries a client request key: an unchanged retry returns
                the original movement, while a changed payload reusing the key is rejected. Purchase-order receiving
                and other system movements remain protected by their state transitions and transactions.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-border-default bg-slate-50/60 shadow-xs space-y-1.5">
              <h3 className="text-xs font-bold text-slate-800">Currency reconciliation</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Reconciliation compares stock value with the mapped inventory asset control account only.
                Goods received not invoiced, cost of goods sold, and adjustment accounts are posted but are
                not reconciled by this report. Use a dedicated inventory control account; any unrelated
                journal posted to the same account is included in the ledger balance.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-border-default bg-slate-50/60 shadow-xs space-y-1.5">
              <h3 className="text-xs font-bold text-slate-800">Back-dating & FIFO</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Inventory opening valuation posts a journal immediately, so the Finance opening
                trial-balance/cutover flow — which requires an unused ledger — can no longer be used
                afterwards. Conversely, if a Finance opening balance is already posted, inventory opening
                valuation is refused so the workspace cannot post two opening positions. Choose one opening
                route. Changing the costing method after the first valuation posting is refused. Products
                whose currency has no mapping cannot receive or issue valued stock; they are listed in the
                report but not silently valued.
              </p>
            </div>
          </div>

        </div>
      </section>

      <FormDialog
        open={Boolean(openingProduct)}
        onClose={() => !openingMutation.isPending && setOpeningProduct(null)}
        title="Value opening stock"
        subtitle={openingProduct ? `${openingProduct.name} — ${openingProduct.unvaluedQuantity} of ${openingProduct.stock} unit(s) have no cost.` : undefined}
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
              {openingPreview == null ? '—' : money(openingPreview, openingProduct?.currency)}
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
    ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
    : tone === 'success'
      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
      : tone === 'info'
        ? 'bg-blue-500/10 border-blue-500/20 text-blue-600'
        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600';

  return (
    <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[120px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-none">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${iconBadgeStyle}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="my-1">
        <p className="text-2xl font-bold tracking-tight text-heading tabular-nums leading-none truncate">
          {value}
        </p>
      </div>
      <div className="pt-1.5 border-t border-border-subtle text-[11px] text-slate-500 leading-snug">
        {hint}
      </div>
    </div>
  )
}
