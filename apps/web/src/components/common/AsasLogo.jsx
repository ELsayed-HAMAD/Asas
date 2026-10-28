import React from 'react'

/**
 * Asas Platform Logo
 * Official geometric emblem for Asas ERP platform.
 */
export function AsasLogo({
  className = 'w-6 h-6',
  fill = 'currentColor',
  ...props
}) {
  return (
    <svg
      viewBox="0 0 224 214"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M13.333 194.667L85.333 33.3333C91.9997 18.6667 102.666 10.6667 118.666 10.6667H132L65.333 158.667H140L124 194.667H13.333Z"
        fill={fill}
      />
      <path
        d="M144 33.3333L216 194.667H166.667L118.667 88L144 33.3333Z"
        fill={fill}
      />
    </svg>
  )
}

export default AsasLogo

