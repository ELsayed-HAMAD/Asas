/**
 * One vocabulary for values the platform does not have.
 *
 * Missing data should explain the state in plain language instead of exposing a system
 * code. Pick the variant that matches the surrounding screen:
 * - `value`     an optional field was never filled in
 * - `provided`  imported or profile data arrived without this field
 * - `recorded`  a historical event or date has no entry
 * - `scheduled` a future date has not been planned yet
 * - `data`      an aggregate has nothing to compute from
 * - `amount`    a monetary value is absent
 * - `note`      an optional free-text note is empty
 * - `budget`    utilization has no budget to divide by
 * - `unavailable` a value could not be loaded
 */
export const EMPTY = {
  value: 'Not set',
  provided: 'Not provided',
  recorded: 'Not recorded',
  scheduled: 'Not scheduled',
  data: 'No data',
  amount: 'No amount',
  note: 'No note',
  tax: 'No tax',
  budget: 'No budget',
  email: 'No email',
  category: 'Uncategorized',
  status: 'Unknown',
  unavailable: 'Unavailable',
}
