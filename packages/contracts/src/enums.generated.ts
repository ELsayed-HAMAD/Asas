// AUTO-GENERATED — DO NOT EDIT.
//
// Source: apps/api/prisma/schema.prisma (see scripts/prisma-enums.ts).
// Regenerate with `pnpm --filter @asas/contracts generate:enums`.
//
// `enums.generated.test.ts` fails if this file no longer matches the Prisma schema, so a
// database enum change cannot silently diverge from the API contract.

import { z } from 'zod'

export const AttendanceExceptionTypeValues = [
  'MISSING_IN',
  'MISSING_OUT',
  'OVERTIME',
] as const satisfies readonly string[]

export const attendanceExceptionTypeSchema = z.enum(AttendanceExceptionTypeValues)

export type AttendanceExceptionType = z.infer<typeof attendanceExceptionTypeSchema>

export const CandidateStageValues = [
  'APPLIED',
  'SCREENING',
  'TECH_INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER_SENT',
  'HIRED',
  'REJECTED',
] as const satisfies readonly string[]

export const candidateStageSchema = z.enum(CandidateStageValues)

export type CandidateStage = z.infer<typeof candidateStageSchema>

export const DealActivityTypeValues = [
  'CALL',
  'EMAIL',
  'NOTE',
] as const satisfies readonly string[]

export const dealActivityTypeSchema = z.enum(DealActivityTypeValues)

export type DealActivityType = z.infer<typeof dealActivityTypeSchema>

export const DealStageValues = [
  'LEADS',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const satisfies readonly string[]

export const dealStageSchema = z.enum(DealStageValues)

export type DealStage = z.infer<typeof dealStageSchema>

export const EmployeeStatusValues = [
  'ACTIVE',
  'ON_LEAVE',
  'ARCHIVED',
] as const satisfies readonly string[]

export const employeeStatusSchema = z.enum(EmployeeStatusValues)

export type EmployeeStatus = z.infer<typeof employeeStatusSchema>

export const ExpenseCategoryValues = [
  'SOFTWARE',
  'TRAVEL',
  'MEALS',
  'OFFICE_SUPPLIES',
  'FACILITIES_LEASE',
  'PAYROLL',
  'MARKETING',
  'OTHER',
] as const satisfies readonly string[]

export const expenseCategorySchema = z.enum(ExpenseCategoryValues)

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>

export const ExpenseStatusValues = [
  'PENDING',
  'FLAGGED',
  'PROCESSING',
  'APPROVED',
  'REIMBURSED',
  'REJECTED',
  'VOID',
] as const satisfies readonly string[]

export const expenseStatusSchema = z.enum(ExpenseStatusValues)

export type ExpenseStatus = z.infer<typeof expenseStatusSchema>

export const ExportJobStatusValues = [
  'QUEUED',
  'RUNNING',
  'DONE',
  'FAILED',
] as const satisfies readonly string[]

export const exportJobStatusSchema = z.enum(ExportJobStatusValues)

export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>

export const IntegrationStatusValues = [
  'CONNECTED',
  'CONFIGURE',
  'DISCONNECTED',
] as const satisfies readonly string[]

export const integrationStatusSchema = z.enum(IntegrationStatusValues)

export type IntegrationStatus = z.infer<typeof integrationStatusSchema>

export const InterviewStatusValues = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly string[]

export const interviewStatusSchema = z.enum(InterviewStatusValues)

export type InterviewStatus = z.infer<typeof interviewStatusSchema>

export const IssuePriorityValues = [
  'LOW',
  'MEDIUM',
  'HIGH',
] as const satisfies readonly string[]

export const issuePrioritySchema = z.enum(IssuePriorityValues)

export type IssuePriority = z.infer<typeof issuePrioritySchema>

export const IssueStatusValues = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
] as const satisfies readonly string[]

export const issueStatusSchema = z.enum(IssueStatusValues)

export type IssueStatus = z.infer<typeof issueStatusSchema>

export const LeaveRequestStatusValues = [
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const satisfies readonly string[]

export const leaveRequestStatusSchema = z.enum(LeaveRequestStatusValues)

export type LeaveRequestStatus = z.infer<typeof leaveRequestStatusSchema>

export const LeaveTypeValues = [
  'VACATION',
  'SICK',
  'PERSONAL',
] as const satisfies readonly string[]

export const leaveTypeSchema = z.enum(LeaveTypeValues)

export type LeaveType = z.infer<typeof leaveTypeSchema>

export const LedgerTxStatusValues = [
  'CLEARED',
  'PROCESSING',
] as const satisfies readonly string[]

export const ledgerTxStatusSchema = z.enum(LedgerTxStatusValues)

export type LedgerTxStatus = z.infer<typeof ledgerTxStatusSchema>

export const MilestoneStateValues = [
  'PENDING',
  'CURRENT',
  'COMPLETED',
] as const satisfies readonly string[]

export const milestoneStateSchema = z.enum(MilestoneStateValues)

export type MilestoneState = z.infer<typeof milestoneStateSchema>

export const OnboardingStatusValues = [
  'PENDING',
  'EMPTY',
  'SAMPLE_LOADED',
  'IMPORTED',
] as const satisfies readonly string[]

export const onboardingStatusSchema = z.enum(OnboardingStatusValues)

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

export const PayableStatusValues = [
  'PENDING',
  'SCHEDULED',
  'APPROVED',
  'PAID',
  'REJECTED',
  'VOID',
] as const satisfies readonly string[]

export const payableStatusSchema = z.enum(PayableStatusValues)

export type PayableStatus = z.infer<typeof payableStatusSchema>

export const PayFrequencyValues = [
  'MONTHLY',
  'SEMIMONTHLY',
  'BIWEEKLY',
  'WEEKLY',
] as const satisfies readonly string[]

export const payFrequencySchema = z.enum(PayFrequencyValues)

export type PayFrequency = z.infer<typeof payFrequencySchema>

export const PayrollRunStatusValues = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'PAID',
  'VOID',
] as const satisfies readonly string[]

