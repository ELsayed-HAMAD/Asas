import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'

export default function StatCard({ label, value, change, trend = 'neutral', icon: Icon, subtitle }) {
  const isUp = trend === 'up'
  const isDown = trend === 'down'
  const valueLength = String(value ?? '').length
  // Clamped between 0.75rem and 1.5rem (24px, text-2xl) as per UI review specifications
  const valueFontSize = `clamp(0.75rem, ${(130 / Math.max(1, valueLength)).toFixed(2)}cqw, 1.5rem)`

  return (
    <Card className="p-4 sm:p-5 hover:shadow-card-hover transition-shadow h-full flex flex-col justify-between" style={{ containerType: 'inline-size' }}>
      <div className="flex items-start justify-between gap-2 mb-3.5">
        <div className="w-10 h-10 rounded-card-sm bg-surface-muted flex items-center justify-center border border-border-subtle shrink-0">
          {Icon && <Icon size={18} className="text-body-light" />}
        </div>
        {change && (
          <Badge
            variant={isUp ? 'success' : isDown ? 'info' : 'secondary'}
            className="flex items-center gap-1 font-medium px-2 py-1 text-right text-xs"
          >
            {isUp && <ArrowUpRight size={14} className="shrink-0" />}
            {isDown && <ArrowDownRight size={14} className="shrink-0" />}
            <span className="leading-tight">{change}</span>
          </Badge>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-muted mb-1">{label}</p>
        <p className="text-3xl text-2xl font-bold text-heading tracking-tight" style={{ fontSize: valueFontSize }}>{value}</p>
        <div className="min-h-[16px] mt-1 flex items-center">
          {subtitle ? (
            <p className="text-xs text-muted leading-snug">{subtitle}</p>
          ) : (
            <span className="text-xs text-muted/0 select-none leading-snug" aria-hidden="true">&nbsp;</span>
          )}
        </div>
      </div>
    </Card>
  )
}

