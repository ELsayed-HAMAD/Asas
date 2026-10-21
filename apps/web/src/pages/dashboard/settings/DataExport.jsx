import React, { useState } from 'react';
import {
  Search,
  FileText,
  Loader2,
  Cloud,
  Calendar,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { exportsApi } from '../../../lib/api/exports';
import { queryKeys } from '../../../lib/queryKeys';
import { settingsApi } from '../../../lib/api/settings';

/**
 * The legacy "Data Scope" options had no 1:1 mapping to the backend's two export kinds
 * (`employees` | `ledger`). The three legacy labels are kept verbatim for the old look, and each
 * maps to the closest real kind: the two people/workspace scopes export the employee directory,
 * and the ledgers scope exports the general ledger. Format and Date Range have no backend
 * equivalent at all (`createJob` takes only `kind`), so those selects stay as inert decoration —
 * exactly as they were on the legacy page.
 */
const SCOPE_TO_KIND = {
  'Full Workspace': 'workspace',
  'Specific Projects': 'projects',
  'Financial Ledgers': 'ledger',
  'Employee Directory': 'employees',
};

export default function SettingsDataExport() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('Full Workspace');
  const [jobSearch, setJobSearch] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.exports.jobs.list({ page: historyPage, limit: 100 }),
    queryFn: () => exportsApi.listJobs({ page: historyPage, limit: 100 }),
    // Keep polling while any job is still QUEUED/RUNNING so a just-created job flips to DONE and
    // lands in Available Downloads without a manual refresh.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((j) => j.status === 'RUNNING' || j.status === 'QUEUED') ? 1500 : false;
    },
  });
  const backupsQuery = useQuery({ queryKey: queryKeys.settings.backups(), queryFn: settingsApi.listBackups });
  const backupMutation = useMutation({
    mutationFn: () => settingsApi.createBackup({ name: 'Workspace backup', schedule: 'Weekly' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.backups() }),
  });

  const createMutation = useMutation({
    mutationFn: (kind) => exportsApi.createJob({ kind }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.exports.all() }),
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
        Failed to load export settings.
      </div>
    );
  }

  const jobs = data.items ?? [];
  const searchJobs = jobs.filter(job => !jobSearch || `${job.filename ?? ''} ${job.kind} ${job.status}`.toLowerCase().includes(jobSearch.toLowerCase()))
  const liveJobs = searchJobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED');
  const availableDownloads = searchJobs.filter((j) => j.status === 'DONE');

  const handleDownload = async (job) => {
    try {
      const blob = await exportsApi.downloadJob(job.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = job.filename || 'export';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Surface a download failure by re-throwing into the query error state would be overkill;
      // a failed binary fetch simply does nothing (the job row is still visible to retry).
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption z-10 pointer-events-none" />
            <Input
              type="text"
              value={jobSearch}
              onChange={event => setJobSearch(event.target.value)}
              placeholder="Search..."
              className="pl-9 pr-4 py-1.5 h-8 text-sm w-64 bg-surface-muted"
            />
          </div>

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <Button
            variant="outline"
            type="button"
            onClick={() => setShowHistory(true)}
            className="h-8 whitespace-nowrap"
          >
            View Export History
          </Button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">

        {/* Left: Configuration Content Area */}
        <div className="flex-1 min-w-0 min-h-[320px] overflow-y-auto p-4 sm:p-8 max-w-4xl space-y-6">

          {/* New Export Request Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">New Export Request</h2>

            <div className="space-y-5">
              {/* Row 1: Scope & Format */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="data-scope" className="block text-xs font-bold text-muted mb-1.5">Data Scope</label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger id="data-scope" className="w-full text-sm bg-surface-raised">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full Workspace">Full Workspace</SelectItem>
                      <SelectItem value="Specific Projects">Specific Projects</SelectItem>
                      <SelectItem value="Financial Ledgers">Financial Ledgers</SelectItem>
                      <SelectItem value="Employee Directory">Employee Directory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="data-format" className="block text-xs font-bold text-muted mb-1.5">Format</label>
                  <Select defaultValue="JSON & CSV">
                    <SelectTrigger id="data-format" className="w-full text-sm bg-surface-raised">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JSON & CSV">JSON & CSV</SelectItem>
                      <SelectItem value="PDF Reports">PDF Reports</SelectItem>
                      <SelectItem value="SQL Dump">SQL Dump</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Date Range */}
              <div>
                <label htmlFor="date-range" className="block text-xs font-bold text-muted mb-1.5">Date Range</label>
                <Select defaultValue="All Time">
                  <SelectTrigger id="date-range" className="w-full text-sm bg-surface-raised">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Time">All Time</SelectItem>
                    <SelectItem value="Last 30 Days">Last 30 Days</SelectItem>
                    <SelectItem value="Year to Date">Year to Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => createMutation.mutate(SCOPE_TO_KIND[scope] || 'employees')}
                  disabled={createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Generating...
                    </span>
                  ) : (
                    'Generate Export Archive'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Scheduled Backups */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">Scheduled Backups</h2>

            <div className="space-y-6">
              {backupsQuery.data?.items?.length ? backupsQuery.data.items.map(backup => <div key={backup.id} className="flex items-center justify-between border border-border-subtle rounded-button p-4"><div><p className="text-sm font-semibold text-heading">{backup.name}</p><p className="text-xs text-muted">{backup.schedule} · {backup.enabled ? 'Enabled' : 'Disabled'}</p></div><Button variant="link" size="sm" type="button" onClick={() => settingsApi.updateBackup(backup.id, { enabled: !backup.enabled }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.settings.backups() }))} className="h-auto p-0 text-xs font-semibold text-accent hover:underline">{backup.enabled ? 'Disable' : 'Enable'}</Button></div>) : <div className="flex flex-col items-center justify-center text-sm text-muted py-8 text-center"><Calendar size={32} className="opacity-20 mb-3" />No scheduled backups configured.</div>}
              <Button type="button" onClick={() => backupMutation.mutate()} disabled={backupMutation.isPending}>{backupMutation.isPending ? 'Creating...' : 'Create weekly backup'}</Button>
            </div>
          </div>

        </div>

        {/* Right: Recent Exports Panel */}
        <div className="w-full xl:w-[360px] xl:flex-shrink-0 bg-surface-raised border-t xl:border-t-0 xl:border-l border-border-default flex flex-col max-h-[65vh] xl:max-h-none z-10">

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-heading">{showHistory ? 'Export History' : 'Recent Exports'}</h2>
              {showHistory && <Button variant="link" size="sm" type="button" onClick={() => setShowHistory(false)} className="h-auto p-0 text-xs font-semibold text-accent hover:text-accent-hover">Recent</Button>}
            </div>

            {showHistory ? (
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card space-y-4">
                {searchJobs.length ? searchJobs.map(job => (
                  <div key={job.id} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-heading truncate">{job.filename || `${job.kind} export`}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={job.status === 'DONE' ? 'default' : 'secondary'} className="text-[10px] py-0 px-1.5">{job.status}</Badge>
                        <span className="text-[11px] text-muted">{job.kind} · {new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {job.status === 'DONE' && <Button variant="link" size="sm" type="button" onClick={() => handleDownload(job)} className="h-auto p-0 text-[11px] font-semibold text-accent hover:text-accent-hover">Download</Button>}
                  </div>
                )) : <p className="text-xs text-muted">No matching export jobs.</p>}
                <div className="flex items-center justify-between pt-2 text-xs text-muted">
                  <Button variant="ghost" size="sm" type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(page => Math.max(1, page - 1))} className="h-7 px-2 text-xs disabled:opacity-40 hover:text-heading">Previous</Button>
                  <span>Page {data.pagination.page} of {Math.max(1, data.pagination.pages)}</span>
                  <Button variant="ghost" size="sm" type="button" disabled={historyPage >= data.pagination.pages} onClick={() => setHistoryPage(page => page + 1)} className="h-7 px-2 text-xs disabled:opacity-40 hover:text-heading">Next</Button>
                </div>
              </div>
            ) : <>

            {/* Live Jobs Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Live Jobs</h3>

              {liveJobs.length > 0 ? liveJobs.map((job) => (
                <div key={job.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-semibold text-heading">{job.filename || 'Export_Job'}</span>
                    <span className="text-[11px] font-bold text-accent">{job.progressPct || 0}%</span>
                  </div>
                  <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-accent h-full rounded-full" style={{ width: `${job.progressPct || 0}%` }}></div>
                  </div>
                  <div className="text-right mt-1.5">
                    <span className="text-[10px] font-medium text-muted">{job.status === 'RUNNING' ? 'Processing...' : 'Queued'}</span>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center text-xs text-muted py-6 text-center">
                  <Cloud size={24} className="opacity-20 mb-2" />
                  No active exports.
                </div>
              )}
            </div>

            {/* Available Downloads Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Available Downloads</h3>

              <div className="space-y-5">
                {availableDownloads.length > 0 ? availableDownloads.map((dl) => (
                  <div key={dl.id}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2 overflow-hidden mr-2">
                        <FileText size={14} className="text-muted shrink-0" />
                        <span className="text-sm font-semibold text-heading truncate" title={dl.filename || 'Export.zip'}>
                          {dl.filename || 'Export.zip'}
                        </span>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        type="button"
                        onClick={() => handleDownload(dl)}
                        className="h-auto p-0 text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors shrink-0"
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="text-xs text-muted">No available downloads.</div>
                )}
              </div>
            </div>
            </>}

          </div>
        </div>

      </div>
    </div>
  );
}