export const payrollRunStatusSchema = z.enum(PayrollRunStatusValues)

export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>

export const ProductStockStatusValues = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const satisfies readonly string[]

export const productStockStatusSchema = z.enum(ProductStockStatusValues)

export type ProductStockStatus = z.infer<typeof productStockStatusSchema>

export const ProjectStatusValues = [
  'PLANNING',
  'ON_TRACK',
  'DELAYED',
  'AT_RISK',
  'COMPLETED',
] as const satisfies readonly string[]

export const projectStatusSchema = z.enum(ProjectStatusValues)

export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const ReceivableStatusValues = [
  'CURRENT',
  'OVERDUE',
  'IN_COLLECTIONS',
  'PAID',
  'VOID',
] as const satisfies readonly string[]

export const receivableStatusSchema = z.enum(ReceivableStatusValues)

export type ReceivableStatus = z.infer<typeof receivableStatusSchema>

export const RecordStatusValues = [
  'ACTIVE',
  'ARCHIVED',
] as const satisfies readonly string[]

export const recordStatusSchema = z.enum(RecordStatusValues)

export type RecordStatus = z.infer<typeof recordStatusSchema>

export const RiskSeverityValues = [
  'LOW',
  'MEDIUM',
  'HIGH',
] as const satisfies readonly string[]

export const riskSeveritySchema = z.enum(RiskSeverityValues)

export type RiskSeverity = z.infer<typeof riskSeveritySchema>

export const SalaryBasisValues = [
  'ANNUAL',
  'MONTHLY',
] as const satisfies readonly string[]

export const salaryBasisSchema = z.enum(SalaryBasisValues)

export type SalaryBasis = z.infer<typeof salaryBasisSchema>

export const SprintStatusValues = [
  'ACTIVE',
  'COMPLETED',
] as const satisfies readonly string[]

export const sprintStatusSchema = z.enum(SprintStatusValues)

export type SprintStatus = z.infer<typeof sprintStatusSchema>

export const SubscriptionStatusValues = [
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
] as const satisfies readonly string[]

export const subscriptionStatusSchema = z.enum(SubscriptionStatusValues)

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

export const SupportTicketStatusValues = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const satisfies readonly string[]

export const supportTicketStatusSchema = z.enum(SupportTicketStatusValues)

export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>

export const UserRoleValues = [
  'OWNER',
  'ADMIN',
  'MEMBER',
] as const satisfies readonly string[]

export const userRoleSchema = z.enum(UserRoleValues)

export type UserRole = z.infer<typeof userRoleSchema>

/**
 * Every generated enum, keyed by its Prisma name. Used by the contract test and by any
 * caller that needs to enumerate enums generically (e.g. rendering a filter dropdown).
 */
export const prismaEnums = {
  AttendanceExceptionType: AttendanceExceptionTypeValues,
  CandidateStage: CandidateStageValues,
  DealActivityType: DealActivityTypeValues,
  DealStage: DealStageValues,
  EmployeeStatus: EmployeeStatusValues,
  ExpenseCategory: ExpenseCategoryValues,
  ExpenseStatus: ExpenseStatusValues,
  ExportJobStatus: ExportJobStatusValues,
  IntegrationStatus: IntegrationStatusValues,
  InterviewStatus: InterviewStatusValues,
  IssuePriority: IssuePriorityValues,
  IssueStatus: IssueStatusValues,
  LeaveRequestStatus: LeaveRequestStatusValues,
  LeaveType: LeaveTypeValues,
  LedgerTxStatus: LedgerTxStatusValues,
  MilestoneState: MilestoneStateValues,
  OnboardingStatus: OnboardingStatusValues,
  PayableStatus: PayableStatusValues,
  PayFrequency: PayFrequencyValues,
  PayrollRunStatus: PayrollRunStatusValues,
  ProductStockStatus: ProductStockStatusValues,
  ProjectStatus: ProjectStatusValues,
  ReceivableStatus: ReceivableStatusValues,
  RecordStatus: RecordStatusValues,
  RiskSeverity: RiskSeverityValues,
  SalaryBasis: SalaryBasisValues,
  SprintStatus: SprintStatusValues,
  SubscriptionStatus: SubscriptionStatusValues,
  SupportTicketStatus: SupportTicketStatusValues,
  UserRole: UserRoleValues,
} as const
