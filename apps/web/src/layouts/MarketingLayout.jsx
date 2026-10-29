import React, { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export default function MarketingLayout() {
  useEffect(() => {
    // Marketing pages (Landing, Terms, Privacy) always stay in original light mode,
    // but the user's dashboard theme must be restored when they navigate back.
    let savedTheme = false
    try {
      savedTheme = window.localStorage.getItem('theme') === 'dark'
    } catch {
      // Storage can be unavailable; the page still stays light for this visit.
    }
    document.documentElement.classList.remove('dark')
    return () => {
      if (savedTheme) document.documentElement.classList.add('dark')
    }
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <Outlet />
    </div>
  )
}