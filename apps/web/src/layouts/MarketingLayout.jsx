import React, { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export default function MarketingLayout() {
  useEffect(() => {
    // Marketing pages (Landing, Terms, Privacy) always stay in original light mode
    document.documentElement.classList.remove('dark')
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <Outlet />
    </div>
  )
}