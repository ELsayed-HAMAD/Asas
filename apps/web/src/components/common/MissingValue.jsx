import { cn } from '../../lib/utils'
import { EMPTY } from '../../lib/emptyText'

/**
 * A quiet placeholder for a value the platform does not have.
 *
 * Use this where the surrounding typography is prominent (inspector headings, KPI values)
 * so missing data reads as secondary rather than as a real value.
 */
export default function MissingValue({ label = EMPTY.value, className }) {
  return <span className={cn('font-normal text-muted', className)}>{label}</span>
}
