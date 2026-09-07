import React from 'react';
import {
  Search,
  Bell,
  Headset,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';

/**
 * Port of the legacy `asas` Help Center (support module).
 *
 * The legacy page fetched "recent tickets" via `supportService.getTickets`, but no
 * `/api/v1/support` endpoint exists in the rebuilt backend, so that list is replaced
 * with an honest empty state instead of fake ticket rows. Everything else — search
 * hero, popular topics, system status, direct support panels — was static in the
 * legacy UI and is kept 1:1 (same structure, same Tailwind classes).
 */
export default function SupportDashboard() {
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search documentation..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button disabled className="text-muted hover:text-heading transition-colors disabled:opacity-60">
            <Bell size={18} />
          </button>

          <button disabled className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap disabled:opacity-60">
            Contact Support
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Scrollable Workspace ── */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">

          {/* Left Column: Main Content */}
          <div className="col-span-8 flex flex-col gap-8">

            {/* Search Hero Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-8 shadow-card">
              <h1 className="text-2xl font-bold text-heading mb-6">How can we help today?</h1>

              <div className="relative mb-6">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-caption" />
                <input
                  type="text"
                  placeholder="Describe your issue or search topics..."
                  className="w-full pl-12 pr-4 py-3.5 text-base border border-border-strong rounded-button text-heading focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent shadow-card"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted">Popular:</span>
                <button disabled className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors disabled:opacity-60">
                  Getting Started
                </button>
                <button disabled className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors disabled:opacity-60">
                  API Docs
                </button>
                <button disabled className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors disabled:opacity-60">
                  Billing Queries
                </button>
              </div>
            </div>

            {/* Recent Tickets Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-border-subtle">
                <h2 className="text-lg font-bold text-heading">Your Recent Tickets</h2>
                <button disabled className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors disabled:opacity-60">
                  View All
                </button>
              </div>

              <div className="divide-y divide-border-subtle">
                {/* No support backend exists in the rebuilt API, so there is no ticket
                    data to load — show an honest empty state rather than fake rows. */}
                <div className="p-6 text-center text-sm text-muted font-semibold">
                  No recent support activity.
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Support Panels */}
          <div className="col-span-4 flex flex-col gap-6">

            {/* System Status */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-success"></div>
                <h3 className="text-xs font-bold text-heading">System Status</h3>
              </div>
              <p className="text-sm font-bold text-heading mb-1">All Systems Operational</p>
              <p className="text-[11px] text-muted mb-4">No known issues reported in the last 24h.</p>

              <button disabled className="flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-hover transition-colors disabled:opacity-60">
                View Detailed Status <ArrowRight size={12} />
              </button>
            </div>

            {/* Direct Support */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <div className="flex items-center gap-3 mb-4">
                <Headset size={20} className="text-heading" />
                <h3 className="text-base font-bold text-heading">Direct Support</h3>
              </div>
              <p className="text-sm text-body-light leading-relaxed mb-6">
                As an Enterprise client, you have access to 24/7 dedicated support via chat or priority ticketing.
              </p>

              <div className="flex flex-col gap-3">
                <button disabled className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60">
                  <MessageSquare size={16} />
                  Open Live Chat
                </button>
                <button disabled className="w-full flex items-center justify-center gap-2 bg-surface-raised border border-border-strong text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors shadow-card disabled:opacity-60">
                  View Ticket History
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
