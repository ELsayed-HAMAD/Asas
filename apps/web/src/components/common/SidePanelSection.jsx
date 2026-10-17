import React from 'react';

/**
 * Reusable SidePanelSection component for detail panels.
 * Single surface design where sections are divided by low-contrast 1px hairlines.
 * Title is styled at 14px/500 with standard 20px vertical padding.
 */
export default function SidePanelSection({
  title,
  badge,
  action,
  children,
  className = '',
}) {
  return (
    <section className={`border-t border-border-subtle/50 first:border-t-0 py-5 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-heading">{title}</h3>
            {badge && (
              <span className="text-xs font-normal text-muted">{badge}</span>
            )}
          </div>
          {action && (
            <div className="flex items-center gap-2">
              {action}
            </div>
          )}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}
