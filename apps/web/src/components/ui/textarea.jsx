import * as React from 'react'
import { cn } from '../../lib/utils'

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-input border border-border-default bg-surface-muted px-3.5 py-2.5 text-sm text-heading placeholder:text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 shadow-xs',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }

