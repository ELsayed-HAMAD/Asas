import { useMemo } from 'react'
import SearchCombobox from './SearchCombobox'
import { buildCurrencyOptions } from '../../lib/currencyOptions'

/** Searchable ISO currency picker with names, symbols, and a common-currency group. */
export default function CurrencyCombobox({ value, onChange, ...props }) {
  const options = useMemo(() => buildCurrencyOptions(), [])

  return (
    <SearchCombobox
      {...props}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Select a currency"
      searchPlaceholder="Search code, currency, or symbol"
      emptyText="No currency matches that search."
    />
  )
}
