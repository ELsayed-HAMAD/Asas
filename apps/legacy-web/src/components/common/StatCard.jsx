import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export default function StatCard({ label, value, change, trend = 'neutral', icon: Icon }) {
  const isUp = trend === 'up'
  const isDown = trend === 'down'

  return (
    <div className="bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-card-sm bg-surface-muted flex items-center justify-center border border-border-subtle">
          {Icon && <Icon size={18} className="text-body-light" />}
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-input ${
          isUp ? 'text-success-text bg-success-light' :
          isDown ? 'text-info bg-info-light' :
          'text-body-light bg-surface-muted'
        }`}>
          {isUp && <ArrowUpRight size={14} />}
          {isDown && <ArrowDownRight size={14} />}
          {change}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted mb-1">{label}</p>
        <p className="text-3xl font-bold text-heading tracking-tight">{value}</p>
      </div>
    </div>
  )
}

