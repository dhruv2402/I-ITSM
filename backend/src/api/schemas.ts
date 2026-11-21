import { z } from 'zod';
import { IncidentStatus, Priority, Role, SlaStatus } from '../domain/enums';

/** Input validation schemas (whitelisting: unknown fields are stripped). */
const level = z.coerce.number().int().min(1).max(4) as unknown as z.ZodType<1 | 2 | 3 | 4>;
const id = z.string().trim().min(1).max(40);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const registerSchema = z.object({
  name: text(2, 80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(20).optional(),
  department: z.string().trim().max(60).optional(),
});

export const loginSchema = z.object({ email: z.string().trim().max(120), password: z.string().max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().max(128), newPassword: z.string().max(128) });

export const analyzeSchema = z.object({
  title: z.string().max(120).default(''),
  description: z.string().max(4000).default(''),
  serviceId: id.optional(),
  impact: level.optional(),
  urgency: level.optional(),
  affectedUsers: z.coerce.number().int().min(1).max(1_000_000).optional(),
});

export const createIncidentSchema = z.object({
  title: text(5, 120),
  description: text(10, 4000),
  serviceId: id,
  categoryCode: z.string().trim().max(30).nullish(),
  impact: level,
  urgency: level,
  affectedUsers: z.coerce.number().int().min(1).max(1_000_000).default(1),
  confirmNotDuplicate: z.boolean().optional(),
});

export const updateIncidentSchema = z.object({
  title: text(5, 120).optional(),
  description: text(10, 4000).optional(),
  impact: level.optional(),
  urgency: level.optional(),
  affectedUsers: z.coerce.number().int().min(1).max(1_000_000).optional(),
});

const csv = <T extends string>(values: [T, ...T[]]) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)))
    .optional();

export const searchSchema = z.object({
  id: z.string().max(20).optional(),
  text: z.string().max(100).optional(),
  status: csv(Object.values(IncidentStatus) as [IncidentStatus, ...IncidentStatus[]]),
  priority: csv(Object.values(Priority) as [Priority, ...Priority[]]),
  categoryCode: z.string().max(30).optional(),
  serviceId: z.string().max(30).optional(),
  technicianId: z.string().max(20).optional(),
  reporterId: z.string().max(20).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  slaStatus: z.nativeEnum(SlaStatus).optional(),
  escalated: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  activeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy: z.enum(['createdAt', 'priority', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const classifySchema = z.object({ categoryCode: text(2, 30) });
export const assignSchema = z.object({ technicianId: id.optional() });
export const noteSchema = z.object({ text: text(2, 4000), kind: z.enum(['INVESTIGATION', 'COMMENT']).default('COMMENT') });
export const questionSchema = z.object({ text: text(5, 2000) });
export const resolveSchema = z.object({ summary: text(10, 4000), rootCause: z.string().trim().max(2000).default('') });
export const reasonSchema = z.object({ reason: text(5, 1000) });
export const closeSchema = z.object({ closureCode: z.string().trim().max(40).optional() });
export const feedbackSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') });
export const duplicateSchema = z.object({ parentId: id });

export const createUserSchema = registerSchema.extend({
  role: z.nativeEnum(Role),
  skills: z.array(z.string().max(30)).max(20).optional(),
  maxWorkload: z.coerce.number().int().min(1).max(50).optional(),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
});

export const updateUserSchema = z.object({
  name: text(2, 80).optional(),
  phone: z.string().trim().max(20).optional(),
  department: z.string().trim().max(60).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  skills: z.array(z.string().max(30)).max(20).optional(),
  maxWorkload: z.coerce.number().int().min(1).max(50).optional(),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
  available: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({ password: z.string().min(8).max(128) });
export const availabilitySchema = z.object({ available: z.boolean() });

export const serviceSchema = z.object({
  id: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  name: text(2, 80),
  description: z.string().trim().max(500).default(''),
  businessCriticality: level,
  ownerTeam: z.string().trim().max(60).default(''),
  userBase: z.coerce.number().int().min(0).max(10_000_000).default(0),
  dependsOn: z.array(z.string().max(20)).max(20).default([]),
  active: z.boolean().default(true),
});
export const serviceUpdateSchema = serviceSchema.omit({ id: true }).partial();

export const categorySchema = z.object({
  id: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,30}$/),
  name: text(2, 60),
  description: z.string().trim().max(500).default(''),
  keywords: z.array(z.string().max(40)).max(100).default([]),
  active: z.boolean().default(true),
});
export const categoryUpdateSchema = categorySchema.omit({ id: true }).partial();

export const slaPolicySchema = z.object({
  name: text(2, 80),
  priority: z.nativeEnum(Priority),
  serviceId: z.string().trim().max(20).nullable().default(null),
  responseMinutes: z.coerce.number().positive().max(100_000),
  resolutionMinutes: z.coerce.number().positive().max(500_000),
  warningThresholdPct: z.coerce.number().min(10).max(99).default(75),
  active: z.boolean().default(true),
});
export const slaPolicyUpdateSchema = slaPolicySchema.partial();

export const settingsSchema = z.object({
  assignmentStrategy: z.string().max(40).optional(),
  priorityStrategy: z.string().max(40).optional(),
});

export const auditQuerySchema = z.object({
  incidentId: z.string().max(20).optional(),
  userId: z.string().max(20).optional(),
  action: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
