import { z } from 'zod'

export const employeeWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  departmentId: z.string().cuid().optional().nullable(),
  managerId: z.string().cuid().optional().nullable(),
  status: z.enum(['ACTIVE', 'ON_LEAVE']).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  hiredAt: z.string().optional().nullable(),
  salary: z.number().nonnegative().optional().nullable(),
  equityOptions: z.number().int().nonnegative().optional().nullable(),
  band: z.string().max(64).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  employeeNumber: z.string().max(64).optional().nullable(),
  email: z.string().email().optional().nullable(),
})

export const departmentWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const candidateWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  stage: z.enum([
    'APPLIED',
    'SCREENING',
    'TECH_INTERVIEW',
    'FINAL_INTERVIEW',
    'OFFER_SENT',
    'HIRED',
    'REJECTED',
  ]).optional(),
  timeInStage: z.string().max(64).optional().nullable(),
  appliedAt: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  currentRole: z.string().max(200).optional().nullable(),
  experience: z.string().max(120).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable(),
  education: z.string().max(200).optional().nullable(),
  resumeUrl: z.string().optional().nullable(),
})

export const candidateStageSchema = z.object({
  stage: z.enum([
    'APPLIED',
    'SCREENING',
    'TECH_INTERVIEW',
    'FINAL_INTERVIEW',
    'OFFER_SENT',
    'HIRED',
    'REJECTED',
  ]),
  timeInStage: z.string().max(64).optional().nullable(),
})

export const leaveWriteSchema = z.object({
  employeeId: z.string().cuid(),
  type: z.enum(['VACATION', 'SICK', 'PERSONAL']),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
})

export const payrollLinePatchSchema = z.object({
  gross: z.number().optional(),
  deductions: z.number().optional(),
  net: z.number().optional(),
  baseSalary: z.number().optional().nullable(),
  missedDaysCount: z.number().int().optional().nullable(),
  missedDaysAmount: z.number().optional().nullable(),
  bonusLabel: z.string().optional().nullable(),
  bonusAmount: z.number().optional().nullable(),
})
