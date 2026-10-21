import React, { useEffect, useState } from 'react';
import {
  Clock,
  Shield,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Switch } from '../../../components/ui/switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { settingsApi } from '../../../lib/api/settings';
import { queryKeys } from '../../../lib/queryKeys';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';

/**
 * Reusable toggle wrapping shadcn/Radix Switch.
 */
const Toggle = ({ on, color = 'green', onClick, disabled = false }) => {
  return (
    <Switch
      checked={Boolean(on)}
      onCheckedChange={onClick}
      disabled={disabled}
      color={color}
    />
  );
};

/**
 * The event rows the legacy page rendered, keyed to the API's `modules.<module>.<eventType>`
 * vocabulary. These four match the legacy page 1:1 (same group label, same event name, same
 * hover-preview). Other events the API knows about (e.g. `finance.payment.failed`) are not shown
 * here — the legacy page never did — and round-trip untouched in the backend (the PATCH only
 * upserts the channels the user actually toggles).
 */
const EVENT_ROWS = [
  { group: 'Finance', module: 'finance', eventType: 'invoice.created', name: 'New invoice created', preview: 'invoice' },
  { group: 'HR', module: 'hr', eventType: 'leave.requested', name: 'Leave request submitted', preview: 'leave' },
];

const DEFAULT_PREFERENCES = { inApp: true, email: false, slack: false };

const getPreviewData = (event) => {
  switch (event) {
    case 'sprint':
      return { title: 'Action Required: Sprint Milestone', desc: 'A sprint milestone is ready for review.', btn: 'Review milestone', icon: 'S', color: 'bg-accent' };
    case 'system':
      return { title: 'Security Alert: New Login', desc: 'A new login was detected and needs review.', btn: 'Review activity', icon: '!', color: 'bg-danger' };
    case 'leave':
      return { title: 'Leave request submitted', desc: 'A teammate submitted a leave request for review.', btn: 'Review requests', icon: 'L', color: 'bg-accent' };
    case 'risk':
      return { title: 'Risk Escalation: Delay', desc: 'A project risk has been escalated for review.', btn: 'Review risk', icon: 'R', color: 'bg-warning' };
    case 'invoice':
    default:
      return { title: 'Action Required: Invoice Approval', desc: 'An invoice is waiting for approval.', btn: 'Review invoice', icon: 'A', color: 'bg-primary' };
  }
};

