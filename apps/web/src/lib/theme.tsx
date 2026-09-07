import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'asas-theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

function resolveEffective(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Private mode / SSR — fall through to system.
  }
  return 'system'
}

interface ThemeContextValue {
  theme: Theme
  effective: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

/**
 * Manual theme override for the `.dark` token block in `index.css`.
 *
 * The app already follows the OS via `@media (prefers-color-scheme: dark)`;
 * this provider adds the explicit `.dark` class path so a user can pick
 * light/dark regardless of OS. `system` (default) removes the class and
 * defers back to the media query. Persisted in `localStorage` — theme
 * preference only, never auth.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => readStored())
  const effective = resolveEffective(theme)

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', effective === 'dark')
  }, [effective])

  // Follow OS changes live while in `system` mode.
  React.useEffect(() => {
    if (theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      document.documentElement.classList.toggle('dark', query.matches)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-fatal — theme just won't persist.
    }
  }, [])

  const toggle = React.useCallback(() => {
    setThemeState(current => {
      const next: Theme = resolveEffective(current) === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = React.useMemo(
    () => ({ theme, effective, setTheme, toggle }),
    [theme, effective, setTheme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>')
  return ctx
}
