import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-badge px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-on-primary',
        secondary:
          'border-transparent bg-surface-muted text-body hover:bg-surface-strong',
        destructive:
          'bg-danger-light text-danger-text border border-danger-border',
        success:
          'bg-success-light text-success-text border border-success-border',
        warning:
          'bg-warning-light text-warning-text border border-amber-200',
        info:
          'bg-info-light text-info border border-info-border',
        outline:
          'text-body border border-border-default bg-surface-raised',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

