import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Trigger a browser download of a fetched Blob under `filename`. The object URL is revoked on
 * the next tick (after the anchor click has dispatched), so it is not a leak. Used for the
 * binary exports (payslip/invoice PDFs, Excel workbooks) that the API streams back.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  queueMicrotask(() => URL.revokeObjectURL(url))
}
