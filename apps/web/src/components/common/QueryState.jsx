import EmptyState from './EmptyState'
import { Skeleton } from '../ui/skeleton'

export default function QueryState({
  isLoading,
  isError,
  error,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  children,
}) {
  if (isLoading) {
    // Approved tweak: skeleton loading state (replaces the old centered spinner).
    return (
      <div className="flex-1 px-6 py-10" role="status" aria-label="Loading">
        <div className="mx-auto w-full max-w-lg space-y-3">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-danger">
        {error?.response?.data?.error?.message || error?.message || 'Unable to load this data.'}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className="flex-1"
      />
    )
  }

  return children
}