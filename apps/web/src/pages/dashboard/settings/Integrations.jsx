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
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
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
  { keys: ['github', 'gitlab', 'bitbucket'], letter: 'G', className: 'bg-terminal text-terminal-text' },
  { keys: ['slack'], letter: 'S', className: 'bg-primary text-on-primary' },
  { keys: ['stripe'], letter: 'S', className: 'bg-accent text-on-primary' },
  { keys: ['aws', 'cloudwatch'], letter: 'A', className: 'bg-chart-orange text-on-primary' },
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
  const [newCredential, setNewCredential] = useState('');
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [credentialInput, setCredentialInput] = useState('');
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

  const removeEndpointMutation = useMutation({
    mutationFn: (id) => settingsApi.updateIntegration(id, { credential: { clear: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() }),
  });

  const testPingMutation = useMutation({
    mutationFn: (id) => settingsApi.testIntegration(id),
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
      setNewCredential('');
    },
  });
  const mutationError = [toggleMutation, removeEndpointMutation, testPingMutation, createMutation]
    .find(mutation => mutation.isError)?.error?.message

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
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden min-w-0 relative">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption z-10 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search integrations..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 pr-4 py-1.5 h-8 text-sm w-64 bg-surface-raised"
            />
          </div>

          <Button
            variant="outline"
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'ALL' ? 'CONNECTED' : statusFilter === 'CONNECTED' ? 'CONFIGURE' : 'ALL')}
            className="h-8 gap-2 text-body"
          >
            Status: {statusFilter === 'ALL' ? 'All' : statusFilter === 'CONNECTED' ? 'Last check passed' : 'Check required'}
            <ChevronDown size={14} className="text-caption" />
          </Button>

          <Button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-8 gap-2"
          >
            <Plus size={16} /> Custom Endpoint
          </Button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden relative">

        {/* Left: Integration Cards Grid */}
        <div className="w-full min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-y-auto p-4 sm:p-8 relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl">

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
                      <Badge className="bg-success-light text-success-text hover:bg-success-light gap-1.5 text-[11px] font-bold tracking-wide">
                        <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                        Last check passed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-bold tracking-wide">
                        Check required
                      </Badge>
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
        <div className="w-full xl:w-[400px] xl:flex-shrink-0 bg-surface-raised border-t xl:border-t-0 xl:border-l border-border-default flex flex-col shadow-panel z-10">

          <div className="xl:flex-1 xl:overflow-y-auto p-8">

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
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Endpoint health check</h3>
                  <p className="mb-4 text-xs text-muted">Send a POST ping to check the configured HTTPS endpoint. This records the endpoint response only; business-event delivery and provider sync are not available.</p>
                  <div className="border border-border-default rounded-card-sm bg-surface-raised shadow-card overflow-hidden divide-y divide-border-subtle">

                    {/* Option 1 */}
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-semibold text-heading">Pull request sync (not active)</span>
                      <Switch
                        checked={Boolean(selected.syncPullRequests)}
                        disabled
                        color="primary"
                      />
                    </div>

                    {/* Option 2 */}
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-semibold text-heading">CI/CD sync (not active)</span>
                      <Switch
                        checked={Boolean(selected.syncCiCdStatus)}
                        disabled
                        color="primary"
                      />
                    </div>

                    {/* Option 3: Credential */}
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <span className="text-sm font-semibold text-heading block">HTTPS endpoint URL</span>
                        <span className="text-xs text-muted block mt-0.5">
                          {selected.credential?.configured ? `Configured (${selected.credential.masked})` : 'Not configured'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => { setCredentialInput(''); setShowCredentialModal(true); }}
                        className="text-xs font-semibold text-accent hover:text-accent-hover"
                      >
                        {selected.credential?.configured ? 'Update Endpoint' : 'Add Endpoint'}
                      </Button>
                    </div>

                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest">Endpoint check logs</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="link"
                        disabled={!selected?.credential?.configured || testPingMutation.isPending}
                        onClick={() => selected && testPingMutation.mutate(selected.id)}
                        className="text-[11px] font-bold text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                        title="Send a test ping to the configured public HTTPS endpoint"
                      >
                        {testPingMutation.isPending ? 'Pinging…' : 'Send Test Ping'}
                      </Button>
                      <span className="text-muted text-[10px]">·</span>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setShowAllLogs(current => !current)}
                        className="text-[11px] font-bold text-accent hover:text-accent-hover transition-colors"
                      >
                        {showAllLogs ? 'Show Recent' : 'View All'}
                      </Button>
                    </div>
                  </div>

                  <div className="bg-terminal rounded-card-sm p-4 font-mono text-[11px] shadow-card overflow-hidden flex flex-col gap-2.5">
                    {logsLoading ? <span className="text-terminal-muted">Loading endpoint-check history...</span>
                      : logsError ? <span className="text-terminal-error">Endpoint-check history could not be loaded.</span>
                        : webhookLogs.length === 0 ? <span className="text-terminal-muted">No endpoint checks have been recorded.</span>
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
          <div className="p-8 bg-surface-raised border-t border-border-subtle mt-auto space-y-3">
            {mutationError && <p role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger">{mutationError}</p>}
            {selected && selected.status !== 'CONNECTED' ? (
              <Button
                type="button"
                onClick={() => testPingMutation.mutate(selected.id)}
                disabled={testPingMutation.isPending || !selected.credential?.configured}
                className="w-full flex items-center justify-center gap-2"
              >
                {testPingMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                Test Endpoint
              </Button>
            ) : (
              <Button
                variant="destructive"
                type="button"
                onClick={() => {
                  if (selected && window.confirm(`Are you sure you want to disconnect ${selected.name}?`)) {
                    removeEndpointMutation.mutate(selected.id);
                  }
                }}
                disabled={!selected?.credential?.configured || removeEndpointMutation.isPending}
                className="w-full flex items-center justify-center gap-2"
              >
                {removeEndpointMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Link2Off size={16} />}
                Remove Endpoint
              </Button>
            )}
          </div>

        </div>
      </div>
      {showCredentialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <form className="w-full max-w-md rounded-card bg-surface-raised p-6 shadow-panel" onSubmit={(event) => {
            event.preventDefault();
            const val = credentialInput.trim();
            if (val && selected) {
              toggleMutation.mutate({ id: selected.id, patch: { credential: { value: val } } }, {
                onSuccess: () => {
                  setShowCredentialModal(false);
                  setCredentialInput('');
                },
              });
            }
          }}>
            <h2 className="mb-2 text-lg font-bold text-heading">Configure endpoint</h2>
            <p className="mb-4 text-xs text-muted">Enter the public HTTPS URL for {selected?.name}. It is encrypted at rest and checked only when you send a test ping.</p>
            {toggleMutation.isError && <p role="alert" className="mb-3 text-sm text-danger">{toggleMutation.error?.message || 'Could not save the endpoint. Try again.'}</p>}
            <label className="mb-4 block text-sm font-semibold text-heading">Public HTTPS endpoint
              <Input
                type="password"
                autoFocus
                required
                maxLength={4096}
                value={credentialInput}
                onChange={(event) => setCredentialInput(event.target.value)}
                placeholder="https://hooks.example.com/asas"
                className="mt-1 w-full bg-surface"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCredentialModal(false)}>Cancel</Button>
              <Button type="submit" disabled={!credentialInput.trim() || toggleMutation.isPending}>
                {toggleMutation.isPending ? 'Saving…' : 'Save endpoint'}
              </Button>
            </div>
          </form>
        </div>
      )}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <form className="w-full max-w-md rounded-card bg-surface-raised p-6 shadow-panel" onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (name) {
              createMutation.mutate({
                name,
                description: newDescription.trim() || undefined,
                credential: newCredential.trim() || undefined,
              });
            }
          }}>
            <h2 className="mb-4 text-lg font-bold text-heading">Add endpoint check</h2>
            <label className="mb-3 block text-sm font-semibold text-heading">Name
              <Input autoFocus required maxLength={120} value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1 w-full bg-surface" />
            </label>
            <label className="mb-3 block text-sm font-semibold text-heading">Description
              <Input maxLength={500} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="mt-1 w-full bg-surface" />
            </label>
            <label className="mb-5 block text-sm font-semibold text-heading">Public HTTPS endpoint (optional)
              <Input type="url" maxLength={4096} value={newCredential} onChange={(event) => setNewCredential(event.target.value)} placeholder="https://hooks.example.com/asas" className="mt-1 w-full bg-surface" />
            </label>
            {createMutation.isError && <p className="mb-3 text-sm text-danger">Could not create integration. Check the name and try again.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || !newName.trim()}>{createMutation.isPending ? 'Adding…' : 'Add integration'}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
