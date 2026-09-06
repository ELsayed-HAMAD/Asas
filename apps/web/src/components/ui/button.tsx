import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] shadow-[var(--shadow-card)]',
        destructive:
          'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]',
        outline:
          'border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-muted)] text-[var(--color-heading)]',
        secondary:
          'bg-[var(--color-surface-muted)] text-[var(--color-heading)] hover:bg-[var(--color-surface-active)]',
        ghost:
          'hover:bg-[var(--color-surface-muted)] text-[var(--color-body)] hover:text-[var(--color-heading)]',
        link: 'text-[var(--color-accent)] underline-offset-4 hover:underline',
        accent:
          'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-card)]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-[var(--radius-button)] px-3 text-xs',
        lg: 'h-10 rounded-[var(--radius-button)] px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
