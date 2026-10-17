import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-input border border-border-default bg-surface-muted px-3.5 py-2 text-sm text-heading placeholder:text-caption transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 shadow-xs',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }

