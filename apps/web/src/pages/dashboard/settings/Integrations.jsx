import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  Plus,
  Link2Off,
  Cloud,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import { settingsApi } from '../../../lib/api/settings';
import { queryKeys } from '../../../lib/queryKeys';

/**
 * Brand-mark tiles for the integration cards. The legacy page hand-coded one colored letter tile
 * per known id (github/slack/stripe/aws) and fell back to a plain `Cloud` icon for everything
 * else. Since the rebuilt API stores integrations by free-form name, we key off the name and keep
 * the exact same tile treatment for the known brands; anything unrecognized renders the legacy
 * `Cloud` fallback. No new colors — the tile classes are the legacy page's.
 */
const BRAND_ICONS = [
  { keys: ['github', 'gitlab', 'bitbucket'], letter: 'G', className: 'bg-gray-900 text-white' },
  { keys: ['slack'], letter: 'S', className: 'bg-purple-600 text-white' },
  { keys: ['stripe'], letter: 'S', className: 'bg-indigo-500 text-white' },
  { keys: ['aws', 'cloudwatch'], letter: 'A', className: 'bg-orange-500 text-white' },
];

function IntegrationIcon({ name }) {
  const normalized = (name || '').toLowerCase();
  const found = BRAND_ICONS.find((brand) => brand.keys.some((key) => normalized.includes(key)));
  if (!found) {
    return <Cloud size={24} className="text-muted" />;
  }
  return (
    <div className={`w-full h-full ${found.className} flex items-center justify-center font-bold text-xl rounded-button shadow-inner`}>
      {found.letter}
    </div>
  );
}

