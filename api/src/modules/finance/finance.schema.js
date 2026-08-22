import { z } from 'zod'

export const vendorWriteSchema = z.object({
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
})

export const payableInvoiceWriteSchema = z.object({
  vendorId: z.string().cuid(),
  invoiceNumber: z.string().optional(),
  date: z.string().datetime(),
  amount: z.number().min(0),
  status: z.enum(['PENDING', 'SCHEDULED', 'APPROVED', 'PAID', 'REJECTED']).optional(),
  pdfFilename: z.string().optional(),
})

export const customerWriteSchema = z.object({
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  collectionStatus: z.enum(['CURRENT', 'OVERDUE', 'IN_COLLECTIONS', 'PAID']).optional(),
})

export const receivableInvoiceWriteSchema = z.object({
  customerId: z.string().cuid(),
  number: z.string().optional(),
  amount: z.number().min(0),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['CURRENT', 'OVERDUE', 'IN_COLLECTIONS', 'PAID']).optional(),
})

export const expenseWriteSchema = z.object({
  employeeId: z.string().cuid().optional(),
  name: z.string().min(1),
  category: z.enum(['SOFTWARE', 'TRAVEL', 'MEALS', 'OFFICE', 'FACILITIES', 'PAYROLL', 'MARKETING', 'OTHER']).optional(),
  merchant: z.string().optional(),
  date: z.string().datetime(),
  amount: z.number().min(0),
  tax: z.number().optional(),
  policyMatch: z.boolean().optional(),
  status: z.enum(['PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED', 'REJECTED']).optional(),
  receiptMeta: z.string().optional(),
})
