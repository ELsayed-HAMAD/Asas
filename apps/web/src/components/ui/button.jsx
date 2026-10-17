import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-60 cursor-pointer active:scale-[0.99]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-on-primary hover:bg-primary-hover shadow-xs',
        destructive:
          'bg-danger text-on-primary hover:bg-danger-hover shadow-xs',
        outline:
          'border border-border-default bg-surface-raised hover:bg-surface-muted text-body hover:text-heading shadow-xs',
        secondary:
          'bg-surface-muted text-body hover:bg-surface-strong hover:text-heading',
        ghost:
          'hover:bg-surface-muted text-muted hover:text-heading',
        link:
          'text-accent underline-offset-4 hover:underline !p-0 !h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }

