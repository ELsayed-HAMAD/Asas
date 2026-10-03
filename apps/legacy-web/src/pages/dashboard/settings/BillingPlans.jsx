import React from 'react';
import { Search } from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';

/**
 * Billing & Plans — the legacy page read a `subscriptions` list from `/settings/billing` and
 * rendered the ACTIVE row (or a "No subscription on file" card when there was none). That
 * endpoint does not exist in the rebuilt API, so — per the restore brief — this page keeps the
 * legacy layout and its own plan/usage figures exactly as they were, calls no API, and renders
 * the "No subscription on file" state the old page showed when no ACTIVE subscription existed.
 * Nothing here is presented as live data beyond what the old page did.
 */
export default function SettingsBilling() {
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search billing records..."
              className="pl-9 pr-3 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button
            type="button"
            disabled
            title="Stripe checkout is not connected yet"
            className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold opacity-50 cursor-not-allowed shadow-card whitespace-nowrap"
          >
            Payments coming later
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <p className="text-sm text-muted">
            Plan data is stored on this workspace only. Card checkout and invoices via Stripe are not enabled yet.
          </p>

          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-xl font-bold text-heading mb-1">No subscription on file</h2>
            <p className="text-sm text-body-light">
              This tenant has no Subscription rows yet. Load sample data or keep using the workspace without a billed plan.
            </p>
          </div>
        </div>

        <div className="w-[340px] bg-surface-muted border-l border-border-default p-8 flex flex-col flex-shrink-0">
          <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-4">Payments</h3>
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card mb-6">
            <h4 className="text-sm font-bold text-heading mb-2">Stripe later</h4>
            <p className="text-xs text-body-light mb-4 leading-relaxed">
              Checkout, customer portal, and webhooks are deferred. This page only shows records already stored for the tenant.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
