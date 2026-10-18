import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * Form field label. shadcn v4 ships this without a Radix dependency; styling uses
 * the ASAS text hierarchy (label text = body-light, small and medium weight).
 */
function Label({ className, ...props }) {
  return (
    <label
      className={cn(
        'text-sm font-medium text-body-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  )
}

export { Label }