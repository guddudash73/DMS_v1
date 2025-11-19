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
