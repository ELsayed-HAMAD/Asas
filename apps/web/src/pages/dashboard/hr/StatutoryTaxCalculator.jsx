import React, { useState } from 'react'
import {
  computeSaudiGosi,
  computeUkPayeTaxes,
  computeUsFederalTaxes,
  Money,
} from '@asas/domain'
import { Calculator, X } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { formatMoney } from '../../../lib/format'

export default function StatutoryTaxCalculator({ isOpen, onClose }) {
  const [region, setRegion] = useState('US')
  const [amount, setAmount] = useState('5000.00')
  const [frequency, setFrequency] = useState('MONTHLY')
  const [filingStatus, setFilingStatus] = useState('SINGLE')
  const [priorYtd, setPriorYtd] = useState('')
  const [taxCode, setTaxCode] = useState('1257L')
  const [isSaudiNational, setIsSaudiNational] = useState(true)

  if (!isOpen) return null

  let result = null
  let calculationError = null

  try {
    const grossVal = amount.trim() || '0'
    if (region === 'US') {
      const gross = Money.fromDecimal(grossVal, 'USD')
      const ytdGrossPrior = priorYtd.trim() ? Money.fromDecimal(priorYtd.trim(), 'USD') : undefined
      result = computeUsFederalTaxes({
        gross,
        frequency,
        filingStatus,
        ...(ytdGrossPrior ? { ytdGrossPrior } : {}),
      })
    } else if (region === 'UK') {
      const gross = Money.fromDecimal(grossVal, 'GBP')
      result = computeUkPayeTaxes({
        gross,
        frequency,
        taxCode: taxCode.trim() || '1257L',
      })
    } else if (region === 'SA') {
      const gross = Money.fromDecimal(grossVal, 'SAR')
      result = computeSaudiGosi({
        gross,
        isSaudiNational,
      })
    }
  } catch (err) {
    calculationError = err?.message || 'Invalid calculation inputs'
  }

  const currency = region === 'US' ? 'USD' : region === 'UK' ? 'GBP' : 'SAR'
  const grossMoney = !calculationError && amount.trim() ? Money.fromDecimal(amount.trim(), currency) : null
  const deductionsMoney = result ? (result.totalDeductions ?? result.totalEmployeeDeductions) : null
  const netMoney = grossMoney && deductionsMoney ? grossMoney.subtract(deductionsMoney) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-labelledby="statutory-calc-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-card-sm border border-border-default bg-surface-raised p-6 shadow-card"
      >
        <div className="flex items-center justify-between border-b border-border-default pb-4">
          <div className="flex items-center gap-2">
            <Calculator className="text-accent" size={20} />
            <h2 id="statutory-calc-title" className="text-lg font-bold text-heading">
              Statutory Tax & Deduction Calculator
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 text-muted hover:text-heading"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Region selector */}
        <div className="mt-4 flex gap-2 border-b border-border-subtle pb-4">
          <Button
            variant={region === 'US' ? 'default' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setRegion('US')}
            className="flex-1 text-xs"
          >
            🇺🇸 United States (W-4 / FICA)
          </Button>
          <Button
            variant={region === 'UK' ? 'default' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setRegion('UK')}
            className="flex-1 text-xs"
          >
            🇬🇧 United Kingdom (PAYE / NIC)
          </Button>
          <Button
            variant={region === 'SA' ? 'default' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setRegion('SA')}
            className="flex-1 text-xs"
          >
            🇸🇦 Saudi Arabia (GOSI)
          </Button>
        </div>

        {/* Inputs */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <div>
            <label htmlFor="statutory-amount" className="block font-medium text-body mb-1">Gross Salary ({currency})</label>
            <Input
              id="statutory-amount"
              type="text"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="5000.00"
              className="bg-surface-muted"
            />
          </div>

          <div>
            <label htmlFor="statutory-frequency" className="block font-medium text-body mb-1">Pay Frequency</label>
            <select
              id="statutory-frequency"
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              disabled={region === 'SA'}
              className="w-full rounded-input border border-border-default bg-surface-muted px-3 py-2 text-sm text-heading outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="SEMIMONTHLY">Semi-Monthly (24/yr)</option>
              <option value="BIWEEKLY">Biweekly (26/yr)</option>
              <option value="WEEKLY">Weekly (52/yr)</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </div>

          {region === 'US' && (
            <>
              <div>
                <label htmlFor="statutory-filing-status" className="block font-medium text-body mb-1">IRS W-4 Filing Status</label>
                <select
                  id="statutory-filing-status"
                  value={filingStatus}
                  onChange={e => setFilingStatus(e.target.value)}
                  className="w-full rounded-input border border-border-default bg-surface-muted px-3 py-2 text-sm text-heading outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="SINGLE">Single or Married Filing Separately</option>
                  <option value="MARRIED">Married Filing Jointly</option>
                  <option value="HEAD_OF_HOUSEHOLD">Head of Household</option>
                </select>
              </div>
              <div>
                <label htmlFor="statutory-prior-ytd" className="block font-medium text-body mb-1">Prior YTD Gross (USD)</label>
                <Input
                  id="statutory-prior-ytd"
                  type="text"
                  value={priorYtd}
                  onChange={e => setPriorYtd(e.target.value)}
                  placeholder="Optional (e.g. 150000.00)"
                  className="bg-surface-muted"
                />
              </div>
            </>
          )}

          {region === 'UK' && (
            <div>
              <label htmlFor="statutory-tax-code" className="block font-medium text-body mb-1">HMRC Tax Code</label>
              <Input
                id="statutory-tax-code"
                type="text"
                value={taxCode}
                onChange={e => setTaxCode(e.target.value)}
                placeholder="1257L"
                className="bg-surface-muted"
              />
            </div>
          )}

          {region === 'SA' && (
            <div className="flex items-center gap-2 pt-5">
              <input
                id="saudi-national-toggle"
                type="checkbox"
                checked={isSaudiNational}
                onChange={e => setIsSaudiNational(e.target.checked)}
                className="h-4 w-4 rounded border-border-default text-accent focus:ring-accent"
              />
              <label htmlFor="saudi-national-toggle" className="text-xs font-medium text-heading cursor-pointer">
                Saudi National (Full GOSI vs Expat Hazard Only)
              </label>
            </div>
          )}
        </div>

        {/* Results */}
        {calculationError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription className="text-xs">{calculationError}</AlertDescription>
          </Alert>
        ) : result ? (
          <div className="mt-4 space-y-3 rounded-card-sm border border-border-default bg-surface-muted/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Statutory Deductions Breakdown</h3>

            <div className="divide-y divide-border-subtle">
              {result.taxLines.map((line, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-body">{line.label}</span>
                  <span className="font-semibold text-danger tabular-nums">
                    -{formatMoney(line.amount.toDecimalString(), { currency })}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border-default pt-2 flex items-center justify-between text-xs">
              <span className="font-medium text-heading">Total Employee Deductions:</span>
              <span className="font-bold text-danger tabular-nums">
                -{formatMoney(deductionsMoney.toDecimalString(), { currency })}
              </span>
            </div>

            {netMoney && (
              <div className="flex items-center justify-between border-t border-border-default pt-2 text-sm">
                <span className="font-bold text-heading">Estimated Net Pay:</span>
                <span className="font-bold text-success-text tabular-nums">
                  {formatMoney(netMoney.toDecimalString(), { currency })}
                </span>
              </div>
            )}

            {region === 'SA' && result.employerContributions && (
              <div className="mt-3 border-t border-border-default pt-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                  Employer GOSI Contributions (Company Expense)
                </h4>
                <div className="divide-y divide-border-subtle">
                  {result.employerContributions.map((line, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 text-xs">
                      <span className="text-body">{line.label}</span>
                      <span className="font-semibold text-heading tabular-nums">
                        {formatMoney(line.amount.toDecimalString(), { currency })}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1.5 text-xs font-bold text-heading">
                    <span>Total Employer Cost:</span>
                    <span>{formatMoney(result.totalEmployerContributions.toDecimalString(), { currency })}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
