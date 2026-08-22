import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  CheckSquare, 
  Square, 
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
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

export default function Expenses() {
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance', 'expenses'],
    queryFn: financeService.listExpenses,
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
        Failed to load expenses.
      </div>
    );
  }

  const items = data.items || [];
  
  // Set initial selected item if not set
  if (!selectedId && items.length > 0) {
    setSelectedId(items[0].id);
  }

  const selectedRecord = items.find(r => r.id === selectedId);

  // Calculate KPIs
  const pendingCount = items.filter(i => i.status === 'PENDING').length;
  const pendingAmount = items.filter(i => i.status === 'PENDING').reduce((sum, i) => sum + i.amount, 0);
  const reimbursedAmount = items.filter(i => i.status === 'REIMBURSED').reduce((sum, i) => sum + i.amount, 0);
  const violationAmount = items.filter(i => i.status === 'FLAGGED').reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            All Teams <ChevronDown size={14} className="text-caption" />
          </button>
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Export CSV
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[11px] font-semibold text-muted tracking-wide">Pending Approval</p>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-3xl font-bold text-heading">{formatCurrency(pendingAmount)}</p>
              <span className="bg-surface-active text-muted px-2.5 py-1 rounded-input text-[10px] font-bold uppercase tracking-wider">
                {pendingCount} Reports
              </span>
            </div>
          </div>
          
          <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[11px] font-semibold text-muted tracking-wide">Reimbursed (MTD)</p>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-3xl font-bold text-heading">{formatCurrency(reimbursedAmount)}</p>
              <span className="bg-accent-light text-accent px-2.5 py-1 rounded-input text-[10px] font-bold uppercase tracking-wider">
                On track
              </span>
            </div>
          </div>

          <div className="border border-border-default rounded-card-sm p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[11px] font-semibold text-muted tracking-wide">Policy Violations</p>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-3xl font-bold text-heading">{formatCurrency(violationAmount)}</p>
              <span className="flex items-center gap-1 bg-danger-light text-danger-hover px-2.5 py-1 rounded-input text-[10px] font-bold uppercase tracking-wider">
                <AlertTriangle size={12} strokeWidth={3} /> Requires Review
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col border-r border-border-default">
          
          {/* Table Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0">
            <div className="flex items-center gap-3 text-sm text-body-light font-medium">
              <Square size={16} className="text-faint" />
              12 selected
            </div>
            <button className="flex items-center gap-1.5 text-sm font-medium text-body-light hover:text-heading transition-colors">
              Sort: Oldest First <ChevronDown size={14} className="text-caption" />
            </button>
          </div>

          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12"></th>
                <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Employee</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-left">Merchant</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-left">Expense Date</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right">Amount</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-border-subtle">
              {items.map(item => {
                const isSelected = selectedId === item.id;
                
                let badgeStyle = "bg-surface-active text-body-light";
                if (item.status === 'PENDING') badgeStyle = "bg-[#fff7ed] text-[#c2410c]";
                if (item.status === 'FLAGGED') badgeStyle = "bg-danger-light text-danger-hover";

                // Generate consistent colors based on string
                const hashCode = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                  return hash;
                };
                const colors = ['bg-primary', 'bg-accent', 'bg-green-600', 'bg-orange-600', 'bg-purple-600'];
                const bgClass = colors[Math.abs(hashCode(item.name)) % colors.length];

                return (
                  <tr 
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface-active/70 border-l-4 border-l-black' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      {isSelected 
                        ? <CheckSquare size={16} className="text-black" fill="black" stroke="white" /> 
                        : <Square size={16} className="text-faint" />
                      }
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${bgClass} flex items-center justify-center text-xs font-bold text-white`}>
                          {item.name?.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-heading leading-tight">{item.name}</p>
                          <p className="text-[11px] text-muted">{item.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-heading font-medium">
                      {item.merchant}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right flex flex-col justify-end items-end gap-1">
                      <span className="text-sm font-bold text-heading tabular-nums">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
              
              {items.length === 0 && (
                <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-muted text-sm">
                     No expenses found.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        {selectedRecord && (
          <div className="w-[440px] bg-surface-muted overflow-y-auto p-5 flex-shrink-0 space-y-4">
            
            {/* Main Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-xl font-bold text-white">
                  {selectedRecord.name?.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.name}</h2>
                  <p className="text-2xl font-extrabold text-heading tracking-tight mt-0.5">{formatCurrency(selectedRecord.amount)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-24">
                <button className="bg-primary text-white w-full py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
                  Approve
                </button>
                <button className="border border-border-default text-body w-full py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
                  Reject
                </button>
              </div>
            </div>

            {/* AI Data Extraction Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-accent" />
                <h3 className="text-xs font-bold text-heading">AI Data Extraction</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                <div>
                  <p className="text-[10px] font-medium text-muted mb-1">Merchant</p>
                  <p className="text-sm font-semibold text-heading">{selectedRecord.merchant}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted mb-1">Category</p>
                  <p className="text-sm font-semibold text-heading">{selectedRecord.category}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted mb-1">Tax</p>
                  <p className="text-sm font-semibold text-heading">$0.00</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted mb-1">Policy Match</p>
                  <p className="text-sm font-semibold text-accent flex items-center gap-1">
                    <CheckCircle2 size={14} /> Yes
                  </p>
                </div>
              </div>
            </div>

            {/* PDF Preview Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface-raised border-b border-border-subtle">
                <div className="flex items-center gap-2 text-body">
                  <FileText size={14} className="text-caption" />
                  <span className="text-xs font-medium">{selectedRecord.merchant}_Receipt.pdf</span>
                </div>
                <div className="flex items-center gap-3 text-muted text-xs font-medium">
                  <button className="hover:text-heading transition-colors"><ZoomOut size={14} /></button>
                  <span>100%</span>
                  <button className="hover:text-heading transition-colors"><ZoomIn size={14} /></button>
                </div>
              </div>
              
              {/* PDF Background Area */}
              <div className="bg-[#e2e8f0] p-6 pb-8 flex justify-center relative min-h-[420px]">
                
                {/* Pagination/Nav Control overlay */}
                <div className="absolute left-10 top-16 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-elevated z-10 cursor-pointer hover:bg-primary transition-colors">
                  <ChevronLeft size={16} className="text-white" />
                </div>

                {/* Receipt Visual */}
                <div className="bg-surface-raised w-[320px] shadow-elevated rounded-sm p-6 flex flex-col relative z-0 mt-4 h-[350px]">
                  
                  {/* Background watermark simulation */}
                  <div className="absolute top-4 right-4 opacity-10">
                    <div className="w-16 h-16 border-4 border-border-strong rounded-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-border-strong rounded-full"></div>
                    </div>
                  </div>

                  <div className="text-right mb-6">
                    <h3 className="text-lg font-black text-heading uppercase tracking-widest">Receipt</h3>
                    <p className="text-[10px] text-muted mt-1">REC-2023-064</p>
                    <p className="text-[10px] text-muted">{new Date(selectedRecord.date).toLocaleDateString()}</p>
                  </div>

                  <div className="mb-8">
                    <p className="text-[8px] font-bold text-caption uppercase tracking-wider mb-1">Billed To</p>
                    <p className="text-xs font-bold text-heading">{selectedRecord.name}</p>
                    <p className="text-[10px] text-muted">Asas Enterprise</p>
                  </div>

                  <div className="flex justify-between items-end border-b border-border-subtle pb-2 mb-3">
                    <span className="text-[9px] text-caption">Description</span>
                    <span className="text-[9px] text-caption">Amount</span>
                  </div>

                  <div className="flex justify-between items-start mb-auto">
                    <p className="text-xs text-heading pr-4 leading-relaxed">
                      {selectedRecord.category} expense at {selectedRecord.merchant}
                    </p>
                    <span className="text-xs text-heading tabular-nums pt-1">{formatCurrency(selectedRecord.amount)}</span>
                  </div>

                  <div className="pt-4 border-t-2 border-gray-900 flex justify-between items-center mt-8">
                    <span className="text-xs font-bold text-heading">Total USD</span>
                    <span className="text-sm font-black text-heading tabular-nums">{formatCurrency(selectedRecord.amount)}</span>
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