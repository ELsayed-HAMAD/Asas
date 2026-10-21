import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../lib/authClient'
import { queryKeys } from '../lib/queryKeys'
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Code2,
  DollarSign,
  Settings,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { http } from '../lib/api/http'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getCategoryIcon(category) {
  switch (category?.toLowerCase()) {
    case 'finance':
      return { icon: DollarSign, bg: 'bg-success-light text-success' }
    case 'hr':
      return { icon: Users, bg: 'bg-primary-light text-primary' }
    case 'crm':
      return { icon: TrendingUp, bg: 'bg-accent-light text-accent' }
    case 'projects':
    case 'sprints':
      return { icon: Code2, bg: 'bg-warning-light text-warning' }
    case 'success':
      return { icon: CheckCircle2, bg: 'bg-success-light text-success' }
    case 'warning':
      return { icon: Bell, bg: 'bg-warning-light text-warning' }
    case 'danger':
      return { icon: Bell, bg: 'bg-danger-light text-danger' }
    default:
      return { icon: Bell, bg: 'bg-surface-muted text-muted' }
  }
}

export default function NotificationPopover() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [open, setOpen] = useState(false)

  const { data: notificationsData, isLoading, isError } = useQuery({
    queryKey: queryKeys.notifications.user(userId ?? 'signed-out'),
    queryFn: () => http.get('/notifications'),
    enabled: Boolean(userId),
    refetchInterval: 20000,
  })

  const notifications = notificationsData?.items || []
  const unreadCount = notificationsData?.unreadCount ?? 0

  const markReadMutation = useMutation({
    mutationFn: (id) => http.patch(`/notifications/${id}/read`, { body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => http.post('/notifications/mark-all-read', { body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => http.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() })
    },
  })

  const filteredItems = filter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id)
    }
    if (typeof notification.link === 'string' && notification.link.startsWith('/') && !notification.link.startsWith('//')) {
      setOpen(false)
      navigate(notification.link)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative h-9 w-9 flex items-center justify-center rounded-button text-body hover:text-heading hover:bg-surface-muted hover-lift transition-micro cursor-pointer active:scale-[0.98]"
          title="Notifications"
          aria-label="Open notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-on-primary text-[10px] font-bold leading-none ring-2 ring-surface-raised shadow-xs animate-in zoom-in-50">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-0 glass-strong border border-border-default/80 rounded-card shadow-glass overflow-hidden z-50 text-heading animate-scale-in"
      >
        {/* Header */}
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold tracking-tight text-heading">Notifications</h3>
            {unreadCount > 0 && (
              <Badge className="bg-danger-light text-danger-text border-danger-border text-[10px] px-1.5 py-0 font-semibold">
                {unreadCount} unread
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="h-7 text-[11px] font-medium text-accent hover:text-accent-hover px-2 flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="px-4 py-2 bg-surface-muted border-b border-border-subtle flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-button font-medium transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-surface-raised text-heading shadow-card font-semibold'
                : 'text-caption hover:text-heading'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`text-xs px-2.5 py-1 rounded-button font-medium transition-colors cursor-pointer ${
              filter === 'unread'
                ? 'bg-surface-raised text-heading shadow-card font-semibold'
                : 'text-caption hover:text-heading'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* List Body */}
        <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-xs text-caption" role="status">Loading notifications…</div>
          ) : isError ? (
            <div className="px-5 py-8 text-center text-xs text-danger-text" role="alert">Notifications could not be loaded. Try again shortly.</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center mx-auto mb-3 text-muted">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <p className="text-xs font-bold text-heading">You're all caught up</p>
              <p className="text-[11px] text-caption mt-1 max-w-[200px] mx-auto leading-relaxed">
                {filter === 'unread'
                  ? 'No unread notifications at this time.'
                  : 'New operational alerts and invoices will appear here.'}
              </p>
            </div>
          ) : (
            filteredItems.map((n) => {
              const { icon: CatIcon, bg: catBg } = getCategoryIcon(n.type)
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleNotificationClick(n)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title}. ${n.read ? 'Read' : 'Unread'}`}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer group ${
                    n.read
                      ? 'bg-surface-raised hover:bg-surface-muted'
                      : 'bg-primary-light/40 hover:bg-primary-light/60'
                  }`}
                >
                  {/* Category icon */}
                  <div className={`p-2 rounded-card-sm flex-shrink-0 mt-0.5 ${catBg}`}>
                    <CatIcon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-xs truncate ${
                          n.read
                            ? 'text-body font-medium'
                            : 'text-heading font-bold'
                        }`}
                      >
                        {n.title}
                      </p>
                      <span className="text-[10px] text-caption flex-shrink-0">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-caption line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>

                    {n.link && (
                      <span className="inline-block mt-1.5 text-[11px] font-semibold text-accent hover:underline">
                        View details &rarr;
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          markReadMutation.mutate(n.id)
                        }}
                        title="Mark as read"
                        className="p-1 rounded text-caption hover:text-heading hover:bg-surface-active"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteMutation.mutate(n.id)
                      }}
                      title="Delete notification"
                      className="p-1 rounded text-caption hover:text-danger hover:bg-danger-light"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-surface-muted border-t border-border-subtle flex items-center justify-between text-xs text-caption">
          <span className="text-[11px]">Refreshes every 20 seconds</span>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/dashboard/settings/notifications')
            }}
            className="flex items-center gap-1 text-[11px] text-accent hover:underline font-medium cursor-pointer"
          >
            <Settings className="w-3 h-3" />
            <span>Preferences</span>
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
