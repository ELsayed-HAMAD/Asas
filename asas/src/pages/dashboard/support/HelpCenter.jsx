import React from 'react';
import { 
  ChevronRight, 
  Search, 
  Bell, 
  Headset, 
  MessageSquare,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supportService } from '../../../services/support.service';
import TopBarActions from '../../../components/TopBarActions';

export default function SupportDashboard() {
  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: supportService.getTickets,
  });

  const tickets = responseData?.data?.tickets || [];

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
          
          <button className="text-muted hover:text-heading transition-colors">
            <Bell size={18} />
          </button>
          
          <button className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap">
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
                <button className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors">
                  Getting Started
                </button>
                <button className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors">
                  API Docs
                </button>
                <button className="bg-surface-muted border border-border-default text-body px-3 py-1 rounded-full text-xs font-semibold hover:bg-surface-active transition-colors">
                  Billing Queries
                </button>
              </div>
            </div>

            {/* Recent Tickets Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-border-subtle">
                <h2 className="text-lg font-bold text-heading">Your Recent Tickets</h2>
                <button className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors">
                  View All
                </button>
              </div>
              
              <div className="divide-y divide-border-subtle">
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="animate-spin text-muted" size={24} />
                  </div>
                ) : isError ? (
                  <div className="p-6 text-center text-sm text-danger font-semibold">
                    Failed to load tickets.
                  </div>
                ) : tickets.length > 0 ? (
                  tickets.map((ticket) => (
                    <div 
                      key={ticket.id} 
                      className={`flex items-center justify-between p-6 cursor-pointer transition-colors ${
                        ticket.status === 'IN_PROGRESS' || ticket.status === 'OPEN'
                          ? 'bg-accent-light/30 border-l-4 border-l-blue-600 hover:bg-accent-light/50'
                          : 'bg-surface-raised border-l-4 border-l-transparent hover:bg-surface-muted'
                      }`}
                    >
                      <div>
                        <h3 className="text-sm font-bold text-heading mb-1">{ticket.title}</h3>
                        <p className="text-xs text-muted font-medium">Created {new Date(ticket.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-3 py-1 rounded text-[11px] font-bold ${
                          ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS'
                            ? 'bg-[#eff6ff] border border-[#bfdbfe] text-accent'
                            : 'bg-surface-active border border-border-default text-body-light'
                        }`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                        <ChevronRight size={16} className="text-caption" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-sm text-muted font-semibold">
                    No recent tickets found.
                  </div>
                )}
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
              
              <button className="flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-hover transition-colors">
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
                <button className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
                  <MessageSquare size={16} />
                  Open Live Chat
                </button>
                <button className="w-full flex items-center justify-center gap-2 bg-surface-raised border border-border-strong text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors shadow-card">
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