export default function SettingsIntegrations() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.integrations.all(),
    queryFn: settingsApi.getIntegrations,
  });

  const items = data?.items ?? [];
  const selected = items.find((i) => i.id === selectedId) || items[0] || null;
  const { data: logsData, isLoading: logsLoading, isError: logsError } = useQuery({
    queryKey: [...queryKeys.settings.integrations.detail(selected?.id || ''), 'webhook-logs'],
    queryFn: () => settingsApi.getIntegrationWebhookLogs(selected.id),
    enabled: Boolean(selected?.id),
  });
  const webhookLogs = logsData?.items ?? [];
  const visibleItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase())
    && (statusFilter === 'ALL' || item.status === statusFilter),
  );

  const toggleMutation = useMutation({
    mutationFn: ({ id, patch }) => settingsApi.updateIntegration(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id) => settingsApi.updateIntegration(id, { status: 'DISCONNECTED' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() }),
  });

  const createMutation = useMutation({
    mutationFn: (input) => settingsApi.createIntegration(input),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() });
      if (result?.id) setSelectedId(result.id);
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
    },
  });

  const setSync = (field, value) => {
    if (!selected) return;
    toggleMutation.mutate({ id: selected.id, patch: { [field]: value } });
  };

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
        Failed to load integrations.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'ALL' ? 'CONNECTED' : statusFilter === 'CONNECTED' ? 'CONFIGURE' : 'ALL')}
            className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised disabled:opacity-60"
          >
            Status: {statusFilter === 'ALL' ? 'All' : statusFilter === 'CONNECTED' ? 'Connected' : 'Configure'}
            <ChevronDown size={14} className="text-caption" />
          </button>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60"
          >
            <Plus size={16} /> Custom Webhook
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Integration Cards Grid */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-6 max-w-4xl">

            {visibleItems.map((integration) => {
              const isSelected = selected?.id === integration.id;

              return (
                <div
                  key={integration.id}
                  onClick={() => setSelectedId(integration.id)}
                  className={`bg-surface-raised border rounded-card-sm p-6 shadow-card cursor-pointer transition-all ${
                    isSelected
                      ? 'border-accent-light border-l-4 border-l-accent shadow-card-hover'
                      : 'border-border-default border-l-4 border-l-transparent hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-12 h-12 flex items-center justify-center shrink-0">
                      <IntegrationIcon name={integration.name} />
                    </div>
                    {integration.status === 'CONNECTED' ? (
                      <span className="inline-flex items-center gap-1.5 bg-success-light text-success-text px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide">
                        <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-surface-raised border border-border-default text-body-light px-3 py-1 rounded-full text-[11px] font-bold tracking-wide shadow-card">
                        Configure
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-heading mb-1">{integration.name}</h3>
                    <p className="text-sm text-muted">{integration.description || ''}</p>
                  </div>
                </div>
              );
            })}

            {visibleItems.length === 0 && <p className="col-span-2 py-10 text-sm text-muted text-center">No integrations match these filters.</p>}

          </div>
        </div>

        {/* Right: Integration Configuration Panel */}
        <div className="w-[400px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 shadow-panel z-10">

          <div className="flex-1 overflow-y-auto p-8">

            {selected ? (
              <>
                {/* Header */}
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0">
                    <IntegrationIcon name={selected.name} />
                  </div>
                  <h2 className="text-xl font-bold text-heading">{selected.name}</h2>
                </div>

                {/* Configuration Options */}
                <div className="mb-10">
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Configuration</h3>
                  <div className="border border-border-default rounded-card-sm bg-surface-raised shadow-card overflow-hidden divide-y divide-border-subtle">

                    {/* Option 1 */}
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-semibold text-heading">Sync Pull Requests</span>
                      <div
                        onClick={() => setSync('syncPullRequests', !selected.syncPullRequests)}
                        className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer shadow-panel ${selected.syncPullRequests ? 'bg-accent' : 'bg-surface-strong'}`}
                      >
                        <div className={`w-4 h-4 bg-on-primary rounded-full transition-transform shadow-card ${selected.syncPullRequests ? 'translate-x-5' : 'border border-border-strong'}`}></div>
                      </div>
                    </div>

                    {/* Option 2 */}
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-semibold text-heading">Sync CI/CD Status</span>
                      <div
                        onClick={() => setSync('syncCiCdStatus', !selected.syncCiCdStatus)}
                        className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer shadow-panel ${selected.syncCiCdStatus ? 'bg-accent' : 'bg-surface-strong'}`}
                      >
                        <div className={`w-4 h-4 bg-on-primary rounded-full transition-transform shadow-card ${selected.syncCiCdStatus ? 'translate-x-5' : 'border border-border-strong'}`}></div>
                      </div>
                    </div>

                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest">Webhook Logs</h3>
                    <button type="button" onClick={() => setShowAllLogs(current => !current)} className="text-[11px] font-bold text-accent hover:text-accent-hover transition-colors">{showAllLogs ? 'Show Recent' : 'View All'}</button>
                  </div>

                  <div className="bg-terminal rounded-card-sm p-4 font-mono text-[11px] shadow-card overflow-hidden flex flex-col gap-2.5">
                    {logsLoading ? <span className="text-terminal-muted">Loading delivery history...</span>
                      : logsError ? <span className="text-terminal-error">Delivery history could not be loaded.</span>
                        : webhookLogs.length === 0 ? <span className="text-terminal-muted">No webhook deliveries have been recorded.</span>
                          : (showAllLogs ? webhookLogs : webhookLogs.slice(0, 3)).map(log => (
                            <div key={log.id} className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`shrink-0 font-bold ${log.statusCode < 400 ? 'text-terminal-success' : 'text-terminal-error'}`}>{log.statusCode}</span>
                                <span className="truncate text-terminal-text">{log.event}</span>
                              </div>
                              <span className="shrink-0 text-terminal-muted opacity-60">{new Date(log.createdAt).toLocaleString()}</span>
                            </div>
                          ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-sm text-muted py-16 text-center">
                <Cloud size={32} className="opacity-20 mb-3" />
                No integrations configured yet.
              </div>
            )}

          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle mt-auto">
            <button
              type="button"
              onClick={() => selected && disconnectMutation.mutate(selected.id)}
              disabled={!selected || selected.status === 'DISCONNECTED' || disconnectMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-surface-raised border border-danger-border text-danger py-2.5 rounded-input text-sm font-bold hover:bg-danger-light transition-colors shadow-card disabled:opacity-60"
            >
              {disconnectMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Link2Off size={16} />}
              Disconnect Integration
            </button>
          </div>

        </div>
      </div>
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <form className="w-full max-w-md rounded-card bg-surface-raised p-6 shadow-panel" onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (name) createMutation.mutate({ name, description: newDescription.trim() || undefined, status: 'CONFIGURE' });
          }}>
            <h2 className="mb-4 text-lg font-bold text-heading">Add custom integration</h2>
            <label className="mb-3 block text-sm font-semibold text-heading">Name
              <input autoFocus required maxLength={120} value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1 w-full rounded-input border border-border-default bg-surface px-3 py-2 font-normal" />
            </label>
            <label className="mb-5 block text-sm font-semibold text-heading">Description
              <input maxLength={500} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="mt-1 w-full rounded-input border border-border-default bg-surface px-3 py-2 font-normal" />
            </label>
            {createMutation.isError && <p className="mb-3 text-sm text-danger">Could not create integration. Check the name and try again.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-input border border-border-default px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={createMutation.isPending || !newName.trim()} className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60">{createMutation.isPending ? 'Adding…' : 'Add integration'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
