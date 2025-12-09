// packages/types/src/report.ts
import { z } from 'zod';

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

// NEW: summary based on N/F/Z tags
export const DailyPatientSummary = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newPatients: z.number().int().nonnegative(),
  followupPatients: z.number().int().nonnegative(),
  zeroBilledVisits: z.number().int().nonnegative(),
  // Total patients for the header tile – here we count N + F + Z.
  totalPatients: z.number().int().nonnegative(),
});
export type DailyPatientSummary = z.infer<typeof DailyPatientSummary>;

// NEW: range query for a series of daily patient summaries
export const DailyPatientSummaryRangeQuery = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DailyPatientSummaryRangeQuery = z.infer<typeof DailyPatientSummaryRangeQuery>;

// NEW: time series of daily summaries
export const DailyPatientSummarySeries = z.object({
  points: z.array(DailyPatientSummary),
});
export type DailyPatientSummarySeries = z.infer<typeof DailyPatientSummarySeries>;
