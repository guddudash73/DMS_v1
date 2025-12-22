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

export const DoctorPatientsCountPoint = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patients: z.number().int().nonnegative(),
});
export type DoctorPatientsCountPoint = z.infer<typeof DoctorPatientsCountPoint>;

export const DoctorPatientsCountSeries = z.object({
  points: z.array(DoctorPatientsCountPoint),
});
export type DoctorPatientsCountSeries = z.infer<typeof DoctorPatientsCountSeries>;

export const DailyVisitsBreakdownQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DailyVisitsBreakdownQuery = z.infer<typeof DailyVisitsBreakdownQuery>;

export const DailyVisitBreakdownItem = z.object({
  visitId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: VisitStatus,
  tag: VisitTag.optional(),
  reason: z.string(),
  billingAmount: z.number().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),

  patientId: z.string().min(1),
  patientName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientGender: z.string().optional(),

  doctorId: z.string().min(1),
  doctorName: z.string().min(1),
});
export type DailyVisitBreakdownItem = z.infer<typeof DailyVisitBreakdownItem>;

export const DailyVisitsBreakdownByDoctor = z.object({
  doctorId: z.string().min(1),
  doctorName: z.string().min(1),
  total: z.number().int().nonnegative(),
  items: z.array(DailyVisitBreakdownItem),
});
export type DailyVisitsBreakdownByDoctor = z.infer<typeof DailyVisitsBreakdownByDoctor>;

export const DailyVisitsBreakdownResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctors: z.array(DailyVisitsBreakdownByDoctor),
  totalVisits: z.number().int().nonnegative(),
});
export type DailyVisitsBreakdownResponse = z.infer<typeof DailyVisitsBreakdownResponse>;

export const DoctorDailyVisitsBreakdownQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DoctorDailyVisitsBreakdownQuery = z.infer<typeof DoctorDailyVisitsBreakdownQuery>;

export const DoctorDailyVisitBreakdownItem = z.object({
  visitId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: VisitStatus,
  tag: VisitTag.optional(),
  reason: z.string().optional(),
  billingAmount: z.number().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),

  patientName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientGender: z.string().optional(),
});
export type DoctorDailyVisitBreakdownItem = z.infer<typeof DoctorDailyVisitBreakdownItem>;

export const DoctorDailyVisitsBreakdownResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().min(1),
  doctorName: z.string().min(1),
  totalVisits: z.number().int().nonnegative(),
  items: z.array(DoctorDailyVisitBreakdownItem),
});
export type DoctorDailyVisitsBreakdownResponse = z.infer<typeof DoctorDailyVisitsBreakdownResponse>;

export const DoctorRecentVisitsQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type DoctorRecentVisitsQuery = z.infer<typeof DoctorRecentVisitsQuery>;

export const DoctorRecentVisitItem = z.object({
  visitId: z.string().min(1),
  patientId: z.string().min(1),
  patientName: z.string().min(1),
  hasRx: z.boolean(),
  hasXray: z.boolean(),
});
export type DoctorRecentVisitItem = z.infer<typeof DoctorRecentVisitItem>;

export const DoctorRecentVisitsResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().min(1),
  items: z.array(DoctorRecentVisitItem),
});
export type DoctorRecentVisitsResponse = z.infer<typeof DoctorRecentVisitsResponse>;

export const DoctorRecentCompletedQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type DoctorRecentCompletedQuery = z.infer<typeof DoctorRecentCompletedQuery>;

export const DoctorRecentCompletedItem = z.object({
  visitId: z.string().min(1),
  patientId: z.string().min(1),
  patientName: z.string().min(1),
  hasRx: z.boolean(),
  hasXray: z.boolean(),
});
export type DoctorRecentCompletedItem = z.infer<typeof DoctorRecentCompletedItem>;

export const DoctorRecentCompletedResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().min(1),
  items: z.array(DoctorRecentCompletedItem),
});
export type DoctorRecentCompletedResponse = z.infer<typeof DoctorRecentCompletedResponse>;
