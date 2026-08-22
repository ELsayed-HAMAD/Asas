import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  Calendar, 
  Filter, 
  MoreVertical, 
  Square,
  CheckSquare,
  FileText,
  ZoomIn,
  ZoomOut,
  Download,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { financeService } from '../../../services/finance.service';
import TopBarActions from '../../../components/TopBarActions';

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(num);
};

export default function AccountsPayable() {
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance', 'payables'],
    queryFn: financeService.listPayables,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load accounts payable.
      </div>
    );
  }

  const items = data.items || [];
  
  // Set initial selected item if not set
  if (!selectedId && items.length > 0) {
    setSelectedId(items[0].id);
  }

  const selectedRecord = items.find(i => i.id === selectedId);
  const needsApproval = items.filter(i => i.status === 'PENDING');
  const scheduled = items.filter(i => i.status === 'SCHEDULED' || i.status === 'APPROVED');
  const totalOutstanding = items.filter(i => i.status !== 'PAID').reduce((acc, curr) => acc + curr.amount, 0);

  const now = new Date();
  
  const pastDueItems = items.filter(i => (i.status === 'PENDING' || i.status === 'APPROVED') && new Date(i.date) < now);
  const pastDueTotal = pastDueItems.reduce((acc, curr) => acc + curr.amount, 0);

  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueIn7DaysItems = items.filter(i => (i.status === 'PENDING' || i.status === 'APPROVED' || i.status === 'SCHEDULED') && new Date(i.date) >= now && new Date(i.date) <= nextWeek);
  const dueIn7DaysTotal = dueIn7DaysItems.reduce((acc, curr) => acc + curr.amount, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonthItems = items.filter(i => i.status === 'PAID' && new Date(i.date) >= startOfMonth);
  const paidThisMonthTotal = paidThisMonthItems.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search invoices..." 
              className="pl-9 pr-4 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            This Month
          </button>
          <button className="border border-border-default text-body px-4 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            Batch Payment
          </button>
          <div className="w-px h-6 bg-surface-strong mx-1"></div>
          <button className="text-muted hover:text-body transition-colors">
            <Filter size={18} />
          </button>
          <button className="text-muted hover:text-body transition-colors">
            <MoreVertical size={18} />
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-raised">
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Total Outstanding</p>
            <p className="text-3xl font-bold text-heading">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card flex flex-col justify-between">
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Past Due</p>
              {pastDueTotal > 0 && <div className="w-2 h-2 rounded-full bg-red-600"></div>}
            </div>
            <p className="text-3xl font-bold text-heading">{formatCurrency(pastDueTotal)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Due in 7 Days</p>
            <p className="text-3xl font-bold text-heading">{formatCurrency(dueIn7DaysTotal)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Paid This Month</p>
            <p className="text-3xl font-bold text-heading">{formatCurrency(paidThisMonthTotal)}</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col border-r border-border-default">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12">
                  <Square size={16} className="text-faint" />
                </th>
                <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Vendor</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-left">Due Date</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right">Amount</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-border-subtle">
              {/* Needs Approval Section */}
              {needsApproval.length > 0 && (
                <tr className="bg-surface-muted/50">
                  <td colSpan="4" className="px-6 py-2 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Needs Approval</span>
                      <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{needsApproval.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {needsApproval.map(item => {
                const isSelected = selectedId === item.id;
                return (
                  <tr 
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface-active/60' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <Square size={16} className="text-faint" />
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-3">
                        {item.avatar ? (
                          <img src={item.avatar} alt="Avatar" className="w-7 h-7 rounded bg-surface-strong" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-surface-strong flex items-center justify-center text-[10px] font-bold text-body">
                            {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{item.vendor}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm font-bold text-heading tabular-nums">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                )
              })}

              {/* Scheduled Section */}
              {scheduled.length > 0 && (
                <tr className="bg-surface-muted/50">
                  <td colSpan="4" className="px-6 py-2 border-b border-border-subtle border-t border-border-default">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Scheduled</span>
                      <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{scheduled.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {scheduled.map(item => {
                const isSelected = selectedId === item.id;
                return (
                  <tr 
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface-active/60' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <Square size={16} className="text-faint" />
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-3">
                        {item.avatar ? (
                          <img src={item.avatar} alt="Avatar" className="w-7 h-7 rounded border border-border-default bg-surface-raised" />
                        ) : (
                          <div className="w-7 h-7 rounded border border-border-default bg-surface-raised flex items-center justify-center text-[10px] font-bold text-body">
                            {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{item.vendor}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm font-bold text-heading tabular-nums">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                )
              })}
              
              {items.length === 0 && (
                 <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                      No invoices found.
                    </td>
                 </tr>
              )}

            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        {selectedRecord && (
          <div className="w-[500px] bg-surface-muted overflow-y-auto p-6 flex-shrink-0 space-y-6">
            
            {/* Main Action Card */}
            <div className="bg-surface-raised border border-border-default rounded-button p-6 shadow-card">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  {selectedRecord.avatar ? (
                    <img src={selectedRecord.avatar} alt="Avatar" className="w-12 h-12 bg-surface-strong rounded-button" />
                  ) : (
                    <div className="w-12 h-12 bg-surface-strong rounded-button flex items-center justify-center text-lg font-bold text-body">
                      {selectedRecord.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.vendor}</h2>
                    <p className="text-xs text-muted mt-0.5">Invoice #{selectedRecord.invoiceNumber || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-[#ffedd5] text-[#9a3412] px-2.5 py-1 rounded-full text-[11px] font-bold">
                  <div className="w-1.5 h-1.5 bg-[#ea580c] rounded-full"></div>
                  {selectedRecord.status}
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Amount Due</p>
                <p className="text-4xl font-extrabold text-heading tracking-tight">{formatCurrency(selectedRecord.amount)}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button className="bg-primary text-white py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
                  Approve
                </button>
                <button className="border border-border-default text-body py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
                  Request Changes
                </button>
                <button className="border border-border-default text-danger py-2 rounded-input text-sm font-medium hover:bg-danger-light transition-colors">
                  Reject
                </button>
              </div>
            </div>

            {/* Line Items Card */}
            <div className="bg-surface-raised border border-border-default rounded-button shadow-card flex flex-col">
              <div className="px-5 py-4 border-b border-border-subtle">
                <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Line Items</h3>
              </div>
              <div className="p-5 divide-y divide-border-subtle">
                {/* Simplified Mock for now, would typically come from real line items relation */}
                <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-heading">Service Provided</p>
                    <p className="text-[11px] text-muted mt-0.5">Standard charge</p>
                  </div>
                  <span className="text-sm font-semibold text-heading tabular-nums">{formatCurrency(selectedRecord.amount)}</span>
                </div>
              </div>
            </div>

            {/* PDF Preview Card */}
            <div className="bg-surface-raised border border-border-default rounded-button shadow-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface-active/50 border-b border-border-default">
                <div className="flex items-center gap-2 text-body">
                  <FileText size={16} />
                  <span className="text-xs font-bold">invoice_{selectedRecord.invoiceNumber || 'document'}.pdf</span>
                </div>
                <div className="flex items-center gap-3 text-muted">
                  <button className="hover:text-heading transition-colors"><ZoomIn size={16} /></button>
                  <button className="hover:text-heading transition-colors"><ZoomOut size={16} /></button>
                  <button className="hover:text-heading transition-colors"><Download size={16} /></button>
                </div>
              </div>
              
              {/* Dark PDF Background Area */}
              <div className="bg-[#4b5563] p-6 flex justify-center items-center rounded-b-lg">
                {/* Skeleton Document */}
                <div className="bg-surface-raised w-full h-[280px] shadow-card p-8 flex flex-col gap-6">
                  <div className="w-32 h-4 bg-surface-strong rounded"></div>
                  <div className="w-full flex gap-4">
                    <div className="w-1/2 h-3 bg-surface-strong rounded"></div>
                    <div className="w-1/2 h-3 bg-surface-strong rounded"></div>
                  </div>
                  <div className="w-full h-px bg-surface-strong my-2"></div>
                  <div className="w-full flex justify-between">
                    <div className="w-32 h-3 bg-surface-strong rounded"></div>
                    <div className="w-16 h-3 bg-surface-strong rounded"></div>
                  </div>
                  <div className="w-full flex justify-between">
                    <div className="w-40 h-3 bg-surface-strong rounded"></div>
                    <div className="w-16 h-3 bg-surface-strong rounded"></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}