import React, { useState } from 'react';
import { 
  ChevronRight, Search, Send, Filter, ChevronDown, 
  CheckSquare, Square, FileText, Paperclip, Phone, 
  CircleDot, Circle, Mail, Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { financeService } from '../../../services/finance.service';
import TopBarActions from '../../../components/TopBarActions';

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0
  }).format(num);
};

export default function AccountsReceivable() {
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance', 'receivables'],
    queryFn: financeService.listReceivables,
  });

  const items = data?.items || [];
  
  const displayItems = React.useMemo(() => {
    return [...items]
      .filter(i => i.totalOutstanding > 0)
      .sort((a, b) => b.oldest - a.oldest);
  }, [items]);
    
  // Sync selectedId with the filtered list
  React.useEffect(() => {
    if (displayItems.length > 0 && !displayItems.some(i => i.id === selectedId)) {
      setSelectedId(displayItems[0].id);
    } else if (displayItems.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [displayItems, selectedId]);

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
        Failed to load accounts receivable.
      </div>
    );
  }

  const selectedRecord = displayItems.find(i => i.id === selectedId);

  // Calculate KPIs
  const totalOutstanding = items.reduce((acc, curr) => acc + curr.totalOutstanding, 0);
  const current = items.reduce((acc, curr) => acc + curr.invoices.filter(i => {
    if (i.status === 'PAID') return false;
    if (!i.dueDate) return true;
    const diffTime = new Date() - new Date(i.dueDate);
    return diffTime <= 0;
  }).reduce((sum, inv) => sum + inv.amount, 0), 0);
  const days1to30 = items.reduce((acc, curr) => acc + curr.invoices.filter(i => {
    if (i.status === 'PAID') return false;
    if (!i.dueDate) return false;
    const diffTime = new Date() - new Date(i.dueDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 30;
  }).reduce((sum, inv) => sum + inv.amount, 0), 0);
  const days31to60 = items.reduce((acc, curr) => acc + curr.invoices.filter(i => {
    if (i.status === 'PAID') return false;
    if (!i.dueDate) return false;
    const diffTime = new Date() - new Date(i.dueDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return days > 30 && days < 60;
  }).reduce((sum, inv) => sum + inv.amount, 0), 0);
  const days60plus = items.reduce((acc, curr) => acc + curr.invoices.filter(i => {
    if (i.status === 'PAID') return false;
    if (!i.dueDate) return false;
    const diffTime = new Date() - new Date(i.dueDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return days >= 60;
  }).reduce((sum, inv) => sum + inv.amount, 0), 0);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button className="flex items-center gap-2 bg-surface-muted0 text-white px-4 py-1.5 rounded-input text-sm font-medium hover:bg-gray-600 transition-colors shadow-card">
            <Send size={14} /> Send Batch Reminders (0)
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-5 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">Total Outstanding</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">Current</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(current)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">1-30 Days</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(days1to30)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">31-60 Days</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(days31to60)}</p>
          </div>
          {/* Highlighted Danger KPI */}
          <div className={`border border-border-default border-l-4 rounded-button p-4 bg-surface-raised shadow-card ${days60plus > 0 ? 'border-l-red-600' : 'border-l-transparent'}`}>
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">60+ Days</p>
            <p className={`text-2xl font-bold ${days60plus > 0 ? 'text-danger' : 'text-heading'}`}>{formatCurrency(days60plus)}</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col">
          
          {/* Table Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-muted/50 flex-shrink-0">
            <div className="flex items-center gap-4">
              <Square size={16} className="text-faint" />
              <button className="flex items-center gap-1.5 text-sm font-medium text-body-light hover:text-heading transition-colors">
                <Filter size={14} /> Filter <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <button className="flex items-center gap-1.5 text-sm font-medium text-body-light hover:text-heading transition-colors">
              Sort: Oldest First <ChevronDown size={14} className="text-caption" />
            </button>
          </div>

          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12"></th>
                <th className="px-2 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default">Customer</th>
                <th className="px-6 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default text-center">Oldest</th>
                <th className="px-6 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {displayItems.map(account => {
                const isSelected = selectedId === account.id;
                const isSeverelyOverdue = account.oldest > 60;

                return (
                  <tr 
                    key={account.id}
                    onClick={() => setSelectedId(account.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent-light/40 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="px-6 py-4">
                      {isSelected 
                        ? <CheckSquare size={16} className="text-black" fill="black" stroke="white" /> 
                        : <Square size={16} className="text-faint" />
                      }
                    </td>
                    <td className="px-2 py-4">
                      <div className="flex items-center gap-3">
                        {account.avatar ? (
                          <img src={account.avatar} alt="Avatar" className="w-7 h-7 rounded-full shadow-card" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#3d3121] flex items-center justify-center text-[11px] font-bold text-white shadow-card">
                            {account.name?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{account.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                        isSeverelyOverdue ? 'bg-danger-light text-danger' : 'text-body-light'
                      }`}>
                        {account.oldest} {account.oldest === 1 ? 'Day' : 'Days'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-heading tabular-nums">
                      {formatCurrency(account.totalOutstanding)}
                    </td>
                  </tr>
                )
              })}
              
              {displayItems.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                     No customers found with outstanding balances.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        {selectedRecord && (
          <div className="w-[520px] bg-surface-muted border-l border-border-default overflow-y-auto p-6 flex-shrink-0 space-y-6 shadow-panel">
            
            {/* Customer Header Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  {selectedRecord.avatar ? (
                    <img src={selectedRecord.avatar} alt="Avatar" className="w-12 h-12 rounded-button shadow-card" />
                  ) : (
                    <div className="w-12 h-12 bg-[#3d3121] rounded-button flex items-center justify-center text-xl font-bold text-white shadow-card">
                      {selectedRecord.name?.substring(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.name}</h2>
                    <button className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-body mt-1">
                      Status: {selectedRecord.status?.replace('_', ' ')} <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
                {selectedRecord.totalOutstanding === 0 ? (
                  <button className="bg-surface-muted text-body-light border border-border-default px-4 py-2 rounded-input text-sm font-semibold hover:bg-surface-strong transition-colors shadow-card">
                    View History
                  </button>
                ) : (
                  <button className="bg-primary text-white px-4 py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
                    Log Payment
                  </button>
                )}
              </div>
              
              <div className="flex items-end justify-between border-t border-border-subtle pt-5">
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-1">Total Outstanding</p>
                  <p className="text-4xl font-extrabold text-heading tracking-tight">{formatCurrency(selectedRecord.totalOutstanding)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-1">Oldest Invoice</p>
                  <p className={`text-sm font-bold ${selectedRecord.oldest > 0 ? 'text-danger' : 'text-success'}`}>
                    {selectedRecord.oldest > 0 ? `${selectedRecord.oldest} ${selectedRecord.oldest === 1 ? 'Day' : 'Days'} Overdue` : 'Current'}
                  </p>
                </div>
              </div>
            </div>

            {/* Outstanding Invoices Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-surface-raised">
                <h3 className="text-xs font-bold text-heading">Outstanding Invoices</h3>
                <span className="text-[11px] font-semibold text-muted">{selectedRecord.invoices.filter(i => i.status !== 'PAID').length} Items</span>
              </div>
              <div className="divide-y divide-border-subtle">
                
                {selectedRecord.invoices.filter(i => i.status !== 'PAID').map(inv => {
                  let daysOverdue = 0;
                  if (inv.dueDate) {
                    const diffTime = new Date() - new Date(inv.dueDate);
                    daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  }
                  
                  return (
                    <div key={inv.id} className="flex items-center justify-between p-5 hover:bg-surface-muted transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-surface-muted border border-border-default rounded-input text-caption">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-heading">{inv.number || 'No Number'}</p>
                          <p className="text-[11px] font-medium text-muted mt-0.5">
                            {daysOverdue > 0 ? (
                              <span className="text-danger font-bold">Overdue ({daysOverdue}d)</span>
                            ) : (
                              <span className="text-success font-bold">Current</span>
                            )}
                            {inv.dueDate && ` • Due ${new Date(inv.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-heading tabular-nums">{formatCurrency(inv.amount)}</span>
                        <button className="flex items-center gap-1 border border-border-strong rounded px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-muted transition-colors bg-surface-raised">
                          Action <ChevronDown size={12} className="text-caption" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                
                {selectedRecord.invoices.filter(i => i.status !== 'PAID').length === 0 && (
                  <div className="p-5 text-center text-muted text-sm">
                    No outstanding invoices.
                  </div>
                )}
              </div>
            </div>

            {/* Activity Timeline Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-border-subtle">
                <h3 className="text-xs font-bold text-heading">Activity</h3>
              </div>
              
              <div className="p-5">
                {/* Input Box */}
                <div className="border border-border-default rounded-button bg-surface focus-within:bg-surface-raised focus-within:border-border-strong transition-colors mb-6">
                  <textarea 
                    placeholder="Add a note or log a call..." 
                    className="w-full bg-transparent text-sm p-3 outline-none resize-none h-20 text-body placeholder-gray-400"
                  />
                  <div className="flex items-center justify-between p-2 border-t border-border-subtle">
                    <div className="flex items-center gap-2 text-caption px-2">
                      <button className="hover:text-body-light transition-colors"><Paperclip size={16} /></button>
                      <button className="hover:text-body-light transition-colors"><Phone size={16} /></button>
                    </div>
                    <button className="bg-primary text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-primary-hover transition-colors">
                      Post
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="relative pl-3 space-y-6">
                  {/* Continuous Line */}
                  <div className="absolute left-[17px] top-2 bottom-6 w-px bg-surface-strong"></div>
                  
                  {selectedRecord.activities && selectedRecord.activities.map((act, index) => (
                    <div key={act.id} className="relative z-10 flex gap-4">
                      <div className="bg-surface-raised ring-4 ring-white mt-1">
                        {index === 0 ? (
                          <CircleDot size={16} className="text-heading" strokeWidth={2.5} />
                        ) : (
                          <Circle size={16} className="text-accent" strokeWidth={2.5} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-0.5">
                          <p className="text-sm font-bold text-heading">{act.title}</p>
                          <span className="text-[10px] font-semibold text-muted">
                            {new Date(act.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-muted mb-2">{act.author}</p>
                        <div className="bg-surface-muted border border-border-subtle rounded-button p-3 text-[13px] text-body leading-relaxed">
                          {act.body}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!selectedRecord.activities || selectedRecord.activities.length === 0) && (
                    <div className="text-center text-muted text-sm py-4">
                      No activity recorded.
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}