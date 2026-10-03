export default function EmptyState({
  title = 'Nothing here yet',
  description = 'There is no data to display in this workspace.',
  className = '',
}) {
  return (
    <div className={`flex items-center justify-center px-6 py-10 text-center ${className}`}>
      <div className="max-w-sm">
        <p className="text-base font-semibold text-heading">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  )
}

