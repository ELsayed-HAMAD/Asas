import { z } from 'zod'
import { idSchema, isoDateSchema } from '../primitives/ids.js'
import { currencyCodeSchema, decimalStringSchema } from '../primitives/money.js'

/** CSV columns are normalized client-side; amounts are signed in the statement's point of view. */
export const bankStatementRowInputSchema = z.object({
  postedAt: isoDateSchema,
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(200).nullable().optional(),
  currency: currencyCodeSchema,
  amount: decimalStringSchema.refine(value => value !== '0' && value !== '-0' && /[1-9]/.test(value), 'Statement amount must be non-zero'),
})

export const bankStatementImportRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(120),
  rows: z.array(bankStatementRowInputSchema).min(1).max(500),
})

export const bankStatementMatchCandidateSchema = z.object({
  journalLineId: idSchema,
  postedAt: z.string(),
  description: z.string(),
  sourceType: z.string(),
  currency: currencyCodeSchema,
  amount: decimalStringSchema,
  signedAmount: decimalStringSchema,
  daysApart: z.int().min(0),
})

export const bankStatementLineSchema = z.object({
  id: idSchema,
  postedAt: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
  currency: currencyCodeSchema,
  amount: decimalStringSchema,
  matchedJournalLineId: idSchema.nullable(),
  matchedLedgerLine: bankStatementMatchCandidateSchema.nullable(),
  suggestedMatches: z.array(bankStatementMatchCandidateSchema).max(10),
})

export const bankStatementImportSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  createdAt: z.string(),
  lineCount: z.int().min(0),
  matchedCount: z.int().min(0),
  lines: z.array(bankStatementLineSchema).max(500),
})

export const bankStatementImportListSchema = z.object({ items: z.array(bankStatementImportSchema) })

export const bankStatementMatchRequestSchema = z.object({ journalLineId: idSchema })

export type BankStatementRowInput = z.infer<typeof bankStatementRowInputSchema>
export type BankStatementImportRequest = z.infer<typeof bankStatementImportRequestSchema>
export type BankStatementImport = z.infer<typeof bankStatementImportSchema>
