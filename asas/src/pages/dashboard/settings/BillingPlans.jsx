import React from 'react';
import { Search, CheckCircle2, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { settingsService } from '../../../services/settings.service';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';
import { formatMoney } from '../../../lib/formatMoney';

export default function SettingsBilling() {
  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: settingsService.getBilling,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface flex-1">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !responseData) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger flex-1">
        Failed to load billing settings.
      </div>
    );
  }

  const subscriptions = responseData.data?.subscriptions || [];
  const activeSub = subscriptions.find(s => s.status === 'ACTIVE') || null;
  const renewalDate = activeSub?.renewsOn || activeSub?.currentPeriodEnd;
  const renewalDateObj = renewalDate ? new Date(renewalDate) : null;
  const today = new Date();
  const isRenewingToday = renewalDateObj && renewalDateObj.toDateString() === today.toDateString();
  const renewalText = !renewalDateObj
    ? 'No renewal date on file.'
    : isRenewingToday
      ? 'Renews today.'
      : `Renews on ${renewalDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`;

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

          {!activeSub ? (
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
              <h2 className="text-xl font-bold text-heading mb-1">No subscription on file</h2>
              <p className="text-sm text-body-light">
                This tenant has no Subscription rows yet. Load sample data or keep using the workspace without a billed plan.
              </p>
            </div>
          ) : (
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold text-heading mb-1">{activeSub.planName || activeSub.planId}</h2>
                  <p className="text-sm text-body-light">
                    {activeSub.priceMonthly != null ? `${formatMoney(activeSub.priceMonthly)} / month. ` : ''}
                    {renewalText}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 border border-border-default bg-surface-raised px-3 py-1 rounded-full text-xs font-semibold shadow-card text-body">
                  <div className="w-2 h-2 rounded-full bg-success-dot" />
                  {activeSub.status}
                </span>
              </div>

              <div className="mt-6 bg-surface-muted border border-border-default rounded-button p-5">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-semibold text-body-light">Seat Usage</span>
                  <span className="text-xs font-bold text-heading">
                    {activeSub.seatsUsed ?? 0} / {activeSub.seatLimit ?? 0}
                  </span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ((activeSub.seatsUsed || 0) / Math.max(activeSub.seatLimit || 1, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border-subtle flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm font-medium text-body">
                  <CheckCircle2 size={16} className="text-success-dot" />
                  Workspace snapshot
                </div>
              </div>
            </div>
          )}
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
