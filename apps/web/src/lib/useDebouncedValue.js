import { useEffect, useState } from 'react'

/**
 * Debounces a rapidly-changing value (typically a top-bar search input) so a list query only
 * refetches after the user pauses typing, instead of once per keystroke. String values are
 * trimmed. Pair with React Query's `placeholderData: keepPreviousData` so the previous page of
 * results stays rendered (and the input keeps focus) while the new fetch is in flight.
 *
 * Usage:
 *   const [searchInput, setSearchInput] = useState('')
 *   const search = useDebouncedValue(searchInput)
 *   useQuery({
 *     queryKey: keys.list({ search: search || undefined }),
 *     queryFn: () => api.list({ search: search || undefined }),
 *     placeholderData: keepPreviousData,
 *   })
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(typeof value === 'string' ? value.trim() : value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
