import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * Styled keyboard hint. Matches the inline `<kbd>` markup previously used in the
 * topbar search button (text-[10px] mono chip with a border).
 */
function Kbd({ className, ...props }) {
  return (
    <kbd
      className={cn(
        'flex-shrink-0 rounded-xs border border-border-default bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-caption',
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }