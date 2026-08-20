import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  Bell, 
  Sun, 
  LayoutGrid,
  Filter,
  Server,
  SlidersHorizontal,
  Cpu,
  X,
  AlertTriangle,
  ShoppingCart
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────
const PRODUCTS = [
  { 
    id: '1', 
    name: 'Enterprise Server X9', 
    sku: 'SRV-001', 
    price: 4250.00, 
    stock: 142, 
    status: 'In Stock',
    icon: <Server size={18} className="text-body-light" />
  },
  { 
    id: '2', 
    name: 'Optical Sensor v2', 
    sku: 'SENS-089', 
    price: 120.00, 
    stock: 2, 
    status: 'Low Stock',
    icon: <SlidersHorizontal size={18} className="text-body-light" />
  },
  { 
    id: '3', 
    name: 'Quantum Processor Alpha', 
    sku: 'QPA-045', 
    price: 890.00, 
    stock: 45, 
    status: 'In Stock',
    icon: <Cpu size={18} className="text-body-light" />
  },
];

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0
  }).format(num);
};

import TopBarActions from '../../../components/TopBarActions';

export default function Inventory() {
  const [selectedId, setSelectedId] = useState('2');
  const selectedProduct = PRODUCTS.find(p => p.id === selectedId);

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-72 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-muted">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          
          <button className="text-muted hover:text-heading transition-colors">
            <Bell size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <Sun size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <LayoutGrid size={18} />
          </button>
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Upgrade
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Product Catalog Area */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">
          
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-heading">Product Catalog</h1>
            <button className="flex items-center gap-2 border border-border-default bg-surface-raised text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card">
              <Filter size={16} /> Filter
            </button>
          </div>

          {/* Catalog Table */}
          <div className="bg-surface-raised border border-border-default rounded-button shadow-card overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted/80 border-b border-border-default">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Price</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {PRODUCTS.map(product => {
                  const isSelected = selectedId === product.id;
                  const isLowStock = product.status === 'Low Stock';

                  return (
                    <tr 
                      key={product.id}
                      onClick={() => setSelectedId(product.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/30 border-l-2 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-2 border-l-transparent'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded border border-border-default bg-surface-muted flex items-center justify-center shrink-0">
                            {product.icon}
                          </div>
                          <span className="text-sm font-semibold text-heading">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-body-light">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-heading tabular-nums text-right">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${
                          isLowStock 
                            ? 'bg-danger-light text-danger border border-danger-border' 
                            : 'bg-success-light text-success-text border border-[#bbf7d0]'
                        }`}>
                          {product.stock} {product.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[420px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0">
          
          {selectedProduct && (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-border-default">
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-surface-active rounded-button flex items-center justify-center border border-border-default">
                      {selectedProduct.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-heading">{selectedProduct.name}</h2>
                      <p className="text-sm text-muted mt-0.5">SKU: {selectedProduct.sku}</p>
                    </div>
                  </div>
                  <button className="text-caption hover:text-body transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                {/* Tabs */}
                <div className="flex items-center gap-6">
                  <button className="text-sm font-bold text-heading border-b-2 border-black pb-2">
                    Overview
                  </button>
                  <button className="text-sm font-medium text-muted hover:text-heading pb-2">
                    Suppliers
                  </button>
                  <button className="text-sm font-medium text-muted hover:text-heading pb-2">
                    History
                  </button>
                </div>
              </div>

              {/* Detail Content Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Stock Alert */}
                {selectedProduct.status === 'Low Stock' && (
                  <div className="bg-danger-light border border-danger-border rounded-button p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={16} className="text-danger" />
                      <h3 className="text-xs font-bold text-danger-hover uppercase tracking-wide">Stock Alert</h3>
                    </div>
                    <p className="text-sm text-[#991b1b] ml-6 leading-relaxed">
                      Current stock ({selectedProduct.stock}) is below minimum threshold (10). Action required.
                    </p>
                  </div>
                )}

                {/* Form Fields (Read Only styling) */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">Unit Price</label>
                    <div className="w-full bg-surface-muted border border-border-default rounded-input px-3 py-2.5 text-sm font-medium text-heading">
                      $120.00
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">Location</label>
                    <div className="w-full bg-surface-muted border border-border-default rounded-input px-3 py-2.5 text-sm font-medium text-heading">
                      Warehouse A - Aisle 4, Bin 12
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="border border-border-default rounded-button p-4 bg-surface-raised">
                    <p className="text-[11px] font-medium text-muted mb-1">Avg. Monthly Usage</p>
                    <p className="text-lg font-bold text-heading">45 Units</p>
                  </div>
                  <div className="border border-border-default rounded-button p-4 bg-surface-raised">
                    <p className="text-[11px] font-medium text-muted mb-1">Lead Time</p>
                    <p className="text-lg font-bold text-heading">14 Days</p>
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="p-6 border-t border-border-default bg-surface-raised mt-auto">
                <button className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
                  <ShoppingCart size={16} />
                  Create Purchase Order
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}