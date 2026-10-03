import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  FileText,
  Loader2,
  Cloud,
  Calendar,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import { exportsApi } from '../../../lib/api/exports';
import { queryKeys } from '../../../lib/queryKeys';

/**
 * The legacy "Data Scope" options had no 1:1 mapping to the backend's two export kinds
 * (`employees` | `ledger`). The three legacy labels are kept verbatim for the old look, and each
 * maps to the closest real kind: the two people/workspace scopes export the employee directory,
 * and the ledgers scope exports the general ledger. Format and Date Range have no backend
 * equivalent at all (`createJob` takes only `kind`), so those selects stay as inert decoration —
 * exactly as they were on the legacy page.
 */
const SCOPE_TO_KIND = {
  'Full Workspace': 'employees',
  'Specific Projects': 'employees',
  'Financial Ledgers': 'ledger',
};

export default function SettingsDataExport() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('Full Workspace');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.exports.jobs.list({ page: 1, limit: 100 }),
    queryFn: () => exportsApi.listJobs({ page: 1, limit: 100 }),
    // Keep polling while any job is still QUEUED/RUNNING so a just-created job flips to DONE and
    // lands in Available Downloads without a manual refresh.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((j) => j.status === 'RUNNING' || j.status === 'QUEUED') ? 1500 : false;
    },
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
  const liveJobs = jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED');
  const availableDownloads = jobs.filter((j) => j.status === 'DONE');

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
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>

          <button
            type="button"
            disabled
            className="bg-surface-muted border border-border-default text-body px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-surface-active transition-colors whitespace-nowrap disabled:opacity-60"
          >
            View Export History
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Configuration Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl space-y-6">

          {/* New Export Request Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">New Export Request</h2>

            <div className="space-y-5">
              {/* Row 1: Scope & Format */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Data Scope</label>
                  <div className="relative">
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option>Full Workspace</option>
                      <option>Specific Projects</option>
                      <option>Financial Ledgers</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Format</label>
                  <div className="relative">
                    <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary">
                      <option>JSON & CSV</option>
                      <option>PDF Reports</option>
                      <option>SQL Dump</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 2: Date Range */}
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Date Range</label>
                <div className="relative">
                  <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary">
                    <option>All Time</option>
                    <option>Last 30 Days</option>
                    <option>Year to Date</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => createMutation.mutate(SCOPE_TO_KIND[scope] || 'employees')}
                  disabled={createMutation.isPending}
                  className="w-full bg-primary text-on-primary py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60"
                >
                  {createMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Generating...
                    </span>
                  ) : (
                    'Generate Export Archive'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Scheduled Backups Card (no backend endpoint — the legacy page's empty state) */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">Scheduled Backups</h2>

            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center text-sm text-muted py-8 text-center">
                <Calendar size={32} className="opacity-20 mb-3" />
                No scheduled backups configured.
              </div>
            </div>
          </div>

        </div>

        {/* Right: Recent Exports Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 z-10">

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <h2 className="text-lg font-bold text-heading mb-2">Recent Exports</h2>

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
                      <button
                        type="button"
                        onClick={() => handleDownload(dl)}
                        className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors shrink-0"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="text-xs text-muted">No available downloads.</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
