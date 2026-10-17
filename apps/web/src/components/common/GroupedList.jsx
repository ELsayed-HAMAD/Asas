import React from 'react';

/**
 * Reusable GroupedList component.
 * Renders a sticky status group header (12px/500, small letter-spacing, 24-28px top space, 8px bottom space)
 * and ONE unified white rounded container (padding 4px, radius 14px, no border, 0 1px 2px shadow) for the rows.
 */
export default function GroupedList({
  title,
  count,
  dotColor = 'bg-caption',
  isEmpty = false,
  emptyMessage = 'No items in this group.',
  children,
  className = '',
}) {
  return (
    <div className={`mt-7 first:mt-0 ${className}`}>
      {/* Sticky Group Header */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-xs py-1 mb-2">
        <div className="h-7 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <h3 className="text-xs font-medium text-muted tracking-wide">
            {title} {count !== undefined && <span className="ml-1 text-caption font-normal">({count})</span>}
          </h3>
        </div>
      </div>

      {/* Unified White Group Container (p-1 = 4px padding, radius 14px, no border) */}
      <div className="bg-surface-raised rounded-[14px] p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] border-0 flex flex-col gap-0.5">
        {isEmpty ? (
          <div className="text-sm text-muted py-3 px-4 text-center">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
