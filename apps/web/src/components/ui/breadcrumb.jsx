import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Breadcrumb — shadcn new-york-v4 adapted to the ASAS token system.
 * Ancestor links: text-muted → hover:text-heading. Current page: text-heading.
 * Default separator chevron flips in RTL via `rtl:rotate-180`.
 */

function Breadcrumb(props) {
  return <nav aria-label="breadcrumb" {...props} />
}

function BreadcrumbList({ className, ...props }) {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-center gap-1.5 text-sm break-words text-muted sm:gap-2.5',
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }) {
  return (
    <li
      className={cn('inline-flex items-center gap-1.5 sm:gap-2.5', className)}
      {...props}
    />
  )
}

function BreadcrumbLink({ asChild, className, ...props }) {
  const Comp = asChild ? Slot : 'a'
  return (
    <Comp
      className={cn('transition-colors hover:text-heading', className)}
      {...props}
    />
  )
}

function BreadcrumbPage({ className, ...props }) {
  return (
    <span
      aria-current="page"
      className={cn('font-medium text-heading', className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({ children, className, ...props }) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn('text-caption [&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight className="rtl:rotate-180" />}
    </span>
  )
}

function BreadcrumbEllipsis({ className, ...props }) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
