import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { recordsService } from '../../services/records.service'

const configurations = {
  'hr/employees': { label: item => item.name, create: title => ({ name: title, email: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.test` }) },
  'hr/attendance': { label: item => item.employeeName, create: title => ({ employeeName: title, workDate: new Date().toISOString() }) },
  'finance/invoices': { label: item => item.contactName, create: title => ({ contactName: title, direction: 'PAYABLE', amount: 0 }) },
  'finance/expenses': { label: item => item.description, create: title => ({ description: title, amount: 0, expenseDate: new Date().toISOString() }) },
  'crm/deals': { label: item => item.name, create: title => ({ name: title, value: 0 }) },
  'inventory/products': { label: item => item.name, create: title => ({ name: title, sku: `SKU-${Date.now()}`, unitPrice: 0, stockOnHand: 0 }) },
  'projects/projects': { label: item => item.name, create: title => ({ name: title, budget: 0 }) },
  'projects/tasks': { label: item => item.title, create: title => ({ title }) },
  'settings/workspace': { label: item => item.key, create: title => ({ key: title, value: 'Not configured' }) },
  'settings/subscriptions': { label: item => item.planName, create: title => ({ planName: title, seats: 1 }) },
  'settings/integrations': { label: item => item.provider, create: title => ({ provider: title }) },
  'settings/support-tickets': { label: item => item.subject, create: title => ({ subject: title }) },
}

export default function ModuleRecordsPage({ module, title, description, createLabel }) {
  const configuration = configurations[module]
  const queryClient = useQueryClient()
  const [recordTitle, setRecordTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const queryKey = ['records', module]
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey, queryFn: () => recordsService.list(module) })
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const create = useMutation({ mutationFn: payload => recordsService.create(module, payload), onSuccess: () => { setRecordTitle(''); setIsCreating(false); refresh() } })
  const remove = useMutation({ mutationFn: id => recordsService.remove(module, id), onSuccess: refresh })
  const submit = event => { event.preventDefault(); if (recordTitle.trim()) create.mutate(configuration.create(recordTitle.trim())) }
  return <main className="p-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap gap-4 items-start justify-between mb-7"><div><h1 className="text-2xl font-bold text-heading">{title}</h1><p className="text-sm text-muted mt-1">{description}</p></div><div className="flex gap-2"><button onClick={() => refetch()} className="p-2 border border-border-default rounded-button text-muted" aria-label="Refresh"><RefreshCw size={16} /></button><button onClick={() => setIsCreating(value => !value)} className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-button"><Plus size={16} />{createLabel}</button></div></div>
    {isCreating && <form onSubmit={submit} className="mb-5 flex gap-2 bg-surface-muted border border-border-default p-3 rounded-card-sm"><input autoFocus value={recordTitle} onChange={event => setRecordTitle(event.target.value)} placeholder={`Name this ${createLabel.toLowerCase()}`} className="flex-1 bg-surface-raised px-3 py-2 text-sm border border-border-default rounded-button" /><button disabled={create.isPending} className="px-4 py-2 bg-primary text-on-primary text-sm rounded-button">{create.isPending ? 'Saving…' : 'Save'}</button></form>}
    {isError && <div className="flex gap-2 p-4 rounded-card-sm bg-danger-light text-danger text-sm"><AlertCircle size={17} />{error.response?.data?.error?.message || 'Could not load this workspace.'}</div>}
    {isPending && <div className="flex justify-center py-20 text-caption"><Loader2 className="animate-spin" /></div>}
    {!isPending && !isError && <div className="bg-surface-raised border border-border-subtle rounded-card-sm overflow-hidden shadow-card">{data.items.length === 0 ? <div className="py-16 text-center text-sm text-muted">No records yet. Create your first {createLabel.toLowerCase()}.</div> : data.items.map(record => <article key={record.id} className="px-5 py-4 flex items-center justify-between border-b border-border-subtle last:border-0"><div><h2 className="font-medium text-heading">{configuration.label(record)}</h2><p className="text-xs text-caption mt-1">Updated {new Date(record.updatedAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className={record.status === 'ACTIVE' ? 'text-xs text-success' : 'text-xs text-muted'}>{record.status}</span><button onClick={() => remove.mutate(record.id)} disabled={remove.isPending} className="p-2 text-caption hover:text-danger" aria-label={`Delete ${configuration.label(record)}`}><Trash2 size={16} /></button></div></article>)}</div>}
  </main>
}
