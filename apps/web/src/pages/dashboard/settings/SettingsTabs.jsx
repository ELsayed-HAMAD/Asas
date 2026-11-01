import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  CreditCard,
  Database,
  Download,
  PlugZap,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'

export default function SettingsTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const tabs = [
    { name: 'General', path: '/dashboard/settings', icon: SlidersHorizontal },
    { name: 'Members & Roles', path: '/dashboard/settings/members', icon: Users },
    { name: 'Billing & Plans', path: '/dashboard/settings/billing', icon: CreditCard },
    { name: 'Integrations', path: '/dashboard/settings/integrations', icon: PlugZap },
    { name: 'Notifications', path: '/dashboard/settings/notifications', icon: Bell },
    { name: 'Data Export', path: '/dashboard/settings/data-export', icon: Download },
    { name: 'Data Migration', path: '/dashboard/settings/data-migration', icon: Database },
  ]

  const activeTab = tabs.find(tab => tab.path === pathname)?.path || '/dashboard/settings'

  return (
    <nav aria-label="Settings navigation" className="z-10 flex-shrink-0 px-4 pt-4 md:px-8">
      <Tabs value={activeTab} onValueChange={(val) => navigate(val)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-border-default bg-surface-raised/75 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl sm:grid-cols-3 md:grid-cols-4 xl:flex xl:w-max xl:min-w-full xl:flex-nowrap xl:justify-between">
          {tabs.map((tab) => {
            const isActive = pathname === tab.path
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.path}
                value={tab.path}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-muted shadow-none transition-colors hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=active]:bg-surface-active data-[state=active]:text-heading data-[state=active]:shadow-[0_3px_12px_rgba(0,0,0,0.07)] sm:px-3 sm:whitespace-nowrap"
              >
                <Icon size={14} className={`shrink-0 ${isActive ? 'text-accent' : 'text-caption'}`} />
                <span className="min-w-0">{tab.name}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>
    </nav>
  )
}
