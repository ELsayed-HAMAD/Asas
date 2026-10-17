import React from 'react';

/**
 * Reusable PageToolbar component for dashboard pages.
 * Houses primary filters, search inputs, and page-level actions
 * with consistent 36px control height, 16px gap, and 16px bottom margin.
 */
export default function PageToolbar({
  left,
  right,
  children,
  className = '',
}) {
  return (
    <div className={`flex items-center justify-between gap-4 mb-4 min-w-0 flex-wrap sm:flex-nowrap ${className}`}>
      {children ? (
        children
      ) : (
        <>
          <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
            {left}
          </div>
          {right && (
            <div className="flex items-center gap-3 shrink-0">
              {right}
            </div>
          )}
        </>
      )}
    </div>
  );
}

