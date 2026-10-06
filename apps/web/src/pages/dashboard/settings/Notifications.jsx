import React, { useState } from 'react';
import {
  Search,
  Clock,
  Shield,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import { settingsApi } from '../../../lib/api/settings';
import { queryKeys } from '../../../lib/queryKeys';

/**
 * Reusable toggle (verbatim from the legacy page). `onClick` — when provided — toggles the
 * underlying channel; when omitted the toggle is a visual no-op (used for the marketing-style
 * "security override" switch that has no backend equivalent).
 */
const Toggle = ({ on, color = 'green', onClick }) => {
  let bgClass = 'bg-surface-strong';
  if (on) {
    bgClass = color === 'red' ? 'bg-danger' : 'bg-success';
  }
  const translateClass = on ? 'translate-x-5' : 'translate-x-0';
  const borderClass = !on ? 'border border-border-strong' : '';

  return (
    <div onClick={onClick} className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer transition-colors shadow-panel ${bgClass}`}>
      <div className={`w-4 h-4 bg-on-primary rounded-full shadow-card transition-transform ${translateClass} ${borderClass}`}></div>
    </div>
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
  { group: 'Finance', module: 'finance', eventType: 'invoice.approval', name: 'Invoice Approvals', preview: 'invoice' },
  { group: 'Projects', module: 'projects', eventType: 'sprint.milestone', name: 'Sprint Milestone', preview: 'sprint' },
  { group: 'System', module: 'system', eventType: 'security.new_login', name: 'New Login (New IP)', preview: 'system', danger: true },
  { group: 'Risks', module: 'projects', eventType: 'risk.escalation', name: 'Risk Matrix Escalation', preview: 'risk' },
];

const DEFAULT_PREFERENCES = { inApp: true, email: true, slack: false };

const getPreviewData = (event) => {
  switch (event) {
    case 'sprint':
      return { title: 'Action Required: Sprint Milestone', desc: 'A sprint milestone is ready for review.', btn: 'Review milestone', icon: 'S', color: 'bg-accent' };
    case 'system':
      return { title: 'Security Alert: New Login', desc: 'A new login was detected and needs review.', btn: 'Review activity', icon: '!', color: 'bg-danger' };
    case 'risk':
      return { title: 'Risk Escalation: Delay', desc: 'A project risk has been escalated for review.', btn: 'Review risk', icon: 'R', color: 'bg-warning' };
    case 'invoice':
    default:
      return { title: 'Action Required: Invoice Approval', desc: 'An invoice is waiting for approval.', btn: 'Review invoice', icon: 'A', color: 'bg-primary' };
  }
};

export default function SettingsNotifications() {
  const queryClient = useQueryClient();
  const [previewEvent, setPreviewEvent] = useState('invoice');
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.notifications(),
    queryFn: settingsApi.getNotifications,
  });

  const updateMutation = useMutation({
    mutationFn: (patch) => settingsApi.updateNotifications(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() }),
  });

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

  const modules = data.modules ?? {};
  const quietHours = data.quietHours ?? { start: '22:00', end: '07:00' };

  const toggleChannel = (module, eventType, channel) => (event) => {
    event.stopPropagation();
    const current = (modules[module]?.[eventType] ?? DEFAULT_PREFERENCES)[channel];
    updateMutation.mutate({ modules: { [module]: { [eventType]: { [channel]: !current } } } });
  };

  const setQuietHour = (field) => (event) => {
    updateMutation.mutate({ quietHours: { [field]: event.target.value } });
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
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <button
            type="button"
            disabled={updateMutation.isPending}
            onClick={savePreferences}
            className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Saving...' : updateMutation.isError ? 'Retry Save' : 'Save Preferences'}
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Configuration Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl space-y-6">

          {/* Delivery Schedule Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Delivery Schedule</h2>
            <p className="text-sm text-muted mb-6">Configure when you receive non-critical alerts.</p>

            <div className="space-y-4">
              {/* Quiet Hours */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-start gap-4">
                <Clock size={20} className="text-body shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-heading mb-1">Quiet Hours</h3>
                  <div className="flex items-center gap-3 text-sm text-body-light">
                    Pause all non-critical alerts between
                    <input
                      type="time"
                      value={quietHours.start}
                      onChange={setQuietHour('start')}
                      className="bg-surface-raised border border-border-strong px-3 py-1.5 rounded-input text-heading font-medium shadow-card focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                    and
                    <input
                      type="time"
                      value={quietHours.end}
                      onChange={setQuietHour('end')}
                      className="bg-surface-raised border border-border-strong px-3 py-1.5 rounded-input text-heading font-medium shadow-card focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Security Override */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Shield size={20} className="text-accent shrink-0" fill="var(--color-accent)" stroke="white" />
                  <h3 className="text-sm font-bold text-heading">Override for Critical Security Alerts</h3>
                </div>
                <Toggle on={true} color="green" />
              </div>
            </div>
          </div>

          {/* Event Triggers & Channels Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Event Triggers & Channels</h2>
            <p className="text-sm text-muted mb-6">Route specific events to preferred platforms.</p>

            <div className="w-full">
              {/* Table Header */}
              <div className="grid grid-cols-12 py-3 border-b border-border-default">
                <div className="col-span-6 text-[10px] font-bold text-muted uppercase tracking-widest">Event Type</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">In-App</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Email</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Slack</div>
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
                      <div className="col-span-2 flex justify-center"><Toggle on={prefs.inApp} color="green" onClick={toggleChannel(row.module, row.eventType, 'inApp')} /></div>
                      <div className="col-span-2 flex justify-center"><Toggle on={prefs.email} color="green" onClick={toggleChannel(row.module, row.eventType, 'email')} /></div>
                      <div className="col-span-2 flex justify-center"><Toggle on={prefs.slack} color="green" onClick={toggleChannel(row.module, row.eventType, 'slack')} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* Right: Live Preview Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 z-10">

          <div className="flex-1 overflow-y-auto p-8 space-y-8">

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

                  <button disabled title="Notification actions are not connected yet" className="w-full bg-primary text-on-primary text-xs font-semibold py-2.5 rounded-input hover:bg-primary-hover transition-colors disabled:opacity-60">
                    {preview.btn}
                  </button>
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