export default function SettingsNotifications() {
  const queryClient = useQueryClient();
  const { data: memberRole } = useActiveMemberRole();
  const roleName = getMemberRoleName(memberRole);
  const canManageSettings = roleName === 'OWNER' || roleName === 'ADMIN';
  const [previewEvent, setPreviewEvent] = useState('invoice');
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.notifications(),
    queryFn: settingsApi.getNotifications,
  });

  const updateMutation = useMutation({
    mutationFn: (patch) => settingsApi.updateNotifications(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() }),
  });

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface flex-1">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger flex-1">
        Failed to load notification settings.
      </div>
    );
  }

  const modules = draft?.modules ?? data.modules ?? {};
  const quietHours = draft?.quietHours ?? data.quietHours ?? { start: '22:00', end: '07:00' };

  const toggleChannel = (module, eventType, channel) => (checked) => {
    updateMutation.reset()
    setDraft(current => {
      const next = current ?? data
      const preferences = next.modules?.[module]?.[eventType] ?? DEFAULT_PREFERENCES
      return {
        ...next,
        modules: {
          ...next.modules,
          [module]: {
            ...next.modules?.[module],
            [eventType]: { ...preferences, [channel]: checked },
          },
        },
      }
    })
  };

  const setQuietHour = (field) => (event) => {
    updateMutation.reset()
    setDraft(current => ({
      ...(current ?? data),
      quietHours: { ...(current ?? data).quietHours, [field]: event.target.value },
    }))
  };

  const preview = getPreviewData(previewEvent);
  const visibleEventRows = EVENT_ROWS.filter(row => `${row.group} ${row.name} ${row.eventType}`.toLowerCase().includes(search.toLowerCase()))
  const savePreferences = () => {
    const modulesPatch = {}
    for (const row of EVENT_ROWS) {
      modulesPatch[row.module] ??= {}
      modulesPatch[row.module][row.eventType] = modules[row.module]?.[row.eventType] ?? DEFAULT_PREFERENCES
    }
    updateMutation.mutate({ modules: modulesPatch, quietHours })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden min-w-0 relative">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search..."
            wrapperClassName="w-64"
          />

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <Button
            type="button"
            disabled={!canManageSettings || updateMutation.isPending}
            title={!canManageSettings ? 'Only workspace admins and owners can change notification settings' : undefined}
            onClick={savePreferences}
            className="h-8 whitespace-nowrap"
          >
            {updateMutation.isPending ? 'Saving...' : updateMutation.isError ? 'Retry Save' : updateMutation.isSuccess ? 'Saved' : 'Save Preferences'}
          </Button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden relative">

        {/* Left: Configuration Content Area */}
        <div className="w-full min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-y-auto p-4 sm:p-8 max-w-4xl space-y-6 relative">

          {/* Delivery Schedule Card */}
          {/* Delivery Schedule Card */}
          <Card className="rounded-card-sm border-border-default shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-heading">Delivery Schedule</CardTitle>
              <CardDescription className="text-sm text-muted">Configure when you receive non-critical alerts.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {/* Quiet Hours */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-start gap-4">
                <Clock size={20} className="text-body shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-heading mb-1">Quiet Hours</h3>
                  <div className="flex items-center gap-3 text-sm text-body-light">
                    Pause all non-critical alerts between
                    <Input
                      type="time"
                      value={quietHours.start}
                      onChange={setQuietHour('start')}
                      disabled={!canManageSettings}
                      className="w-28 bg-surface-raised font-medium"
                    />
                    and
                    <Input
                      type="time"
                      value={quietHours.end}
                      onChange={setQuietHour('end')}
                      disabled={!canManageSettings}
                      className="w-28 bg-surface-raised font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Urgent alert behavior is fixed in the notification dispatcher. */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-start gap-4">
                <div className="flex items-center gap-4">
                  <Shield size={20} className="text-accent shrink-0" fill="var(--color-accent)" stroke="white" />
                  <div>
                    <h3 className="text-sm font-bold text-heading">Urgent alerts bypass quiet hours</h3>
                    <p className="mt-1 text-xs text-muted">This is a platform policy. It applies when a workflow emits an urgent alert.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Event Triggers & Channels Card */}
          <Card className="rounded-card-sm border-border-default shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-heading">Event Triggers & Channels</CardTitle>
              <CardDescription className="text-sm text-muted">In-app alerts are active. Email and Slack delivery are not connected for this deployment.</CardDescription>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="w-full">
                {/* Table Header */}
                <div className="grid grid-cols-12 py-3 border-b border-border-default">
                  <div className="col-span-6 text-[10px] font-bold text-muted uppercase tracking-widest">Event Type</div>
                  <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">In-App</div>
                  <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Email unavailable</div>
                  <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Slack unavailable</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-border-subtle">
                  {visibleEventRows.map((row) => {
                    const prefs = modules[row.module]?.[row.eventType] ?? DEFAULT_PREFERENCES;
                    return (
                      <div
                        key={`${row.module}.${row.eventType}`}
                        onMouseEnter={() => setPreviewEvent(row.preview)}
                        className="grid grid-cols-12 items-center py-5 cursor-pointer hover:bg-surface-active px-4 -mx-4 transition-colors rounded-lg"
                      >
                        <div className="col-span-6">
                          <span className={`block text-[10px] font-medium mb-0.5 ${row.danger ? 'text-danger' : 'text-muted'}`}>{row.group}</span>
                          <span className="block text-sm font-semibold text-heading">{row.name}</span>
                        </div>
                        <div className="col-span-2 flex justify-center"><Toggle on={prefs.inApp} color="green" disabled={!canManageSettings} onClick={toggleChannel(row.module, row.eventType, 'inApp')} /></div>
                        <div className="col-span-2 flex justify-center"><Toggle on={false} color="green" disabled /></div>
                        <div className="col-span-2 flex justify-center"><Toggle on={false} color="green" disabled /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right: Live Preview Panel */}
        <div className="w-full xl:w-[360px] xl:flex-shrink-0 bg-surface-raised border-t xl:border-t-0 xl:border-l border-border-default flex flex-col z-10">

          <div className="xl:flex-1 xl:overflow-y-auto p-8 space-y-8">

            {/* Live Preview Container */}
            <div>
              <h2 className="text-lg font-bold text-heading mb-6">Live Preview</h2>

              <div className="bg-gradient-to-b from-surface-muted to-surface-strong border border-border-default rounded-card p-6 shadow-panel h-80 flex flex-col justify-center">

                {/* Simulated Notification Card */}
                <div className="bg-surface-raised rounded-card-sm shadow-elevated p-5 border border-border-subtle">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 ${preview.color} rounded-xs flex items-center justify-center text-[10px] font-bold text-on-primary`}>
                        {preview.icon}
                      </div>
                      <span className="text-[11px] font-semibold text-body">Asas</span>
                    </div>
                    <span className="text-[10px] font-medium text-caption">Just Now</span>
                  </div>

                  <h3 className="text-sm font-bold text-heading leading-tight mb-2">
                    {preview.title}
                  </h3>

                  <p className="text-xs text-body-light leading-relaxed mb-4">
                    {preview.desc}
                  </p>

                  <Button disabled size="sm" title="Notification actions are not connected yet" className="w-full text-xs">
                    {preview.btn}
                  </Button>
                </div>

              </div>
            </div>

            {/* Notification volume is not exposed by the current API. */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6">30-Day Volume</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-border-subtle pb-4">
                  <span className="text-sm font-medium text-body-light">Total Sent</span>
                  <span className="text-lg font-black text-heading tracking-tight">—</span>
                </div>

                <div className="flex justify-between items-end">
                  <span className="text-sm font-medium text-body-light">Unread In-App</span>
                  <span className="text-lg font-black text-heading tracking-tight">—</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
