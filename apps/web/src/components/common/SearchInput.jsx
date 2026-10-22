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
          'w-full h-9 pl-9 pr-3.5 text-sm rounded-xl bg-slate-100/75 backdrop-blur-md border border-slate-200/70 shadow-[inset_0_1px_2px_rgba(15,23,42,0.02)] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 focus:border-slate-300 focus:bg-white/95 transition-all',
          className
        )}
        {...props}
      />
      <Search
        size={16}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 shrink-0 z-10',
          iconClassName
        )}
      />
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

export { SearchInput };
export default SearchInput;
