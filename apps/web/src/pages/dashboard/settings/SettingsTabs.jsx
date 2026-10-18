import { useLocation, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'

export default function SettingsTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const tabs = [
    { name: 'General', path: '/dashboard/settings' },
    { name: 'Members & Roles', path: '/dashboard/settings/members' },
    { name: 'Billing & Plans', path: '/dashboard/settings/billing' },
    { name: 'Integrations', path: '/dashboard/settings/integrations' },
    { name: 'Notifications', path: '/dashboard/settings/notifications' },
    { name: 'Data Export', path: '/dashboard/settings/data-export' },
  ]

  const activeTab = tabs.find(t => t.path === pathname)?.path || '/dashboard/settings'

  return (
    <nav aria-label="Settings navigation" className="bg-surface-raised border-b border-border-default z-10 flex-shrink-0 pt-2 px-4 md:px-8">
      <Tabs value={activeTab} onValueChange={(val) => navigate(val)}>
        <TabsList className="h-auto bg-transparent p-0 justify-start gap-x-4 md:gap-x-8 rounded-none border-0">
          {tabs.map((tab) => {
            const isActive = pathname === tab.path
            return (
              <TabsTrigger
                key={tab.path}
                value={tab.path}
                className="relative pb-3 pt-0 px-0 rounded-none bg-transparent shadow-none text-sm font-medium transition-colors text-muted hover:text-body data-[state=active]:bg-transparent data-[state=active]:text-heading data-[state=active]:shadow-none cursor-pointer"
              >
                {tab.name}
                {isActive && (
                  <div
                    className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary transition-all"
                  />
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>
    </nav>
  )
}

