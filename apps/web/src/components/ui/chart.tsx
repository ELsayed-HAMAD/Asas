import * as RechartsPrimitive from 'recharts'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Chart theming layer on top of Recharts.
 *
 * This does not wrap Recharts primitives — `ChartContainer`/`ChartConfig` only inject CSS
 * variables (`--color-<key>`) scoped to a chart instance and provide typed tooltip/legend
 * renderers. Every chart still imports its axes, series, etc. directly from `recharts`; see
 * `FinanceOverview.jsx:192-208` in the legacy app for the token-driven pattern this replaces.
 *
 * Colors should be referenced as `var(--color-<key>)`, not `hsl(var(--color-<key>))` — the
 * Asas token values are already resolved hex/rgba strings, not HSL channel triples.
 */
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<'light' | 'dark', string> })
>

interface ChartContextValue {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('Chart components must be rendered inside a <ChartContainer>')
  }
  return context
}

const THEMES = { light: '', dark: '.dark' } as const

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, entry]) => entry.color ?? entry.theme)

  if (colorConfig.length === 0) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, selectorPrefix]) => {
            const declarations = colorConfig
              .map(([key, entry]) => {
                const color = entry.theme ? entry.theme[theme as keyof typeof entry.theme] : entry.color
                return color ? `  --color-${key}: ${color};` : null
              })
              .filter((line): line is string => line !== null)
              .join('\n')

            return `${selectorPrefix} [data-chart="${id}"] {\n${declarations}\n}`
          })
          .join('\n'),
      }}
    />
  )
}

export interface ChartContainerProps extends React.ComponentPropsWithoutRef<'div'> {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}

/** Wraps a chart in a `ResponsiveContainer`, injecting per-series CSS variables from `config`. */
const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const reactId = React.useId().replace(/:/g, '')
    const chartId = `chart-${id ?? reactId}`

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          data-chart={chartId}
          className={cn(
            'flex aspect-video min-h-[240px] justify-center text-xs',
            "[&_.recharts-cartesian-axis-tick_text]:fill-[var(--color-muted)]",
            "[&_.recharts-cartesian-grid_line]:stroke-[var(--color-chart-grid)]",
            "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-[var(--color-border-default)]",
            "[&_.recharts-layer]:outline-none",
            "[&_.recharts-sector]:outline-none",
            "[&_.recharts-surface]:outline-none",
            className,
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  },
)
ChartContainer.displayName = 'ChartContainer'

const ChartTooltip = RechartsPrimitive.Tooltip

type TooltipPayloadEntry = {
  name?: string | number
  value?: string | number
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

export interface ChartTooltipContentProps extends React.ComponentPropsWithoutRef<'div'> {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: React.ReactNode
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: 'line' | 'dot' | 'dashed'
  labelFormatter?: (label: React.ReactNode, payload: TooltipPayloadEntry[]) => React.ReactNode
  formatter?: (value: string | number, name: string | number, entry: TooltipPayloadEntry) => React.ReactNode
}

/** Tooltip renderer that resolves each series' label/color from `ChartConfig` by key. */
const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      label,
      hideLabel = false,
      hideIndicator = false,
      indicator = 'dot',
      labelFormatter,
      formatter,
      className,
      ...props
    },
    ref,
  ) => {
    const { config } = useChart()

    if (!active || !payload || payload.length === 0) return null

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] gap-1.5 rounded-[var(--radius-card-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-elevated)]',
          className,
        )}
        {...props}
      >
        {!hideLabel && label !== undefined ? (
          <div className="font-medium text-[var(--color-heading)]">
            {labelFormatter ? labelFormatter(label, payload) : label}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          {payload.map((entry, index) => {
            const key = String(entry.dataKey ?? entry.name ?? index)
            const itemConfig = config[key]
            const indicatorColor = entry.color ?? itemConfig?.color

            return (
              <div key={key} className="flex w-full items-center gap-1.5">
                {!hideIndicator ? (
                  <span
                    className={cn('shrink-0 rounded-[2px]', {
                      'h-2.5 w-2.5': indicator === 'dot',
                      'h-1 w-3': indicator === 'line',
                      'h-0 w-3 border-t border-dashed': indicator === 'dashed',
                    })}
                    style={{ backgroundColor: indicator === 'dashed' ? undefined : indicatorColor, borderColor: indicatorColor }}
                  />
                ) : null}
                <div className="flex flex-1 justify-between leading-none">
                  <span className="text-[var(--color-muted)]">{itemConfig?.label ?? entry.name}</span>
                  {entry.value !== undefined ? (
                    <span className="font-mono font-medium tabular-nums text-[var(--color-heading)]">
                      {formatter ? formatter(entry.value, entry.name ?? key, entry) : entry.value}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)
ChartTooltipContent.displayName = 'ChartTooltipContent'

const ChartLegend = RechartsPrimitive.Legend

type LegendPayloadEntry = {
  value?: string | number
  color?: string
  dataKey?: string | number
}

export interface ChartLegendContentProps extends React.ComponentPropsWithoutRef<'div'> {
  payload?: LegendPayloadEntry[]
  verticalAlign?: 'top' | 'bottom'
}

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ payload, verticalAlign = 'bottom', className, ...props }, ref) => {
    const { config } = useChart()

    if (!payload || payload.length === 0) return null

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className,
        )}
        {...props}
      >
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.value ?? index)
          const itemConfig = config[key]

          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color ?? itemConfig?.color }}
              />
              <span className="text-xs text-[var(--color-muted)]">{itemConfig?.label ?? entry.value}</span>
            </div>
          )
        })}
      </div>
    )
  },
)
ChartLegendContent.displayName = 'ChartLegendContent'

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, useChart }
