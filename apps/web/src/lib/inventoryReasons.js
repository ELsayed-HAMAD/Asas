/**
 * Inventory valuation reasons exposed by the API. Labels state the ledger effect so an operator
 * chooses the accounting treatment deliberately; they mirror the `InventoryCostReason` contract.
 */
export const RECEIPT_REASONS = [
  { value: 'PURCHASE_RECEIPT', label: 'Purchase receipt (credit goods received not invoiced)' },
  { value: 'CUSTOMER_RETURN', label: 'Customer return (reverse cost of goods sold)' },
  { value: 'COUNT_ADJUSTMENT', label: 'Positive count adjustment (credit adjustment gain)' },
]

export const ISSUE_REASONS = [
  { value: 'SALE', label: 'Sale (debit cost of goods sold)' },
  { value: 'CONSUMPTION', label: 'Internal consumption (debit cost of goods sold)' },
  { value: 'DAMAGE', label: 'Damage or shrinkage (debit adjustment expense)' },
  { value: 'COUNT_ADJUSTMENT', label: 'Negative count adjustment (debit adjustment expense)' },
  { value: 'SUPPLIER_RETURN', label: 'Supplier return (debit goods received not invoiced)' },
]

export function reasonsFor(kind) {
  return kind === 'receive' ? RECEIPT_REASONS : ISSUE_REASONS
}
