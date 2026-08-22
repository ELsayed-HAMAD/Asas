import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  Plus, 
   
  
  Link2Off,
  Cloud
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';

// ── Mock Data ────────────────────────────────────────────────
const INTEGRATIONS = [
  { 
    id: 'github', 
    name: 'GitHub Enterprise', 
    desc: 'Sync commits and PRs automatically.', 
    status: 'Connected',
    selected: true 
  },
  { 
    id: 'slack', 
    name: 'Slack App', 
    desc: 'Push milestone alerts to channels.', 
    status: 'Connected',
    selected: false 
  },
  { 
    id: 'stripe', 
    name: 'Stripe Billing', 
    desc: 'Automate financial ledgers.', 
    status: 'Configure',
    selected: false 
  },
  { 
    id: 'aws', 
    name: 'AWS CloudWatch', 
    desc: 'Monitor infrastructure metrics.', 
    status: 'Connected',
    selected: false 
  },
];

export default function SettingsIntegrations() {
  const [selectedId, setSelectedId] = useState('github');
  const [syncPullRequests, setSyncPullRequests] = useState(true);
  const [syncCICD, setSyncCICD] = useState(false);

  const selectedIntegration = INTEGRATIONS.find(i => i.id === selectedId) || INTEGRATIONS[0];

  const renderIntegrationIcon = (id) => {
    switch(id) {
      case 'github': return <div className="w-full h-full bg-gray-900 text-white flex items-center justify-center font-bold text-xl rounded-button shadow-inner">G</div>;
      case 'slack': return <div className="w-full h-full bg-purple-600 text-white flex items-center justify-center font-bold text-xl rounded-button shadow-inner">S</div>;
      case 'stripe': return <div className="w-full h-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xl rounded-button shadow-inner">S</div>;
      case 'aws': return <div className="w-full h-full bg-orange-500 text-white flex items-center justify-center font-bold text-xl rounded-button shadow-inner">A</div>;
      default: return <Cloud size={24} className="text-muted" />;
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
              placeholder="Search integrations..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised">
            Category: All
            <ChevronDown size={14} className="text-caption" />
          </button>
          
          <button className="flex items-center gap-2 bg-primary text-on-primary px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
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
            
            {INTEGRATIONS.map((integration) => {
              const isSelected = selectedId === integration.id;
              
              // Mapped through renderIntegrationIcon

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
                      {renderIntegrationIcon(integration.id)}
                    </div>
                    {integration.status === 'Connected' ? (
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
                    <p className="text-sm text-muted">{integration.desc}</p>
                  </div>
                  
                  {/* Barcode / Sparkline Fix: Conditionally render with strict bounds */}
                  {integration.activityData && integration.activityData.length > 0 && (
                    <div className="h-10 w-full mt-4 overflow-hidden relative">
                      {/* SVG Sparkline or Graph renders here */}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {/* Right: Integration Configuration Panel */}
        <div className="w-[400px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 shadow-panel z-10">
          
          <div className="flex-1 overflow-y-auto p-8">
            
            {/* Header */}
            <div className="flex items-center gap-4 mb-10">
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                {renderIntegrationIcon(selectedIntegration.id)}
              </div>
              <h2 className="text-xl font-bold text-heading">{selectedIntegration.name}</h2>
            </div>
            
            {/* Configuration Options */}
            <div className="mb-10">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Configuration</h3>
              <div className="border border-border-default rounded-card-sm bg-surface-raised shadow-card overflow-hidden divide-y divide-border-subtle">
                
                {/* Option 1 */}
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-semibold text-heading">Sync Pull Requests</span>
                  <div onClick={() => setSyncPullRequests(!syncPullRequests)} className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer shadow-panel ${syncPullRequests ? 'bg-accent' : 'bg-surface-strong'}`}>
                    <div className={`w-4 h-4 bg-on-primary rounded-full transition-transform shadow-card ${syncPullRequests ? 'translate-x-5' : 'border border-border-strong'}`}></div>
                  </div>
                </div>

                {/* Option 2 */}
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-semibold text-heading">Sync CI/CD Status</span>
                  <div onClick={() => setSyncCICD(!syncCICD)} className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer shadow-panel ${syncCICD ? 'bg-accent' : 'bg-surface-strong'}`}>
                    <div className={`w-4 h-4 bg-on-primary rounded-full transition-transform shadow-card ${syncCICD ? 'translate-x-5' : 'border border-border-strong'}`}></div>
                  </div>
                </div>

              </div>
            </div>

            {/* Webhook Logs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest">Webhook Logs</h3>
                <button className="text-[11px] font-bold text-accent hover:text-accent-hover transition-colors">
                  View All
                </button>
              </div>
              
              {/* Terminal Box */}
              <div className="bg-terminal rounded-card-sm p-4 font-mono text-[11px] shadow-card overflow-hidden flex flex-col gap-2.5">
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-terminal-success font-bold">200 OK</span>
                    <span className="text-terminal-muted">:</span>
                    <span className="text-terminal-text">pull_request.opened</span>
                  </div>
                  <span className="text-terminal-muted opacity-60">(2m ago)</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-terminal-success font-bold">200 OK</span>
                    <span className="text-terminal-muted">:</span>
                    <span className="text-terminal-text">push</span>
                  </div>
                  <span className="text-terminal-muted opacity-60">(15m ago)</span>
                </div>

                {syncCICD && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-terminal-error font-bold">500 ERR</span>
                      <span className="text-terminal-muted">:</span>
                      <span className="text-terminal-text">check_suite.rerequested</span>
                    </div>
                    <span className="text-terminal-muted opacity-60">(1h ago)</span>
                  </div>
                )}

              </div>
            </div>

          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle mt-auto">
            <button className="w-full flex items-center justify-center gap-2 bg-surface-raised border border-danger-border text-danger py-2.5 rounded-input text-sm font-bold hover:bg-danger-light transition-colors shadow-card">
              <Link2Off size={16} />
              Disconnect Integration
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}