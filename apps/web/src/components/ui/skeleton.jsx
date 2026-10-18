import * as React from 'react'
import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-input bg-surface-strong', className)}
      {...props}
    />
  )
}

export { Skeleton }