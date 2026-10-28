import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Shared SearchInput component for dashboard toolbars and filter bars.
 * Standardized to 36px (h-9), rounded-xl, exact 12px icon inset (left-3),
 * clean 8px gap after icon (pl-9 = 36px), and Apple-inspired translucent glass surface.
 *
 * Search icon is rendered with z-10 and after input in DOM to guarantee it is never
 * covered by the input's background surface.
 */
const SearchInput = React.forwardRef(function SearchInput({
  className,
  wrapperClassName,
  placeholder = 'Search...',
  type = 'text',
  iconClassName,
  ...props
}, ref) {
  return (
    <div className={cn('relative flex items-center w-full sm:w-64 shrink-0', wrapperClassName)}>
      <input
        ref={ref}
        type={type}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full rounded-xl border border-border-default bg-surface-muted/80 pl-9 pr-3.5 text-sm text-body shadow-none backdrop-blur-md transition-colors placeholder:text-caption focus:border-accent/40 focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent/20',
          className
        )}
        {...props}
      />
      <Search
        size={16}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 shrink-0 -translate-y-1/2 text-muted',
          iconClassName
        )}
      />
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

export { SearchInput };
export default SearchInput;
