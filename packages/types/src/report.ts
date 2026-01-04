// packages/types/src/report.ts
import { z } from 'zod';
import { VisitStatus, VisitTag } from './visit';

export const DailyReportQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DailyReportQuery = z.infer<typeof DailyReportQuery>;

export const DailyVisitStatusCounts = z.object({
  QUEUED: z.number().int().nonnegative(),
  IN_PROGRESS: z.number().int().nonnegative(),
  DONE: z.number().int().nonnegative(),
});
export type DailyVisitStatusCounts = z.infer<typeof DailyVisitStatusCounts>;

export const DailyReport = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visitCountsByStatus: DailyVisitStatusCounts,
  totalRevenue: z.number().nonnegative(),
  procedureCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type DailyReport = z.infer<typeof DailyReport>;

export const DailyPatientSummary = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newPatients: z.number().int().nonnegative(),
  followupPatients: z.number().int().nonnegative(),
  zeroBilledVisits: z.number().int().nonnegative(),
  totalPatients: z.number().int().nonnegative(),
});
export type DailyPatientSummary = z.infer<typeof DailyPatientSummary>;

export const DailyPatientSummaryRangeQuery = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DailyPatientSummaryRangeQuery = z.infer<typeof DailyPatientSummaryRangeQuery>;

export const DailyPatientSummarySeries = z.object({
  points: z.array(DailyPatientSummary),
});
export type DailyPatientSummarySeries = z.infer<typeof DailyPatientSummarySeries>;

/**
 * ✅ Clinic-wide breakdown
 */
export const DailyVisitsBreakdownQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DailyVisitsBreakdownQuery = z.infer<typeof DailyVisitsBreakdownQuery>;

export const ClinicVisitBreakdownItem = z.object({
  visitId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: VisitStatus,
  tag: VisitTag.optional(),
  reason: z.string().optional(),
  billingAmount: z.number().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),

  patientId: z.string().min(1),
  patientName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientGender: z.string().optional(),
});
export type ClinicVisitBreakdownItem = z.infer<typeof ClinicVisitBreakdownItem>;

export const DailyVisitsBreakdownResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalVisits: z.number().int().nonnegative(),
  items: z.array(ClinicVisitBreakdownItem),
});
export type DailyVisitsBreakdownResponse = z.infer<typeof DailyVisitsBreakdownResponse>;

/**
 * ✅ Clinic-wide "recent completed visits"
 */
export const RecentCompletedQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type RecentCompletedQuery = z.infer<typeof RecentCompletedQuery>;

export const RecentCompletedItem = z.object({
  visitId: z.string().min(1),
  patientId: z.string().min(1),
  patientName: z.string().min(1),
  hasRx: z.boolean(),
  hasXray: z.boolean(),
});
export type RecentCompletedItem = z.infer<typeof RecentCompletedItem>;

export const RecentCompletedResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(RecentCompletedItem),
});
export type RecentCompletedResponse = z.infer<typeof RecentCompletedResponse>;
