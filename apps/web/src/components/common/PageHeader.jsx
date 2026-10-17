import React from 'react';

/**
 * Reusable PageHeader component for dashboard pages.
 * Sits directly below the global top bar with standard 16px 24px padding,
 * soft spacing, and no wrapping at viewports >= 1280px.
 */
export default function PageHeader({
  title,
  meta,
  actions,
  hasBorder = false,
  className = '',
}) {
  return (
    <header className={`px-6 py-4 ${hasBorder ? 'border-b border-border-default' : ''} bg-surface-raised shrink-0 flex items-center justify-between gap-4 flex-nowrap min-w-0 ${className}`}>
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 text-lg font-medium text-heading">
          {title}
        </div>
        {meta && (
          <div className="flex items-center gap-3 text-xs text-muted flex-wrap sm:flex-nowrap min-w-0 font-normal">
            {meta}
          </div>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
