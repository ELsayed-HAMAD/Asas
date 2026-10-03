import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster, toast } from '@/components/ui/toast'

/**
 * The design-system token page (rebuild plan, Phase 1 verification: "Storybook or a token
 * page showing all 10 components in light and dark").
 *
 * Not routed in the sidebar — reach it at `/dev/tokens`. The whole page renders identically
 * in both themes via the app's theme toggle (the `.dark` token block in `index.css`); the
 * "duplicate in dark" switch below renders a `dark`-classed copy *inline* so both palettes
 * can be compared side by side on one screen, no toggle needed.
 */

interface DemoRow {
  id: string
  name: string
  status: string
  amount: string
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Acme Corp', status: 'Active', amount: '$12,400' },
  { id: '2', name: 'Globex', status: 'Pending', amount: '$8,200' },
  { id: '3', name: 'Initech', status: 'Overdue', amount: '$1,150' },
]

function Palette() {
  const TOKEN_BLOCKS: { title: string; tokens: [string, string][] }[] = [
    {
      title: 'Surfaces & text',
      tokens: [
        ['--color-surface', 'bg-[var(--color-surface)]'],
        ['--color-surface-raised', 'bg-[var(--color-surface-raised)]'],
        ['--color-surface-muted', 'bg-[var(--color-surface-muted)]'],
        ['--color-heading', 'bg-[var(--color-heading)]'],
        ['--color-body', 'bg-[var(--color-body)]'],
        ['--color-muted', 'bg-[var(--color-muted)]'],
      ],
    },
    {
      title: 'Brand & status',
      tokens: [
        ['--color-primary', 'bg-[var(--color-primary)]'],
        ['--color-success', 'bg-[var(--color-success)]'],
        ['--color-warning', 'bg-[var(--color-warning)]'],
        ['--color-danger', 'bg-[var(--color-danger)]'],
        ['--color-info', 'bg-[var(--color-info)]'],
        ['--color-accent', 'bg-[var(--color-accent)]'],
      ],
    },
    {
      title: 'Charts',
      tokens: [
        ['--color-chart-primary', 'bg-[var(--color-chart-primary)]'],
        ['--color-chart-secondary', 'bg-[var(--color-chart-secondary)]'],
        ['--color-chart-positive', 'bg-[var(--color-chart-positive)]'],
        ['--color-chart-negative', 'bg-[var(--color-chart-negative)]'],
        ['--color-chart-blue', 'bg-[var(--color-chart-blue)]'],
        ['--color-chart-grid', 'bg-[var(--color-chart-grid)]'],
      ],
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TOKEN_BLOCKS.map(block => (
        <Card key={block.title}>
          <CardHeader>
            <CardTitle>{block.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {block.tokens.map(([name, className]) => (
              <div key={name} className="flex items-center gap-3">
                <span
                  className={`h-6 w-10 shrink-0 rounded-[var(--radius-xs)] border border-[var(--color-border-default)] ${className}`}
                />
                <code className="text-xs text-[var(--color-muted)]">{name}</code>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Components({ withTheme }: { withTheme?: boolean }) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [selectValue, setSelectValue] = React.useState('option-a')

  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'amount', header: 'Amount' },
  ]

  return (
    <div className={withTheme ? 'dark contents' : undefined}>
      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6">
        <Card>
          <CardHeader>
            <CardTitle>Buttons & badges</CardTitle>
            <CardDescription>All variants, both sizes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Inputs & select</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Input placeholder="Text input" />
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option-a">Option A</SelectItem>
                  <SelectItem value="option-b">Option B</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tabs</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="one">
                <TabsList>
                  <TabsTrigger value="one">One</TabsTrigger>
                  <TabsTrigger value="two">Two</TabsTrigger>
                </TabsList>
                <TabsContent value="one" className="text-sm text-[var(--color-body)]">
                  First panel.
                </TabsContent>
                <TabsContent value="two" className="text-sm text-[var(--color-body)]">
                  Second panel.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Data table</CardTitle>
            <CardDescription>TanStack Table over three demo rows.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={DEMO_ROWS} pageSize={5} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Overlays</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                Open dialog
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Toast</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => toast({ title: 'Saved', description: 'A success toast.' })}
              >
                Success toast
              </Button>
              <Button
                variant="outline"
                onClick={() => toast({ variant: 'error', title: 'Failed', description: 'An error toast.' })}
              >
                Error toast
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dialog</DialogTitle>
            <DialogDescription>
              Radix focus trap, Esc to close — the accessibility the legacy drawer lacked.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Sheet</SheetTitle>
            <SheetDescription>Focus returns to the trigger on close.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function TokensPage() {
  const [sideBySide, setSideBySide] = React.useState(false)

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Design system</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Every component on the token layer. Toggle the theme in the sidebar for the full
            dark pass, or compare both inline below.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSideBySide(current => !current)}>
          {sideBySide ? 'Single view' : 'Compare light & dark'}
        </Button>
      </div>

      <Palette />

      {sideBySide ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-caption)]">Light</p>
            <Components />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-caption)]">Dark</p>
            <Components withTheme />
          </div>
        </div>
      ) : (
        <Components />
      )}
    </div>
  )
}
