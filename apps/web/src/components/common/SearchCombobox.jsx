import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'

const MIN_PANEL_HEIGHT = 96
const SEARCH_HEADER_HEIGHT = 56
const VIEWPORT_GAP = 12

function spaceBelow(element) {
  const rect = element?.getBoundingClientRect()
  if (!rect) return 320
  return Math.max(MIN_PANEL_HEIGHT, Math.floor(window.innerHeight - rect.bottom - VIEWPORT_GAP))
}

/**
 * Searchable single-select built from the shadcn Combobox pattern. Options render a compact
 * label, an optional description, and a right-aligned detail such as a UTC offset or symbol.
 */
export default function SearchCombobox({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyText = 'No matching options.',
  disabled = false,
  className,
  title,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false)
  const [availableHeight, setAvailableHeight] = useState(320)
  const triggerRef = useRef(null)
  const selected = useMemo(() => options.find(option => option.value === value), [options, value])
  const groups = useMemo(() => [...new Set(options.map(option => option.group || 'All'))], [options])
  const listId = id ? `${id}-listbox` : undefined

  useEffect(() => {
    if (!open) return

    const updateHeight = () => setAvailableHeight(spaceBelow(triggerRef.current))
    updateHeight()
    window.addEventListener('resize', updateHeight)
    window.addEventListener('scroll', updateHeight, true)
    return () => {
      window.removeEventListener('resize', updateHeight)
      window.removeEventListener('scroll', updateHeight, true)
    }
  }, [open])

  function handleOpenChange(nextOpen) {
    if (nextOpen) setAvailableHeight(spaceBelow(triggerRef.current))
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          data-value={value}
          disabled={disabled}
          title={title ?? (selected?.description ? `${selected.label} · ${selected.description}` : undefined)}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-3 rounded-button border border-border-default bg-surface px-3 text-left text-sm text-heading transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60',
            open && 'border-accent ring-2 ring-accent/20',
            className
          )}
        >
          {selected ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-medium">{selected.label}</span>
              {selected.meta && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted">{selected.meta}</span>
              )}
            </span>
          ) : (
            <span className="truncate text-muted">{placeholder}</span>
          )}
          <ChevronsUpDown
            size={15}
            aria-hidden="true"
            className={cn('shrink-0 text-muted transition-transform', open && 'text-accent')}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        avoidCollisions={false}
        data-testid={id ? `${id}-popover` : undefined}
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 shadow-elevated"
      >
        <Command>
          <CommandInput
            autoFocus
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
          />
          <CommandList
            id={listId}
            aria-label={ariaLabel}
            className="max-h-none overflow-y-auto"
            style={{ maxHeight: Math.max(40, availableHeight - SEARCH_HEADER_HEIGHT) }}
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(group => (
              <CommandGroup key={group} heading={group === 'All' ? undefined : group}>
                {options
                  .filter(option => (option.group || 'All') === group)
                  .map(option => (
                    <CommandItem
                      key={option.value}
                      value={`${option.value} ${option.label} ${option.description || ''} ${option.keywords || ''}`}
                      onSelect={() => {
                        onChange(option.value)
                        handleOpenChange(false)
                      }}
                      className="gap-2 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{option.label}</span>
                          {option.meta && (
                            <span className="shrink-0 text-[11px] tabular-nums text-muted">
                              {option.meta}
                            </span>
                          )}
                        </span>
                        {option.description && (
                          <span className="mt-0.5 block truncate text-[11px] text-muted">
                            {option.description}
                          </span>
                        )}
                      </span>
                      <Check
                        size={15}
                        aria-hidden="true"
                        className={cn(
                          'shrink-0 text-primary',
                          value === option.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
