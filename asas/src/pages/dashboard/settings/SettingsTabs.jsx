import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function SettingsTabs() {
  const { pathname } = useLocation()
  
  const tabs = [
    { name: 'General', path: '/dashboard/settings' },
    { name: 'Billing & Plans', path: '/dashboard/settings/billing' },
    { name: 'Integrations', path: '/dashboard/settings/integrations' },
    { name: 'Notifications', path: '/dashboard/settings/notifications' },
    { name: 'Data Export', path: '/dashboard/settings/data-export' },
  ]

  return (
    <div className="flex items-center gap-8 px-8 bg-surface-raised border-b border-border-default z-10 flex-shrink-0 pt-2">
      {tabs.map(tab => {
        const isActive = pathname === tab.path
        return (
          <Link 
            key={tab.path} 
            to={tab.path} 
            className={`relative pb-3 text-sm font-medium transition-colors ${isActive ? 'text-heading' : 'text-muted hover:text-body'}`}
          >
            {tab.name}
            {isActive && (
              <motion.div
                layoutId="activeSettingsTab"
                className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </Link>
        )
      })}
    </div>
  )
}
