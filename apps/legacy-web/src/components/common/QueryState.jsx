import { Loader2 } from 'lucide-react'
import EmptyState from './EmptyState'

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
    return (
      <div className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
        Loading...
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