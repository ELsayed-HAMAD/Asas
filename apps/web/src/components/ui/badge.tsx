import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-badge)] px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-primary-light)] text-[var(--color-primary)] border border-[var(--color-primary-subtle)]',
        secondary:
          'bg-[var(--color-surface-muted)] text-[var(--color-body)] border border-[var(--color-border-default)]',
        success:
          'bg-[var(--color-success-light)] text-[var(--color-success-text)] border border-[var(--color-success-border)]',
        warning:
          'bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border border-[var(--color-warning)]/20',
        danger:
          'bg-[var(--color-danger-light)] text-[var(--color-danger-text)] border border-[var(--color-danger-border)]',
        info: 'bg-[var(--color-info-light)] text-[var(--color-info)] border border-[var(--color-info-border)]',
        outline: 'text-[var(--color-heading)] border border-[var(--color-border-default)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
