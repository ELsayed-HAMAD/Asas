import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { recordsService } from '../../services/records.service'

export default function ModuleRecordsPage({ module, title, description, createLabel }) {
  const queryClient = useQueryClient()
  const [recordTitle, setRecordTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const queryKey = ['records', module]
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey, queryFn: () => recordsService.list(module) })
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const create = useMutation({ mutationFn: payload => recordsService.create(module, payload), onSuccess: () => { setRecordTitle(''); setIsCreating(false); refresh() } })
  const remove = useMutation({ mutationFn: id => recordsService.remove(module, id), onSuccess: refresh })
  const submit = event => { event.preventDefault(); if (recordTitle.trim()) create.mutate({ title: recordTitle.trim() }) }
  return <main className="p-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap gap-4 items-start justify-between mb-7"><div><h1 className="text-2xl font-bold text-gray-900">{title}</h1><p className="text-sm text-gray-500 mt-1">{description}</p></div><div className="flex gap-2"><button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-lg text-gray-500" aria-label="Refresh"><RefreshCw size={16} /></button><button onClick={() => setIsCreating(value => !value)} className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus size={16} />{createLabel}</button></div></div>
    {isCreating && <form onSubmit={submit} className="mb-5 flex gap-2 bg-gray-50 border border-gray-200 p-3 rounded-xl"><input autoFocus value={recordTitle} onChange={event => setRecordTitle(event.target.value)} placeholder={`Name this ${createLabel.toLowerCase()}`} className="flex-1 bg-white px-3 py-2 text-sm border border-gray-200 rounded-lg" /><button disabled={create.isPending} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg">{create.isPending ? 'Saving…' : 'Save'}</button></form>}
    {isError && <div className="flex gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm"><AlertCircle size={17} />{error.response?.data?.error?.message || 'Could not load this workspace.'}</div>}
    {isPending && <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" /></div>}
    {!isPending && !isError && <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">{data.items.length === 0 ? <div className="py-16 text-center text-sm text-gray-500">No records yet. Create your first {createLabel.toLowerCase()}.</div> : data.items.map(record => <article key={record.id} className="px-5 py-4 flex items-center justify-between border-b border-gray-100 last:border-0"><div><h2 className="font-medium text-gray-900">{record.title}</h2><p className="text-xs text-gray-400 mt-1">Updated {new Date(record.updatedAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className={record.status === 'ACTIVE' ? 'text-xs text-emerald-600' : 'text-xs text-gray-500'}>{record.status}</span><button onClick={() => remove.mutate(record.id)} disabled={remove.isPending} className="p-2 text-gray-400 hover:text-red-600" aria-label={`Delete ${record.title}`}><Trash2 size={16} /></button></div></article>)}</div>}
  </main>
}
