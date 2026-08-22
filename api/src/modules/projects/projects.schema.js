import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  departmentId: z.string().optional(),
  budget: z.number().optional(),
  spent: z.number().default(0),
  timeline: z.string().optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).default('PLANNING'),
});

export const updateProjectSchema = projectSchema.partial();

export const sprintSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  projectId: z.string().optional(),
  endsAt: z.string().optional(),
  completionPct: z.number().min(0).max(100).default(0),
});

export const issueSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sprintId: z.string().optional(),
  key: z.string().optional(),
  tag: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).default('TODO'),
});
